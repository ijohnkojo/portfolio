/**
 * The pure parts of the file manager: where you are, where you have been, and
 * what order things appear in.
 *
 * Kept out of the component for the usual reason — this is the part with logic
 * worth testing, and it tests in bare node. `Files.tsx` does the DOM.
 */
import { resolvePath, type VFSNode } from '@/os/kernel'

export interface Navigation {
  /** Visited paths, oldest first. */
  history: string[]
  index: number
}

export function createNavigation(path = '/'): Navigation {
  return { history: [path], index: 0 }
}

export function currentPath(nav: Navigation): string {
  return nav.history[nav.index]
}

export function canGoBack(nav: Navigation): boolean {
  return nav.index > 0
}

export function canGoForward(nav: Navigation): boolean {
  return nav.index < nav.history.length - 1
}

/**
 * Go somewhere new. **Forward history is dropped**, as it is in a browser:
 * having gone back and then somewhere else, the branch you abandoned is not
 * somewhere "forward" of you any more.
 */
export function navigate(nav: Navigation, path: string): Navigation {
  if (path === currentPath(nav)) return nav
  return {
    history: [...nav.history.slice(0, nav.index + 1), path],
    index: nav.index + 1,
  }
}

export function back(nav: Navigation): Navigation {
  return canGoBack(nav) ? { ...nav, index: nav.index - 1 } : nav
}

export function forward(nav: Navigation): Navigation {
  return canGoForward(nav) ? { ...nav, index: nav.index + 1 } : nav
}

export interface Crumb {
  name: string
  path: string
}

/** `/papers/hq` → `/` · `papers` · `hq`, each one somewhere you can click to. */
export function breadcrumb(path: string): Crumb[] {
  const crumbs: Crumb[] = [{ name: '/', path: '/' }]

  let walked = ''
  for (const segment of path.split('/').filter(Boolean)) {
    walked += `/${segment}`
    crumbs.push({ name: segment, path: walked })
  }
  return crumbs
}

/** The parent, which at the root is the root. */
export function parentOf(path: string): string {
  return resolvePath(path, '..')
}

/**
 * Directories first, then applications, then files — the order a file manager
 * is expected to use, and different from the desktop's on purpose: there,
 * launchers belong at the top left; here, folders are what you are navigating.
 */
const TYPE_ORDER = { dir: 0, app: 1, file: 2 } as const

export function sortEntries(nodes: readonly VFSNode[]): VFSNode[] {
  return [...nodes].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name)
  )
}

/** The right-hand column: what this node is, in a few characters. */
export function describeNode(node: VFSNode, childCount: number): string {
  if (node.type === 'dir') return `${childCount} item${childCount === 1 ? '' : 's'}`
  if (node.type === 'app') return 'application'
  if (node.content !== undefined) return `${node.content.length} B`
  // Asset-backed: the bytes live in /public, not here (D-012).
  return 'external'
}
