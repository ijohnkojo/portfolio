/**
 * Tokenise, dispatch, format errors. Pure — no xterm, no React.
 *
 * xterm is one possible *device* attached to this; the shell has no idea it
 * exists. That is what lets every command be tested in bare node.
 */
import {
  CommandError,
  commands,
  type CommandResult,
  type ShellContext,
} from './commands'

export interface ShellResult {
  output: string[]
  cwd: string
  clear: boolean
  reset: boolean
}

/**
 * Split a line into words, honouring single and double quotes so a path with a
 * space works. No expansion, no globbing, no piping — design doc §2 calls
 * those a scope-creep magnet, and it is right.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (const char of line) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += char
    started = true
  }

  if (started) tokens.push(current)
  return tokens
}

/**
 * Operators this shell does not implement. Longest first, so `||` is found
 * before `|` and `>>` before `>`.
 */
const UNSUPPORTED_OPERATORS = ['&&', '||', '>>', '2>', '|', '>', '<'] as const

/**
 * Find an unquoted shell operator, or null.
 *
 * Quoted operators are ordinary text — `echo "a | b"` is a legitimate thing to
 * type and must keep working. Without this check the operator is swallowed as
 * an argument, so `ls | wc` reports `ls: |: No such file or directory`, which
 * sends you looking for a file rather than telling you what is actually wrong.
 */
export function findUnquotedOperator(line: string): string | null {
  let quote: '"' | "'" | null = null

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    for (const operator of UNSUPPORTED_OPERATORS) {
      if (line.startsWith(operator, i)) return operator
    }
  }
  return null
}

export function runCommand(line: string, ctx: ShellContext): ShellResult {
  const operator = findUnquotedOperator(line)
  if (operator) {
    return {
      output: [`${operator}: not supported — this shell has no piping or redirection`],
      cwd: ctx.cwd,
      clear: false,
      reset: false,
    }
  }

  const tokens = tokenize(line)

  if (tokens.length === 0) {
    return { output: [], cwd: ctx.cwd, clear: false, reset: false }
  }

  const [name, ...args] = tokens
  const command = commands[name]

  if (!command) {
    return {
      output: [`${name}: command not found — try 'help'`],
      cwd: ctx.cwd,
      clear: false,
      reset: false,
    }
  }

  let result: CommandResult
  try {
    result = command.run(ctx, args)
  } catch (error) {
    // CommandError is an expected failure with a message already in UNIX shape.
    // Anything else is a bug, and saying so beats printing a bare stack.
    if (error instanceof CommandError) {
      return { output: [error.message], cwd: ctx.cwd, clear: false, reset: false }
    }
    const detail = error instanceof Error ? error.message : String(error)
    return {
      output: [`${name}: internal error: ${detail}`],
      cwd: ctx.cwd,
      clear: false,
      reset: false,
    }
  }

  return {
    output: result.output ?? [],
    cwd: result.cwd ?? ctx.cwd,
    clear: result.clear ?? false,
    reset: result.reset ?? false,
  }
}

export { commands }
export type { ShellContext }
