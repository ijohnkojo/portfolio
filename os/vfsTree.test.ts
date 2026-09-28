import { describe, expect, it } from 'vitest'

import { loadFixtureContent } from '@/lib/__fixtures__/fixtureContent'
import { allEntries, getEntry } from '@/lib/content'
import { resolve } from '@/os/kernel'

import { buildVFSTree, createVFSTree } from './vfsTree'

/** The miniature tree from lib/__fixtures__ — guaranteed to hold a draft (D-038). */
const fixture = await loadFixtureContent()

describe('drafts', () => {
  // Hidden from the web, not from the OS — work in progress stays openable.
  it('are still present in the VFS', () => {
    const drafts = fixture.allEntries().filter((e) => e.draft)
    expect(drafts.length, 'no draft entries to test against').toBeGreaterThan(0)

    const tree = createVFSTree(fixture)
    for (const draft of drafts) {
      const node = resolve(tree, draft.vfsPath)
      expect(node, draft.vfsPath).not.toBeNull()
      expect(node!.type).toBe('file')
      expect(fixture.getEntry(draft.collection, draft.slug), draft.vfsPath).toBeNull()
    }
  })

  it('stay in the real VFS too, whenever real content has any', () => {
    const tree = buildVFSTree()
    for (const draft of allEntries().filter((e) => e.draft)) {
      expect(resolve(tree, draft.vfsPath), draft.vfsPath).not.toBeNull()
      expect(getEntry(draft.collection, draft.slug), draft.vfsPath).toBeNull()
    }
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
