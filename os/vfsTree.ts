/**
 * The OS's filesystem, built from the site's content.
 *
 * Moved here from `lib/content.ts` when the OS became its own project
 * (D-037). The logic is unchanged; the difference is direction. The OS reads
 * `content/` through `lib/content.ts` like any other consumer, and the content
 * pipeline no longer knows that a VFS exists.
 *
 * Server-only: it goes through `lib/content.ts`, which reads with `node:fs`.
 */
import path from 'node:path'

import * as content from '@/lib/content'
import { COLLECTIONS, type Entry } from '@/lib/content'
import { memo } from '@/lib/memo'
import { dir, file, type DirNode, type FileNode, type VFSNode } from '@/os/kernel'

const ENTRY_FILE = 'index.mdx'

/** What the tree is built from: `lib/content.ts`, or a fixture-bound copy of it in tests. */
export type ContentReader = Pick<typeof content, 'allEntries' | 'getHomeFile' | 'listHomeFiles'>

function mimeFor(name: string): string {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.mdx' || ext === '.md') return 'text/markdown'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.json') return 'application/json'
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return `image/${ext.slice(1)}`
  return 'text/plain'
}

function assetNode(name: string, src: string): FileNode {
  // `src` instead of inline content: assets stay out of the RSC payload.
  return { type: 'file', name, mime: mimeFor(name), src }
}

/** Text mimes are small enough to inline and `cat`-able; everything else is not. */
const INLINE_MIMES = new Set(['text/markdown', 'text/plain', 'application/json'])

/**
 * Loose files under content/home. Text is inlined so `cat` works; anything else
 * gets a `src` like an entry asset would — reading a PDF as UTF-8 would inline
 * mojibake into the page payload.
 */
function buildHomeDir(reader: ContentReader): DirNode {
  const children: Record<string, VFSNode> = {}

  for (const { name, src } of reader.listHomeFiles()) {
    const mime = mimeFor(name)
    children[name] = INLINE_MIMES.has(mime)
      ? file(name, reader.getHomeFile(name)!.raw, mime)
      : assetNode(name, src)
  }
  return dir('home', children)
}

function entryDirNode(entry: Entry): DirNode {
  const children: Record<string, VFSNode> = {
    [ENTRY_FILE]: {
      ...file(ENTRY_FILE, entry.raw, 'text/markdown'),
      meta: {
        title: entry.title,
        summary: entry.summary,
        date: entry.date,
        tags: entry.tags,
        draft: entry.draft,
        href: entry.href,
      },
    },
  }

  for (const asset of entry.assets) {
    children[asset.name] = assetNode(asset.name, asset.src)
  }

  return { ...dir(entry.slug, children), meta: { title: entry.title } }
}

/**
 * The base tree for one content directory. Drafts are included — they are
 * hidden from the web, not from the OS, so work in progress stays openable.
 *
 * `/apps` is not built here: app nodes come from the registry, which is a
 * client module (it holds React components). OsShell registers them on mount.
 */
export function createVFSTree(reader: ContentReader): DirNode {
  const root = dir('/', { home: buildHomeDir(reader) })

  for (const collection of COLLECTIONS) {
    const children: Record<string, VFSNode> = {}
    for (const entry of reader.allEntries()) {
      if (entry.collection !== collection) continue
      children[entry.slug] = entryDirNode(entry)
    }
    root.children[collection] = dir(collection, children)
  }

  return root
}

/** The tree handed to the client at boot, built from `content/`. */
export const buildVFSTree = memo((): DirNode => createVFSTree(content))
