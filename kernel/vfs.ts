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

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export interface VFSState {
  root: DirNode
  /**
   * Accumulated writes, keyed by absolute path. The base tree ships with the
   * build and is treated as read-only; only this overlay is persisted, so
   * editing site content never invalidates a returning session.
   */
  overlay: Record<string, string>
  read: (path: string) => VFSNode | null
  list: (path: string) => VFSNode[]
  write: (path: string, content: string) => void
  mkdir: (path: string) => void
  mount: (root: DirNode) => void
  applyOverlay: (overlay: Record<string, string>) => void
}

export const vfsStore = createStore<VFSState>()((set, get) => ({
  root: dir('/'),
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

  mkdir: (path) => {
    const n = normalize(path)
    const segments = n.split('/').filter(Boolean)
    if (segments.length === 0) return

    set((state) => ({
      root: setNode(state.root, segments, (existing) => {
        if (existing) {
          if (existing.type !== 'dir') throw new Error(`ENOTDIR: '${n}' exists and is not a directory`)
          return existing
        }
        return dir(basename(n))
      }),
    }))
  },

  mount: (root) => set({ root }),

  /**
   * Replay persisted writes onto the base tree. Paths whose parent directory
   * no longer exists are skipped rather than throwing — the base content may
   * have been restructured since the session was saved.
   */
  applyOverlay: (overlay) => {
    for (const [path, content] of Object.entries(overlay)) {
      try {
        get().write(path, content)
      } catch {
        // Stale overlay entry; drop it.
      }
    }
  },
}))
