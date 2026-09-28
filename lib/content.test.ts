import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS,
  allEntries,
  getEntry,
  listAllPublished,
  listEntries,
} from './content'
import { loadFixtureContent } from './__fixtures__/fixtureContent'

/**
 * A miniature content tree with one published entry and one draft. Behaviour
 * tests read this rather than `content/`, so they check the pipeline and not
 * whatever happens to be published this week (D-038).
 */
const fixture = await loadFixtureContent()

describe('entries', () => {
  it('reads every entry directory in every collection', () => {
    const entries = allEntries()
    expect(entries.length).toBeGreaterThanOrEqual(4)
    for (const c of COLLECTIONS) {
      expect(entries.some((e) => e.collection === c)).toBe(true)
    }
  })

  // Deliberately content-agnostic: these assert the pipeline's properties, not
  // the existence of any particular writeup. Naming a slug here means the suite
  // breaks every time a writeup is renamed, which has already happened once.
  it('parses frontmatter and strips it from the rendered body', () => {
    for (const entry of allEntries()) {
      expect(entry.title, entry.vfsPath).toBeTruthy()
      expect(entry.summary, entry.vfsPath).toBeTruthy()
      // body feeds MDXRemote, so the frontmatter block must be gone…
      expect(entry.body.trimStart().startsWith('---'), entry.vfsPath).toBe(false)
      // …but raw is the file on disk, which is what `cat` should print.
      expect(entry.raw.startsWith('---'), entry.vfsPath).toBe(true)
      expect(entry.raw).toContain(`title: ${entry.title}`)
    }
  })

  it('reads a known entry through getEntry when it is published', () => {
    const published = listAllPublished()[0]
    if (!published) return // everything is draft; covered by the draft tests

    expect(getEntry(published.collection, published.slug)).toMatchObject({
      slug: published.slug,
      title: published.title,
    })
  })

  it('normalises a YAML date to an ISO day string', () => {
    for (const entry of allEntries()) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('sorts newest first', () => {
    for (const collection of COLLECTIONS) {
      const dates = listEntries(collection).map((e) => e.date)
      expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
    }
    const all = allEntries().map((e) => e.date)
    expect([...all].sort((a, b) => b.localeCompare(a))).toEqual(all)
  })

  it('maps disk to route to VFS path one-to-one', () => {
    for (const entry of allEntries()) {
      expect(entry.href).toBe(`/${entry.collection}/${entry.slug}`)
      expect(entry.vfsPath).toBe(`/${entry.collection}/${entry.slug}/index.mdx`)
    }
  })
})

describe('drafts', () => {
  it('are excluded from listings and unroutable', () => {
    for (const reader of [fixture, { allEntries, listEntries, getEntry }]) {
      for (const collection of COLLECTIONS) {
        expect(reader.listEntries(collection).every((e) => !e.draft)).toBe(true)
      }
      for (const draft of reader.allEntries().filter((e) => e.draft)) {
        expect(reader.getEntry(draft.collection, draft.slug)).toBeNull()
      }
    }
  })

  it('are still read by allEntries', () => {
    const draft = fixture.allEntries().find((e) => e.draft)
    expect(draft, 'the fixture tree must contain a draft').toBeDefined()
    expect(fixture.getEntry(draft!.collection, draft!.slug)).toBeNull()
    expect(fixture.listAllPublished().some((e) => e.slug === draft!.slug)).toBe(false)
  })
})

describe('fixture content', () => {
  // Guards the guard: if the fixture stopped containing both kinds, the draft
  // tests above would pass while checking nothing.
  it('holds one published entry and one draft', () => {
    const entries = fixture.allEntries()
    expect(entries.filter((e) => e.draft)).toHaveLength(1)
    expect(entries.filter((e) => !e.draft)).toHaveLength(1)
  })

  it('is a separate copy — the real content is still read from content/', () => {
    expect(allEntries().some((e) => e.collection === 'papers' && e.slug === 'fixture-draft')).toBe(false)
    expect(fixture.allEntries().every((e) => e.vfsPath.includes('fixture-'))).toBe(true)
  })
})

describe('content directory layout', () => {
  const CONTENT_DIR = path.join(process.cwd(), 'content')
  /** Loose files, not a collection of entries. */
  const NOT_A_COLLECTION = new Set(['home'])

  /**
   * The failure this guards against is silent: a directory under content/ that
   * is not a declared collection gets read by nothing, so its entries appear in
   * neither the VFS nor the web routes. Creating `content/talks/` and
   * forgetting to declare it would just quietly do nothing.
   */
  it('has no directory that is not a declared collection', () => {
    const directories = fs
      .readdirSync(CONTENT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !NOT_A_COLLECTION.has(name))

    expect(directories.sort()).toEqual([...COLLECTIONS].sort())
  })

  /** The other half: a declared collection with no directory reads as empty. */
  it('has a directory for every declared collection', () => {
    for (const collection of COLLECTIONS) {
      expect(
        fs.existsSync(path.join(CONTENT_DIR, collection)),
        `content/${collection}/ is declared but does not exist`
      ).toBe(true)
    }
  })

  it('gives every entry directory an index.mdx', () => {
    for (const collection of COLLECTIONS) {
      const dir = path.join(CONTENT_DIR, collection)
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        expect(
          fs.existsSync(path.join(dir, entry.name, 'index.mdx')),
          `content/${collection}/${entry.name}/ has no index.mdx`
        ).toBe(true)
      }
    }
  })

  // A slug becomes a directory name, a URL, and a VFS path. Restricting the
  // character set keeps all three legible and avoids escaping anywhere.
  it('uses lowercase kebab-case slugs', () => {
    for (const entry of allEntries()) {
      expect(entry.slug, `${entry.collection}/${entry.slug}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})
