/**
 * Content pipeline — disk to both the crawlable routes and the VFS.
 *
 * Server-only by construction: it reads with `node:fs`, so it cannot end up in
 * a client bundle without failing the build.
 *
 * One read serves two consumers, which is the point (see docs/decisions.md
 * D-010). The SSG route renders `entry.body` through MDXRemote; the VFS gets
 * `entry.raw` — frontmatter included, because that is what is actually on disk
 * and what `cat` should print.
 */
import fs from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'

import { dir, file, type DirNode, type FileNode, type VFSNode } from '@/kernel'

const CONTENT_DIR = path.join(process.cwd(), 'content')
const ENTRY_FILE = 'index.mdx'

export const COLLECTIONS = ['projects', 'papers', 'presentations'] as const
export type Collection = (typeof COLLECTIONS)[number]

export interface Entry {
  collection: Collection
  slug: string
  title: string
  summary: string
  date: string
  tags: string[]
  draft: boolean
  /** Frontmatter stripped — what MDXRemote compiles. */
  body: string
  /** The file exactly as it sits on disk — what the VFS stores and `cat` prints. */
  raw: string
  /** Non-MDX files sitting alongside the entry. */
  assets: Array<{ name: string; src: string }>
  href: string
  vfsPath: string
}

/**
 * Read once per process in production, fresh every time in development — so
 * editing a writeup shows up without restarting the dev server.
 */
function memo<T>(fn: () => T): () => T {
  if (process.env.NODE_ENV === 'development') return fn
  let value: T
  let filled = false
  return () => {
    if (!filled) {
      value = fn()
      filled = true
    }
    return value
  }
}

function isDirectory(p: string): boolean {
  return fs.existsSync(p) && fs.statSync(p).isDirectory()
}

function requireString(
  value: unknown,
  field: string,
  where: string
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    // Fail the build rather than shipping a blank <title> or an empty card.
    throw new Error(`${where}: frontmatter field '${field}' is required`)
  }
  return value
}

function readEntry(collection: Collection, slug: string): Entry {
  const entryDir = path.join(CONTENT_DIR, collection, slug)
  const entryPath = path.join(entryDir, ENTRY_FILE)
  const where = path.relative(process.cwd(), entryPath)

  if (!fs.existsSync(entryPath)) {
    throw new Error(`${where}: every entry directory must contain ${ENTRY_FILE}`)
  }

  const raw = fs.readFileSync(entryPath, 'utf8')
  const { data, content } = matter(raw)

  const assets = fs
    .readdirSync(entryDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== ENTRY_FILE)
    .map((e) => ({
      name: e.name,
      // Mirrored into /public by scripts/sync-content-assets.mjs.
      src: `/content/${collection}/${slug}/${e.name}`,
    }))

  return {
    collection,
    slug,
    title: requireString(data.title, 'title', where),
    summary: requireString(data.summary, 'summary', where),
    date: requireString(
      data.date instanceof Date ? data.date.toISOString().slice(0, 10) : data.date,
      'date',
      where
    ),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft === true,
    body: content,
    raw,
    assets,
    href: `/${collection}/${slug}`,
    vfsPath: `/${collection}/${slug}/${ENTRY_FILE}`,
  }
}

/** Every entry on disk, drafts included, newest first. */
export const allEntries = memo((): Entry[] => {
  const entries: Entry[] = []

  for (const collection of COLLECTIONS) {
    const collectionDir = path.join(CONTENT_DIR, collection)
    if (!isDirectory(collectionDir)) continue

    for (const e of fs.readdirSync(collectionDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      entries.push(readEntry(collection, e.name))
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date))
})

/** Published entries in a collection, newest first. Drafts are never routed. */
export function listEntries(collection: Collection): Entry[] {
  return allEntries().filter((e) => e.collection === collection && !e.draft)
}

export function listAllPublished(): Entry[] {
  return allEntries().filter((e) => !e.draft)
}

export function getEntry(collection: Collection, slug: string): Entry | null {
  return (
    listEntries(collection).find((e) => e.slug === slug) ?? null
  )
}

export interface HomeFile {
  /** Frontmatter stripped — what MDXRemote compiles. */
  body: string
  /** The file exactly as it sits on disk, as `cat` prints it. */
  raw: string
  vfsPath: string
}

/**
 * One loose file under `content/home`, by name.
 *
 * Same rule as an entry ([D-010](../docs/decisions.md)): one read on disk feeds
 * both surfaces, so `/about` on the web and `whoami` in the shell can never
 * disagree about the bio. The difference is that this is a singleton rather
 * than a collection — no slug, no listing, and no `draft` flag, because there
 * is nothing to choose between.
 */
export function getHomeFile(name: string): HomeFile | null {
  const filePath = path.join(CONTENT_DIR, 'home', name)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null

  const raw = fs.readFileSync(filePath, 'utf8')
  return { raw, body: matter(raw).content, vfsPath: `/home/${name}` }
}

/* -------------------------------------------------------------------------- */
/* VFS                                                                        */
/* -------------------------------------------------------------------------- */

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
function buildHomeDir(): DirNode {
  const homeDir = path.join(CONTENT_DIR, 'home')
  const children: Record<string, VFSNode> = {}
  if (!isDirectory(homeDir)) return dir('home', children)

  for (const e of fs.readdirSync(homeDir, { withFileTypes: true })) {
    if (!e.isFile()) continue

    const mime = mimeFor(e.name)
    children[e.name] = INLINE_MIMES.has(mime)
      ? file(e.name, fs.readFileSync(path.join(homeDir, e.name), 'utf8'), mime)
      : assetNode(e.name, `/content/home/${e.name}`)
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
 * The base tree handed to the client at boot. Drafts are included — they are
 * hidden from the web, not from the OS, so work in progress stays openable.
 *
 * `/apps` is not built here: app nodes come from the registry, which is a
 * client module (it holds React components). OsShell registers them on mount.
 */
export const buildVFSTree = memo((): DirNode => {
  const root = dir('/', { home: buildHomeDir() })

  for (const collection of COLLECTIONS) {
    const children: Record<string, VFSNode> = {}
    for (const entry of allEntries()) {
      if (entry.collection !== collection) continue
      children[entry.slug] = entryDirNode(entry)
    }
    root.children[collection] = dir(collection, children)
  }

  return root
})
