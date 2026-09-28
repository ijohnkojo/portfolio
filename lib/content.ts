/**
 * Content pipeline — reads `content/` off disk for every surface that needs it.
 *
 * Server-only by construction: it reads with `node:fs`, so it cannot end up in
 * a client bundle without failing the build.
 *
 * One read serves every consumer, which is the point (see docs/decisions.md
 * D-010). The SSG routes render `entry.body` through MDXRemote; the OS builds
 * its filesystem from `entry.raw` in `os/vfsTree.ts` — frontmatter included,
 * because that is what is actually on disk and what `cat` should print.
 *
 * This module knows nothing about the OS. The dependency runs one way: the OS
 * reads content through here, and nothing here imports the OS (D-037).
 */
import fs from 'node:fs'
import path from 'node:path'

import matter from 'gray-matter'

import { memo } from './memo'

/**
 * Computed from `process.cwd()` at import, and deliberately not a parameter:
 * a path Turbopack can see is scoped to `content/` keeps its file tracing
 * scoped there too. Taking the directory as an argument made it trace the
 * whole project into the server output. Tests get a fixture-bound copy of this
 * module by importing it afresh with `process.cwd()` pointed elsewhere (D-038).
 */
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

/**
 * Every loose file under `content/home`, as a name and the URL its mirrored
 * copy is served from. Reading one is the caller's decision — a PDF read as
 * UTF-8 would be mojibake.
 */
export function listHomeFiles(): Array<{ name: string; src: string }> {
  const homeDir = path.join(CONTENT_DIR, 'home')
  if (!isDirectory(homeDir)) return []

  return fs
    .readdirSync(homeDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({ name: e.name, src: `/content/home/${e.name}` }))
}
