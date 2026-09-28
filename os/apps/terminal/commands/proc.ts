/**
 * Process and application commands.
 */
import { basename, resolvePath } from '@/os/kernel'
import { fail, statOrFail, type Command } from './types'

export const open: Command = {
  name: 'open',
  usage: 'open <path>',
  summary: 'launch an application',
  description:
    'Opens a node. An application under /apps is started, or focused if it is already running. A file is handed to whichever application declared its mime type, with the path as its argument.',
  examples: ['open /apps/sysinfo', 'open /papers/paper-one/index.mdx'],
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

export const ps: Command = {
  name: 'ps',
  usage: 'ps',
  summary: 'list running processes',
  description:
    'Lists every open window as a process: its pid, the application behind it, its window state, and its title.',
  run: (ctx) => {
    const rows = ctx.kernel.proc.list().map((p) => ({
      pid: String(p.pid),
      app: p.appId,
      state: p.state,
      title: p.pid === ctx.pid ? `${p.title} (this terminal)` : p.title,
    }))

    const width = (key: keyof (typeof rows)[number], header: string) =>
      Math.max(header.length, ...rows.map((r) => r[key].length))

    const w = { pid: width('pid', 'PID'), app: width('app', 'APP'), state: width('state', 'STATE') }
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

export const kill: Command = {
  name: 'kill',
  usage: 'kill <pid>',
  summary: 'terminate a process',
  description:
    'Closes the window with the given pid. Killing this terminal is allowed, and is what exit does.',
  examples: ['kill 2'],
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

export const exit: Command = {
  name: 'exit',
  usage: 'exit',
  summary: 'close this terminal',
  description: 'Closes this terminal window. Ctrl+D on an empty line does the same.',
  run: (ctx) => {
    ctx.kernel.proc.kill(ctx.pid)
    return { output: [] }
  },
}
