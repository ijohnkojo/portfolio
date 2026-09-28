/**
 * Shell history, stored as a file in the VFS rather than in its own store.
 *
 * The write overlay already persists (D-003), so history rides machinery that
 * exists instead of adding a parallel one. It is also more honest to the
 * design: `cat /home/.history` works, which is what a user of a UNIX-shaped
 * system would reach for.
 */
import { MAX_HISTORY } from './lineEditor'

export const HISTORY_PATH = '/home/.history'

/**
 * One command per line, oldest first. Blank lines are dropped, so a truncated
 * or hand-edited file degrades to "fewer entries" rather than to an error.
 */
export function parseHistory(text: string | null): string[] {
  if (!text) return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(-MAX_HISTORY)
}

export function serializeHistory(entries: readonly string[]): string {
  return entries.slice(-MAX_HISTORY).join('\n') + '\n'
}
