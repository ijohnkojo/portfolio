import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS,
  allEntries,
  buildVFSTree,
  getEntry,
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

  it('parses frontmatter and strips it from the rendered body', () => {
    const entry = getEntry('projects', 'project-one')

    expect(entry).not.toBeNull()
    expect(entry!.title).toBe('Project One')
    expect(entry!.summary).toMatch(/pipeline/i)
    expect(entry!.tags).toContain('placeholder')
    // body feeds MDXRemote, so frontmatter must be gone…
    expect(entry!.body).not.toContain('title:')
    // …but raw is the file on disk, which is what `cat` should print.
    expect(entry!.raw).toContain('title: Project One')
  })

  it('normalises a YAML date to an ISO day string', () => {
    for (const entry of allEntries()) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('sorts newest first', () => {
    const dates = listEntries('projects').map((e) => e.date)
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
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
    expect(listEntries('papers').some((e) => e.slug === 'paper-draft')).toBe(false)
    expect(getEntry('papers', 'paper-draft')).toBeNull()
  })

  // Hidden from the web, not from the OS — work in progress stays openable.
  it('are still present in the VFS', () => {
    const node = resolve(buildVFSTree(), '/papers/paper-draft/index.mdx')
    expect(node).not.toBeNull()
    expect(node!.type).toBe('file')
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
    const node = resolve(tree, '/projects/project-one/index.mdx')
    expect(node!.meta).toMatchObject({
      title: 'Project One',
      href: '/projects/project-one',
      draft: false,
    })
  })

  it('represents non-MDX assets by src, never inlining their contents', () => {
    const node = resolve(tree, '/papers/paper-one/figure.txt')
    expect(node).not.toBeNull()
    expect(node!.type).toBe('file')
    if (node!.type === 'file') {
      expect(node!.src).toBe('/content/papers/paper-one/figure.txt')
      expect(node!.content).toBeUndefined()
    }
  })

  it('mounts loose home files inline, since the About app cats them', () => {
    const node = resolve(tree, '/home/about.md')
    expect(node!.type).toBe('file')
    if (node!.type === 'file') expect(node!.content).toContain('mechanism, not policy')
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
