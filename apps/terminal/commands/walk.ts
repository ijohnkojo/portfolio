/**
 * Recursive tree walk, shared by `grep`, `find`, `tags`, and `tree`.
 *
 * Children are sorted by name so output is deterministic — which is what makes
 * these commands testable by comparing whole result arrays.
 */
import { join, type VFSNode } from '@/kernel'
import type { ShellContext } from './types'

export interface WalkEntry {
  path: string
  node: VFSNode
  /** 0 for the children of the starting directory. */
  depth: number
  /** Last among its siblings — `tree` needs it to close a branch with └. */
  isLast: boolean
  /**
   * Whether each ancestor was last among *its* siblings, outermost first.
   * `tree` uses it to stop drawing │ down a branch that has already finished.
   */
  ancestorIsLast: boolean[]
}

export interface WalkOptions {
  /** Include dot-prefixed entries. Off by default, as in `ls`. */
  includeHidden?: boolean
  /** Stop descending past this depth. */
  maxDepth?: number
}

/**
 * Yields every descendant of `root`, depth-first, parents before children.
 * The starting node itself is not included.
 */
export function* walk(
  ctx: ShellContext,
  root: string,
  options: WalkOptions = {},
  depth = 0,
  ancestorIsLast: boolean[] = []
): Generator<WalkEntry> {
  const { includeHidden = false, maxDepth = Infinity } = options
  if (depth > maxDepth) return

  const children = [...ctx.kernel.fs.list(root)]
    .filter((node) => includeHidden || !node.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const [index, node] of children.entries()) {
    const isLast = index === children.length - 1
    const path = join(root, node.name)

    yield { path, node, depth, isLast, ancestorIsLast }

    if (node.type === 'dir') {
      yield* walk(ctx, path, options, depth + 1, [...ancestorIsLast, isLast])
    }
  }
}
