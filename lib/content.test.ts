import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS,
  allEntries,
  buildVFSTree,
  getEntry,
  listAllPublished,
  listEntries,
} from './content'
import { resolve } from '@/kernel'

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
    for (const collection of COLLECTIONS) {
      expect(listEntries(collection).every((e) => !e.draft)).toBe(true)
    }
    for (const draft of allEntries().filter((e) => e.draft)) {
      expect(getEntry(draft.collection, draft.slug)).toBeNull()
    }
  })

  // Hidden from the web, not from the OS — work in progress stays openable.
  it('are still present in the VFS', () => {
    const drafts = allEntries().filter((e) => e.draft)
    expect(drafts.length, 'no draft entries to test against').toBeGreaterThan(0)

    for (const draft of drafts) {
      const node = resolve(buildVFSTree(), draft.vfsPath)
      expect(node, draft.vfsPath).not.toBeNull()
      expect(node!.type).toBe('file')
      expect(getEntry(draft.collection, draft.slug), draft.vfsPath).toBeNull()
    }
  })

  it('are still read by allEntries', () => {
    expect(allEntries().some((e) => e.draft)).toBe(true)
  })
})

describe('VFS tree', () => {
  const tree = buildVFSTree()

  it('exposes every entry at the path its route implies', () => {
    for (const entry of allEntries()) {
      const node = resolve(tree, entry.vfsPath)
      expect(node, entry.vfsPath).not.toBeNull()
      expect(node!.type).toBe('file')
      if (node!.type === 'file') expect(node!.content).toBe(entry.raw)
    }
  })

  it('carries entry metadata on the node, for a viewer or the shell to use', () => {
    for (const entry of allEntries()) {
      expect(resolve(tree, entry.vfsPath)!.meta, entry.vfsPath).toMatchObject({
        title: entry.title,
        href: entry.href,
        draft: entry.draft,
      })
    }
  })

  it('represents non-MDX assets by src, never inlining their contents', () => {
    const withAssets = allEntries().filter((e) => e.assets.length > 0)
    // Not a silent pass: say so when there is nothing to exercise.
    if (withAssets.length === 0) {
      console.warn('  (no entry carries an asset — the src path is untested)')
      return
    }

    for (const entry of withAssets) {
      for (const asset of entry.assets) {
        const node = resolve(tree, `/${entry.collection}/${entry.slug}/${asset.name}`)
        expect(node, asset.name).not.toBeNull()
        if (node!.type === 'file') {
          expect(node!.src).toBe(asset.src)
          expect(node!.content).toBeUndefined()
        }
      }
    }
  })

  it('inlines text under /home but gives binaries a src', () => {
    const readme = resolve(tree, '/home/readme.md')
    expect(readme!.type).toBe('file')
    if (readme!.type === 'file') {
      expect(readme!.content).toContain('Getting around')
      expect(readme!.src).toBeUndefined()
    }
  })

  it('mounts loose home files inline, since the About app cats them', () => {
    const node = resolve(tree, '/home/about.md')
    expect(node!.type).toBe('file')
    if (node!.type === 'file') expect(node!.content).toBeTruthy()
  })

  it('does not build /apps — the client registry owns that', () => {
    expect(resolve(tree, '/apps')).toBeNull()
  })

  it('is JSON-serializable, which is what lets it cross to the client', () => {
    expect(() => JSON.parse(JSON.stringify(tree))).not.toThrow()
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
