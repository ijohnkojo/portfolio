/**
 * Tab completion. Pure: directory listing arrives as a function, so this is
 * tested in bare node against a stub and the line editor stays a keystroke
 * machine that knows nothing about the filesystem (D-022).
 *
 * Behaviour follows bash closely enough not to surprise:
 *
 *   - one candidate  → complete it outright; directories gain a trailing `/`
 *                      so you can keep going, everything else gains a space
 *   - several        → extend to their longest common prefix
 *   - nothing added  → return the candidates for the host to print
 *
 * That last rule is why there is no double-tap tracking: the first Tab on an
 * ambiguous prefix changes nothing, so the second lists. Same outcome, no state.
 */
import { resolvePath } from '@/os/kernel'
import { lastUnquotedPipe } from './pipeline'

export interface CompletionEntry {
  name: string
  isDir: boolean
}

export interface CompletionContext {
  buffer: string
  cursor: number
  cwd: string
  commands: readonly string[]
  listDir: (path: string) => CompletionEntry[]
}

export interface CompletionResult {
  buffer: string
  cursor: number
  /** Populated only when the line could not be advanced. */
  suggestions: string[]
}

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return ''

  let prefix = values[0]
  for (const value of values.slice(1)) {
    let i = 0
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++
    prefix = prefix.slice(0, i)
    if (prefix === '') break
  }
  return prefix
}

/** The word being completed: from the last whitespace before the cursor. */
function tokenBounds(buffer: string, cursor: number): { start: number; token: string } {
  let start = cursor
  while (start > 0 && !/\s/.test(buffer[start - 1])) start--
  return { start, token: buffer.slice(start, cursor) }
}

interface Candidate {
  /** What replaces the token. */
  replacement: string
  /** What to show when listing. */
  display: string
}

function completeCommands(token: string, commands: readonly string[]): Candidate[] {
  return commands
    .filter((name) => name.startsWith(token))
    .sort()
    .map((name) => ({ replacement: `${name} `, display: name }))
}

function completePath(token: string, ctx: CompletionContext): Candidate[] {
  const slash = token.lastIndexOf('/')
  const dirPart = slash === -1 ? '' : token.slice(0, slash + 1)
  const base = slash === -1 ? token : token.slice(slash + 1)

  const entries = ctx.listDir(resolvePath(ctx.cwd, dirPart === '' ? '.' : dirPart))

  return entries
    .filter((entry) => entry.name.startsWith(base))
    // Dotfiles only surface once you have asked for one, as elsewhere.
    .filter((entry) => base.startsWith('.') || !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      replacement: `${dirPart}${entry.name}${entry.isDir ? '/' : ' '}`,
      display: entry.isDir ? `${entry.name}/` : entry.name,
    }))
}

export function complete(ctx: CompletionContext): CompletionResult {
  const { buffer, cursor } = ctx
  const unchanged = { buffer, cursor, suggestions: [] as string[] }

  const { start, token } = tokenBounds(buffer, cursor)

  // A command name is expected at the start of the line and again after each
  // pipe; everywhere else the word is a path.
  const before = buffer.slice(0, start)
  const isCommandPosition = before.slice(lastUnquotedPipe(before) + 1).trim() === ''

  const candidates = isCommandPosition
    ? completeCommands(token, ctx.commands)
    : completePath(token, ctx)

  if (candidates.length === 0) return unchanged

  const replacement =
    candidates.length === 1
      ? candidates[0].replacement
      : longestCommonPrefix(candidates.map((c) => c.replacement))

  // Splice, so completing mid-line keeps whatever follows the cursor.
  if (replacement.length > token.length) {
    return {
      buffer: buffer.slice(0, start) + replacement + buffer.slice(cursor),
      cursor: start + replacement.length,
      suggestions: [],
    }
  }

  return { ...unchanged, suggestions: candidates.map((c) => c.display) }
}
