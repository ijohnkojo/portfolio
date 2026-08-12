/**
 * The command table.
 *
 * Every command is a plain function over the syscall boundary and a working
 * directory — no xterm, no React, no DOM. That is what makes the whole shell
 * testable in a bare node environment, and it is the same mechanism/policy
 * split the kernel uses one level up.
 *
 * Path handling reuses `resolvePath`/`resolve` from kernel/vfs.ts. Those were
 * written for exactly this; a second implementation here would drift.
 */
import { basename, resolvePath, type KernelAPI, type VFSNode } from '@/kernel'

export interface ShellContext {
  kernel: KernelAPI
  cwd: string
  /** The terminal's own pid, so `ps` can mark it and `kill` can target it. */
  pid: number
  /**
   * Which app opens a given mime type. Injected rather than imported: the
   * mapping lives on the manifests, and importing the registry here would drag
   * `next/dynamic` into a module that is meant to run in bare node.
   */
  resolveHandler?: (mime: string) => string | null
}

export interface CommandResult {
  output?: string[]
  /** Set when the command changed directory. */
  cwd?: string
  /** `clear` asks the host to wipe the screen. */
  clear?: boolean
  /** `reset` asks the host to drop persisted state and reload. */
  reset?: boolean
}

export interface Command {
  name: string
  usage: string
  summary: string
  run: (ctx: ShellContext, args: string[]) => CommandResult
}

/** Thrown by commands for expected failures; the dispatcher formats these. */
export class CommandError extends Error {}

function fail(command: string, message: string): never {
  throw new CommandError(`${command}: ${message}`)
}

function statOrFail(ctx: ShellContext, command: string, path: string): VFSNode {
  const node = ctx.kernel.fs.stat(path)
  if (!node) fail(command, `${path}: No such file or directory`)
  return node
}

/** `dir/`, `app*`, plain file — the marker carries the type without a flag. */
function decorate(node: VFSNode): string {
  if (node.type === 'dir') return `${node.name}/`
  if (node.type === 'app') return `${node.name}*`
  return node.name
}

const ls: Command = {
  name: 'ls',
  usage: 'ls [-a] [path]',
  summary: 'list directory contents',
  run: (ctx, args) => {
    const showAll = args.includes('-a')
    const operand = args.find((a) => !a.startsWith('-'))
    const target = resolvePath(ctx.cwd, operand ?? '.')
    const node = statOrFail(ctx, 'ls', target)

    if (node.type !== 'dir') return { output: [decorate(node)] }

    // Dotfiles stay hidden without -a, as they would anywhere else. `.history`
    // lives in /home and would otherwise be in the way constantly.
    const children = ctx.kernel.fs
      .list(target)
      .filter((child) => showAll || !child.name.startsWith('.'))

    if (children.length === 0) return { output: [] }

    return {
      output: [...children]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(decorate),
    }
  },
}

const cd: Command = {
  name: 'cd',
  usage: 'cd [path]',
  summary: 'change the working directory',
  run: (ctx, args) => {
    const target = resolvePath(ctx.cwd, args[0] ?? '/')
    const node = statOrFail(ctx, 'cd', target)
    if (node.type !== 'dir') fail('cd', `${target}: Not a directory`)
    return { cwd: target }
  },
}

const pwd: Command = {
  name: 'pwd',
  usage: 'pwd',
  summary: 'print the working directory',
  run: (ctx) => ({ output: [ctx.cwd] }),
}

const cat: Command = {
  name: 'cat',
  usage: 'cat <path...>',
  summary: 'print file contents',
  run: (ctx, args) => {
    if (args.length === 0) fail('cat', 'missing operand')

    const output: string[] = []
    for (const arg of args) {
      const target = resolvePath(ctx.cwd, arg)
      const node = statOrFail(ctx, 'cat', target)

      if (node.type === 'dir') fail('cat', `${target}: Is a directory`)
      if (node.type === 'app') fail('cat', `${target}: Is an application`)

      const content = ctx.kernel.fs.read(target)
      if (content === null) {
        // An asset-backed node: the bytes live in /public, not in the VFS.
        fail('cat', `${target}: binary or external file (src: ${node.src ?? 'unknown'})`)
      }
      output.push(...content.split('\n'))
    }
    return { output }
  },
}

const open: Command = {
  name: 'open',
  usage: 'open <path>',
  summary: 'launch an application',
  run: (ctx, args) => {
    if (args.length === 0) fail('open', 'missing operand')

    const target = resolvePath(ctx.cwd, args[0])
    const node = statOrFail(ctx, 'open', target)

    if (node.type === 'app') {
      // Topmost instance, not the lowest pid — the one last looked at.
      const running = ctx.kernel.proc
        .list()
        .filter((p) => p.appId === node.appId)
        .sort((a, b) => b.zIndex - a.zIndex)[0]
      if (running) {
        ctx.kernel.proc.focus(running.pid)
        return { output: [`${node.appId}: already running as pid ${running.pid}`] }
      }
      const pid = ctx.kernel.proc.spawn(node.appId, [], node.name)
      return { output: [`${node.appId}: started as pid ${pid}`] }
    }

    if (node.type === 'dir') fail('open', `${target}: Is a directory`)

    // A file: hand it to whichever app declared it in its manifest. Unlike an
    // app node, a second copy is fine — two viewers on two files is normal.
    const handler = ctx.resolveHandler?.(node.mime) ?? null
    if (!handler) fail('open', `no application registered for ${node.mime} — try 'cat'`)

    const pid = ctx.kernel.proc.spawn(handler, [target], basename(target))
    return { output: [`${handler}: opened ${target} as pid ${pid}`] }
  },
}

const ps: Command = {
  name: 'ps',
  usage: 'ps',
  summary: 'list running processes',
  run: (ctx) => {
    const processes = ctx.kernel.proc.list()
    const rows = processes.map((p) => ({
      pid: String(p.pid),
      app: p.appId,
      state: p.state,
      title: p.pid === ctx.pid ? `${p.title} (this terminal)` : p.title,
    }))

    const width = (key: keyof (typeof rows)[number], header: string) =>
      Math.max(header.length, ...rows.map((r) => r[key].length))

    const w = {
      pid: width('pid', 'PID'),
      app: width('app', 'APP'),
      state: width('state', 'STATE'),
    }

    const line = (pid: string, app: string, state: string, title: string) =>
      `${pid.padEnd(w.pid)}  ${app.padEnd(w.app)}  ${state.padEnd(w.state)}  ${title}`

    return {
      output: [
        line('PID', 'APP', 'STATE', 'TITLE'),
        ...rows.map((r) => line(r.pid, r.app, r.state, r.title)),
      ],
    }
  },
}

const kill: Command = {
  name: 'kill',
  usage: 'kill <pid>',
  summary: 'terminate a process',
  run: (ctx, args) => {
    if (args.length === 0) fail('kill', 'missing operand')

    const pid = Number(args[0])
    if (!Number.isInteger(pid)) fail('kill', `${args[0]}: arguments must be process ids`)
    if (!ctx.kernel.proc.list().some((p) => p.pid === pid)) {
      fail('kill', `(${pid}): No such process`)
    }

    ctx.kernel.proc.kill(pid)
    return { output: pid === ctx.pid ? [] : [`killed ${pid}`] }
  },
}

const echo: Command = {
  name: 'echo',
  usage: 'echo [args...]',
  summary: 'print arguments',
  run: (_ctx, args) => ({ output: [args.join(' ')] }),
}

const clear: Command = {
  name: 'clear',
  usage: 'clear',
  summary: 'clear the screen',
  run: () => ({ clear: true }),
}

const reset: Command = {
  name: 'reset',
  usage: 'reset',
  summary: 'discard the saved session and reload',
  run: () => ({
    output: ['clearing saved session…'],
    reset: true,
  }),
}

const help: Command = {
  name: 'help',
  usage: 'help',
  summary: 'list available commands',
  run: () => {
    const entries = Object.values(commands).sort((a, b) => a.name.localeCompare(b.name))
    const width = Math.max(...entries.map((c) => c.usage.length))
    return {
      output: [
        'Commands:',
        ...entries.map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`),
        '',
        'No piping or redirection — see the design doc.',
      ],
    }
  },
}

export const commands: Record<string, Command> = Object.fromEntries(
  [ls, cd, pwd, cat, open, ps, kill, echo, clear, reset, help].map((c) => [c.name, c])
)
