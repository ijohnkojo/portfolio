/**
 * Turning a line into a pipeline: stages separated by `|`, with an optional
 * `> file` or `>> file` at the end.
 *
 * Pure — no filesystem, no dispatch, no DOM. The parser is where the bugs in a
 * feature like this live, so it is a module with its own tests rather than a
 * branch inside `runCommand`.
 *
 * Exactly `|`, `>` and `>>` ([D-029](../../docs/decisions.md)). Every other
 * operator a shell might have — `<`, `2>`, `&&`, `||` — is rejected by
 * `findUnsupportedOperator` before this runs, so the scan below never has to
 * consider them. Call `parsePipeline` on a line that still contains one and it
 * will produce a syntax error rather than anything sensible.
 */
import { CommandError } from './commands/types'

export interface Stage {
  tokens: string[]
}

export interface Redirect {
  /** As typed. Relative paths resolve against the cwd when the line is run. */
  path: string
  append: boolean
}

export interface Pipeline {
  /** Empty for a blank line — the one case that is not an error. */
  stages: Stage[]
  redirect?: Redirect
}

/** The three operators this shell implements. */
type Operator = '|' | '>' | '>>'

/**
 * Split a line into words, honouring single and double quotes so a path with a
 * space works. No expansion, no globbing, no variables — design doc §2 calls
 * those a scope-creep magnet, and it is still right about those.
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
 * before anything shorter could be.
 */
const UNSUPPORTED_OPERATORS = ['&&', '||', '2>', '<'] as const

/**
 * Find an unquoted operator this shell does not implement, or null.
 *
 * Quoted operators are ordinary text — `echo "a && b"` is a legitimate thing to
 * type and must keep working. Without this check the operator is swallowed as
 * an argument, so `ls && pwd` reports `ls: &&: No such file or directory`,
 * which sends you looking for a file rather than telling you what is actually
 * wrong.
 */
export function findUnsupportedOperator(line: string): string | null {
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

/**
 * Index of the last unquoted `|`, or -1. Tab completion needs it: the word
 * after a pipe is a command name, not a path.
 */
export function lastUnquotedPipe(line: string): number {
  let quote: '"' | "'" | null = null
  let found = -1

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
    if (char === '|') found = i
  }
  return found
}

/**
 * Cut the line at each unquoted operator. Quote characters are kept in the
 * segments so `tokenize` can strip them itself — one place that knows what a
 * quote means rather than two.
 *
 * `operators[i]` is what terminated `segments[i]`, so there is always exactly
 * one more segment than operator.
 */
function split(line: string): { segments: string[]; operators: Operator[] } {
  const segments: string[] = []
  const operators: Operator[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '|' || char === '>') {
      const append = char === '>' && line[i + 1] === '>'
      segments.push(current)
      operators.push(append ? '>>' : (char as Operator))
      current = ''
      if (append) i++
      continue
    }
    current += char
  }

  segments.push(current)
  return { segments, operators }
}

function syntaxError(detail: string): never {
  throw new CommandError(`syntax error: ${detail}`)
}

export function parsePipeline(line: string): Pipeline {
  const { segments, operators } = split(line)

  // The common case, and the only one where an empty line is legal rather than
  // a missing command.
  if (operators.length === 0) {
    const tokens = tokenize(segments[0])
    return { stages: tokens.length === 0 ? [] : [{ tokens }] }
  }

  // A redirect consumes everything after it, so anything following one is text
  // that would never be read.
  for (const operator of operators.slice(0, -1)) {
    if (operator !== '|') syntaxError("'>' must come last")
  }

  const last = operators[operators.length - 1]
  const stageSegments = [...segments]
  let redirect: Redirect | undefined

  if (last !== '|') {
    const target = tokenize(stageSegments.pop()!)
    if (target.length === 0) syntaxError(`expected a file after '${last}'`)
    if (target.length > 1) syntaxError(`'${last}' takes one file`)
    redirect = { path: target[0], append: last === '>>' }
  }

  const stages = stageSegments.map((segment, index) => {
    const tokens = tokenize(segment)
    if (tokens.length > 0) return { tokens }

    // Which operator is missing its command depends on where the hole is: a
    // hole at the head is a line that starts with an operator, anywhere else is
    // a pipe with nothing after it.
    if (index > 0) syntaxError("expected a command after '|'")
    syntaxError(
      operators[0] === '|' ? "unexpected '|'" : `expected a command before '${operators[0]}'`
    )
  })

  return { stages, redirect }
}
