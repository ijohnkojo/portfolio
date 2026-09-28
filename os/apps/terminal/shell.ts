/**
 * Dispatch and execute. Pure — no xterm, no React.
 *
 * xterm is one possible *device* attached to this; the shell has no idea it
 * exists. That is what lets every command be tested in bare node.
 *
 * Parsing lives next door in `pipeline.ts`. This file is what happens after:
 * run each stage with the previous stage's output as its input, and either
 * print the last one or write it to a file.
 */
import { resolvePath } from '@/os/kernel'
import {
  CommandError,
  commands,
  type CommandResult,
  type ShellContext,
} from './commands'
import {
  findUnsupportedOperator,
  parsePipeline,
  tokenize,
  type Pipeline,
  type Redirect,
} from './pipeline'

export interface ShellResult {
  output: string[]
  cwd: string
  clear: boolean
  reset: boolean
}

/** The message from anything thrown, without assuming it is an Error. */
function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Send a pipeline's output to a file, returning an error line or null.
 *
 * The kernel's errno-shaped messages are translated the way `rm` translates
 * EROFS: a reader can act on "Is a directory" and cannot act on "EISDIR". The
 * parent is checked first because the store reports a missing parent and a
 * parent that is a file with the same error, and those want different words.
 *
 * Redirecting onto published content is deliberately allowed — the write lands
 * in the overlay as an edit, and `rm` reverts it ([D-027](../../docs/decisions.md)).
 */
function writeRedirect(
  ctx: ShellContext,
  redirect: Redirect,
  output: string[]
): string | null {
  const path = resolvePath(ctx.cwd, redirect.path)
  const parent = ctx.kernel.fs.stat(resolvePath(path, '..'))

  if (!parent) return `cannot write ${path}: No such file or directory`
  if (parent.type !== 'dir') return `cannot write ${path}: Not a directory`

  // A shell writes lines, so every line gets its terminator — but no output at
  // all means an empty file, not a lone newline.
  const text = output.length === 0 ? '' : `${output.join('\n')}\n`

  try {
    const existing = redirect.append ? (ctx.kernel.fs.read(path) ?? '') : ''
    ctx.kernel.fs.write(path, existing + text)
  } catch (error) {
    const detail = detailOf(error)
    if (detail.startsWith('EISDIR')) return `cannot write ${path}: Is a directory`
    return `cannot write ${path}: ${detail}`
  }
  return null
}

export function runCommand(line: string, ctx: ShellContext): ShellResult {
  /** Everything a failure leaves untouched. */
  const unchanged = { cwd: ctx.cwd, clear: false, reset: false }

  const unsupported = findUnsupportedOperator(line)
  if (unsupported) {
    return {
      output: [`${unsupported}: not supported — this shell has only | > and >>`],
      ...unchanged,
    }
  }

  let pipeline: Pipeline
  try {
    pipeline = parsePipeline(line)
  } catch (error) {
    return { output: [detailOf(error)], ...unchanged }
  }

  if (pipeline.stages.length === 0) return { output: [], ...unchanged }

  let output: string[] = []
  let last: CommandResult = {}

  for (const [index, stage] of pipeline.stages.entries()) {
    const [name, ...args] = stage.tokens
    const command = commands[name]

    if (!command) {
      return { output: [`${name}: command not found — try 'help'`], ...unchanged }
    }

    let result: CommandResult
    try {
      // Every stage runs against the cwd the line started in. `cd /x | wc` is
      // nonsense, so only the final stage's cwd is kept, below.
      result = command.run(
        { ...ctx, stdin: index === 0 ? ctx.stdin : output },
        args
      )
    } catch (error) {
      // CommandError is an expected failure with a message already in UNIX
      // shape. Anything else is a bug, and saying so beats printing a bare
      // stack. Either way the pipeline stops: a stage that failed has no output
      // worth feeding to the next one.
      if (error instanceof CommandError) {
        return { output: [error.message], ...unchanged }
      }
      return { output: [`${name}: internal error: ${detailOf(error)}`], ...unchanged }
    }

    output = result.output ?? []
    last = result
  }

  // `clear`, `reset`, and a changed cwd are honoured from the final stage only,
  // for the same reason its cwd is: the earlier stages are producing text.
  const finished = {
    cwd: last.cwd ?? ctx.cwd,
    clear: last.clear ?? false,
    reset: last.reset ?? false,
  }

  if (pipeline.redirect) {
    const error = writeRedirect(ctx, pipeline.redirect, output)
    return error ? { output: [error], ...unchanged } : { output: [], ...finished }
  }

  return { output, ...finished }
}

export { commands, findUnsupportedOperator, tokenize }
export type { ShellContext }
