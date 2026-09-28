/**
 * VFS — the spine of the system.
 *
 * Path helpers are pure functions, deliberately separate from the store, so the
 * shell's `ls`/`cd`/`open` can use them and so they're testable without React.
 */
import { createStore } from 'zustand/vanilla'

export type VFSNodeType = 'dir' | 'file' | 'app'

interface BaseNode {
  name: string
  meta?: Record<string, unknown>
}

export interface DirNode extends BaseNode {
  type: 'dir'
  children: Record<string, VFSNode>
}

export interface FileNode extends BaseNode {
  type: 'file'
  mime: string
  /** Inline content. Mutually exclusive with `src`. */
  content?: string
  /** Path to a static asset in /public. Keeps large blobs (PDFs) out of the serialized tree. */
  src?: string
}

export interface AppNode extends BaseNode {
  type: 'app'
  appId: string
}

export type VFSNode = DirNode | FileNode | AppNode

/* -------------------------------------------------------------------------- */
/* Path helpers (pure)                                                        */
/* -------------------------------------------------------------------------- */

/** Collapse `.`, `..`, and duplicate slashes. `..` at the root is a no-op, as in POSIX. */
export function normalize(path: string): string {
  const isAbsolute = path.startsWith('/')
  const out: string[] = []

  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      const top = out[out.length - 1]
      if (out.length > 0 && top !== '..') out.pop()
      else if (!isAbsolute) out.push('..')
      continue
    }
    out.push(seg)
  }

  const joined = out.join('/')
  if (isAbsolute) return '/' + joined
  return joined === '' ? '.' : joined
}

export function join(...parts: string[]): string {
  return normalize(parts.filter((p) => p !== '').join('/'))
}

/** Resolve `target` against `cwd`. Absolute targets ignore `cwd`. */
export function resolvePath(cwd: string, target: string): string {
  return target.startsWith('/') ? normalize(target) : join(cwd, target)
}

export function dirname(path: string): string {
  const n = normalize(path)
  if (n === '/') return '/'
  const i = n.lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  return n.slice(0, i)
}

export function basename(path: string): string {
  const n = normalize(path)
  if (n === '/') return '/'
  return n.slice(n.lastIndexOf('/') + 1)
}

/**
 * Walk the tree to `path`. Returns null if any segment is missing, or if the
 * walk would descend *through* a non-directory — `/a/file.md/b` is not a path.
 */
export function resolve(root: DirNode, path: string): VFSNode | null {
  const n = normalize(path)
  if (n === '/' || n === '.') return root

  let cur: VFSNode = root
  for (const seg of n.split('/').filter(Boolean)) {
    if (cur.type !== 'dir') return null
    const next: VFSNode | undefined = cur.children[seg]
    if (!next) return null
    cur = next
  }
  return cur
}

export function dir(name: string, children: Record<string, VFSNode> = {}): DirNode {
  return { type: 'dir', name, children }
}

export function file(name: string, content: string, mime = 'text/markdown'): FileNode {
  return { type: 'file', name, mime, content }
}

export function appNode(name: string, appId: string): AppNode {
  return { type: 'app', name, appId }
}

/**
 * Immutably replace the node at `segments`, copying only the spine.
 * Structural sharing matters: untouched subtrees keep their identity, so
 * scoped selectors watching sibling paths don't fire.
 */
function setNode(
  parent: DirNode,
  segments: string[],
  make: (existing: VFSNode | undefined) => VFSNode
): DirNode {
  const [head, ...rest] = segments
  const existing: VFSNode | undefined = parent.children[head]

  if (rest.length === 0) {
    return { ...parent, children: { ...parent.children, [head]: make(existing) } }
  }

  if (!existing || existing.type !== 'dir') {
    throw new Error(`ENOTDIR: cannot descend into '${head}'`)
  }

  return {
    ...parent,
    children: { ...parent.children, [head]: setNode(existing, rest, make) },
  }
}

/** Immutably drop the node at `segments`, copying only the spine. */
function removeNode(parent: DirNode, segments: string[]): DirNode {
  const [head, ...rest] = segments
  const existing: VFSNode | undefined = parent.children[head]
  if (!existing) return parent

  if (rest.length === 0) {
    const children = { ...parent.children }
    delete children[head]
    return { ...parent, children }
  }

  if (existing.type !== 'dir') return parent
  return { ...parent, children: { ...parent.children, [head]: removeNode(existing, rest) } }
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export interface VFSState {
  root: DirNode
  /**
   * The tree exactly as mounted, before any write. Lets the store answer "is
   * this published content?" — nearly free, because writes copy only the spine,
   * so this object stays intact rather than being a second copy.
   */
  baseRoot: DirNode
  /**
   * Accumulated writes, keyed by absolute path. The base tree ships with the
   * build and is treated as read-only; only this overlay is persisted, so
   * editing site content never invalidates a returning session.
   */
  overlay: Record<string, string>
  read: (path: string) => VFSNode | null
  list: (path: string) => VFSNode[]
  write: (path: string, content: string) => void
  /** `recursive` creates missing parents, as `mkdir -p` does. */
  mkdir: (path: string, recursive?: boolean) => void
  /**
   * Remove a node. Three behaviours, and the distinction is the whole design:
   * an overlay-created node is deleted; a published node that has been edited
   * *reverts* to the published version; an untouched published node is refused.
   * You can only remove what you added — D-003 extended.
   */
  unlink: (path: string) => void
  /** Place an arbitrary node. Unlike `write`, this can create dirs and app nodes. */
  mknod: (path: string, node: VFSNode) => void
  mount: (root: DirNode) => void
  applyOverlay: (overlay: Record<string, string>) => void
}

export const vfsStore = createStore<VFSState>()((set, get) => ({
  root: dir('/'),
  baseRoot: dir('/'),
  overlay: {},

  read: (path) => resolve(get().root, path),

  list: (path) => {
    const node = resolve(get().root, path)
    if (!node || node.type !== 'dir') return []
    return Object.values(node.children)
  },

  write: (path, content) => {
    const n = normalize(path)
    const segments = n.split('/').filter(Boolean)
    if (segments.length === 0) throw new Error('EISDIR: cannot write to /')

    set((state) => ({
      root: setNode(state.root, segments, (existing) => {
        if (existing && existing.type !== 'file') {
          throw new Error(`EISDIR: '${n}' is not a file`)
        }
        return existing
          ? { ...existing, content, src: undefined }
          : file(basename(n), content)
      }),
      overlay: { ...state.overlay, [n]: content },
    }))
  },

  mkdir: (path, recursive = false) => {
    const n = normalize(path)
    const segments = n.split('/').filter(Boolean)
    if (segments.length === 0) return

    // Build each level in turn so a missing parent is created rather than
    // throwing — which is what `applyOverlay` needs to replay a write into a
    // directory the shell created.
    const levels = recursive
      ? segments.map((_, i) => segments.slice(0, i + 1))
      : [segments]

    for (const level of levels) {
      set((state) => ({
        root: setNode(state.root, level, (existing) => {
          if (existing) {
            if (existing.type !== 'dir') {
              throw new Error(`ENOTDIR: '/${level.join('/')}' exists and is not a directory`)
            }
            return existing
          }
          return dir(level[level.length - 1])
        }),
      }))
    }
  },

  unlink: (path) => {
    const n = normalize(path)
    const segments = n.split('/').filter(Boolean)
    if (segments.length === 0) throw new Error('EBUSY: cannot remove /')

    const state = get()
    if (!resolve(state.root, n)) throw new Error(`ENOENT: '${n}' does not exist`)

    const published = resolve(state.baseRoot, n)
    if (published) {
      // Published content is read-only. Removing an *edit* to it is an undo,
      // which is more useful than refusing outright.
      if (state.overlay[n] === undefined) {
        throw new Error(`EROFS: '${n}' is published content`)
      }
      const overlay = { ...state.overlay }
      delete overlay[n]
      set({ root: setNode(state.root, segments, () => published), overlay })
      return
    }

    // Not in the base tree, so nothing beneath it can be published either.
    const prefix = `${n}/`
    const overlay = Object.fromEntries(
      Object.entries(state.overlay).filter(([p]) => p !== n && !p.startsWith(prefix))
    )
    set({ root: removeNode(state.root, segments), overlay })
  },

  mknod: (path, node) => {
    const n = normalize(path)
    const segments = n.split('/').filter(Boolean)
    if (segments.length === 0) throw new Error('EEXIST: cannot replace /')

    set((state) => ({ root: setNode(state.root, segments, () => node) }))
  },

  // Mounting a base tree starts clean: accumulated writes belong to the tree
  // they were made against, and are replayed explicitly via `applyOverlay`.
  mount: (root) => set({ root, baseRoot: root, overlay: {} }),

  /**
   * Replay persisted writes onto the base tree. Paths whose parent directory
   * no longer exists are skipped rather than throwing — the base content may
   * have been restructured since the session was saved.
   */
  applyOverlay: (overlay) => {
    for (const [path, content] of Object.entries(overlay)) {
      try {
        // Parents on demand: a directory created in the shell leaves no overlay
        // entry of its own, so it has to be implied by the files inside it.
        // This also preserves a write whose parent has since been deleted,
        // where the previous version dropped it silently.
        const parent = dirname(path)
        if (parent !== '/' && parent !== '.') get().mkdir(parent, true)
        get().write(path, content)
      } catch {
        // Unsalvageable entry — e.g. the path now collides with a file.
      }
    }
  },
}))
