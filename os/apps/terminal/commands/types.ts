/**
 * Shared shape for every command.
 *
 * Commands are plain functions over the syscall boundary and a working
 * directory — no xterm, no React, no DOM — which is what lets the whole shell
 * be tested in a bare node environment.
 */
import { resolvePath, type KernelAPI, type VFSNode } from '@/os/kernel'

export interface ShellContext {
  kernel: KernelAPI
  cwd: string
  /** The terminal's own pid, so `ps` can mark it and `kill`/`exit` can target it. */
  pid: number
  /**
   * Which app opens a given mime type. Injected rather than imported: the
   * mapping lives on the manifests, and importing the registry here would drag
   * `next/dynamic` into a module that is meant to run in bare node.
   */
  resolveHandler?: (mime: string) => string | null
  /**
   * The previous stage's output, when this command is part of a pipeline
   * ([D-029](../../../docs/decisions.md)). A command reads it only when it was
   * given no path, and one that has no use for it simply never looks — as in
   * bash, where `pwd` in a pipeline is not an error.
   */
  stdin?: string[]
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
  /** One line. `help` prints these. */
  summary: string
  /**
   * The long form, printed by `man`. Kept next to the command rather than in a
   * separate manual, for the same reason `help` is generated from the table:
   * documentation that lives elsewhere drifts.
   */
  description: string
  examples?: string[]
  run: (ctx: ShellContext, args: string[]) => CommandResult
}

/** Thrown for expected failures; the dispatcher formats these into one line. */
export class CommandError extends Error {}

export function fail(command: string, message: string): never {
  throw new CommandError(`${command}: ${message}`)
}

export function statOrFail(ctx: ShellContext, command: string, path: string): VFSNode {
  const node = ctx.kernel.fs.stat(path)
  if (!node) fail(command, `${path}: No such file or directory`)
  return node
}

/** File text, or a clear failure for directories, apps, and asset-backed nodes. */
export function readOrFail(ctx: ShellContext, command: string, path: string): string {
  const node = statOrFail(ctx, command, path)

  if (node.type === 'dir') fail(command, `${path}: Is a directory`)
  if (node.type === 'app') fail(command, `${path}: Is an application`)

  const content = ctx.kernel.fs.read(path)
  if (content === null) {
    fail(command, `${path}: binary or external file (src: ${node.src ?? 'unknown'})`)
  }
  return content
}

/** `dir/`, `app*`, plain file — the marker carries the type without a flag. */
export function decorate(node: VFSNode): string {
  if (node.type === 'dir') return `${node.name}/`
  if (node.type === 'app') return `${node.name}*`
  return node.name
}

/**
 * Pull `-n 20` style options out of the arguments, returning the value and the
 * remaining operands. Nothing here supports combined short flags — this is a
 * shell for browsing a portfolio, not a POSIX implementation.
 */
export function takeNumberFlag(
  args: string[],
  flag: string,
  fallback: number
): { value: number; rest: string[] } {
  const index = args.indexOf(flag)
  if (index === -1) return { value: fallback, rest: args }

  const raw = Number(args[index + 1])
  const value = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback
  return { value, rest: [...args.slice(0, index), ...args.slice(index + 2)] }
}

export function takeFlag(args: string[], flag: string): { present: boolean; rest: string[] } {
  const present = args.includes(flag)
  return { present, rest: args.filter((arg) => arg !== flag) }
}

/** Operands are everything that isn't a flag. */
export function operands(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith('-'))
}

/**
 * File contents as lines. **A trailing newline terminates the last line; it
 * does not begin an empty one** — which is what every UNIX tool means by a
 * line, and what `\n`-terminated output from a redirect makes load-bearing:
 * without this, `ls > f` then `cat f` shows a blank line that is not in the
 * listing, and `wc f` counts one more line than `ls | wc` does.
 */
export function toLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * The lines to work on: the contents of the operands, or standard input when
 * there are none.
 *
 * **A path always wins.** That is how a real shell behaves, and it means
 * reading a pipe needs no flag — the absence of an argument is the signal.
 * With neither, the command is missing an operand as it always was.
 */
export function readInput(ctx: ShellContext, command: string, args: string[]): string[] {
  const paths = operands(args)

  if (paths.length === 0) {
    if (ctx.stdin) return ctx.stdin
    fail(command, 'missing operand')
  }

  return paths.flatMap((arg) => toLines(readOrFail(ctx, command, resolvePath(ctx.cwd, arg))))
}
