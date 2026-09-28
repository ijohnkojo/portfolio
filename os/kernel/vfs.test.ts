import { beforeEach, describe, expect, it } from 'vitest'

import {
  basename,
  dir,
  dirname,
  file,
  join,
  normalize,
  resolve,
  resolvePath,
  vfsStore,
} from './vfs'

const tree = () =>
  dir('/', {
    projects: dir('projects', {
      hq: dir('hq', { 'README.md': file('README.md', '# hq') }),
    }),
    'notes.md': file('notes.md', 'hello'),
  })

describe('normalize', () => {
  it('collapses redundant separators and dot segments', () => {
    expect(normalize('/projects//hq/./')).toBe('/projects/hq')
    expect(normalize('/projects/hq/../hq')).toBe('/projects/hq')
  })

  it('keeps the root stable and treats .. above it as a no-op, as POSIX does', () => {
    expect(normalize('/')).toBe('/')
    expect(normalize('/../..')).toBe('/')
  })

  it('preserves leading .. on relative paths, which have no known root', () => {
    expect(normalize('../sibling')).toBe('../sibling')
    expect(normalize('a/../..')).toBe('..')
    expect(normalize('')).toBe('.')
  })
})

describe('join / resolvePath / dirname / basename', () => {
  it('joins and normalizes in one step', () => {
    expect(join('/projects', 'hq', 'README.md')).toBe('/projects/hq/README.md')
    expect(join('/projects/hq', '..')).toBe('/projects')
  })

  it('resolves relative targets against cwd and ignores cwd for absolute ones', () => {
    expect(resolvePath('/projects', 'hq')).toBe('/projects/hq')
    expect(resolvePath('/projects/hq', '../treeviz')).toBe('/projects/treeviz')
    expect(resolvePath('/projects/hq', '/papers')).toBe('/papers')
  })

  it('splits paths', () => {
    expect(dirname('/projects/hq/README.md')).toBe('/projects/hq')
    expect(dirname('/notes.md')).toBe('/')
    expect(dirname('/')).toBe('/')
    expect(basename('/projects/hq/README.md')).toBe('README.md')
    expect(basename('/')).toBe('/')
  })
})

describe('resolve', () => {
  const root = tree()

  it('walks to nested nodes', () => {
    expect(resolve(root, '/')).toBe(root)
    expect(resolve(root, '/projects/hq/README.md')).toMatchObject({
      type: 'file',
      content: '# hq',
    })
  })

  it('normalizes before walking', () => {
    expect(resolve(root, '/projects/../projects/hq')).toMatchObject({ type: 'dir' })
  })

  it('returns null for missing paths', () => {
    expect(resolve(root, '/projects/nope')).toBeNull()
  })

  it('refuses to descend through a file rather than silently returning it', () => {
    expect(resolve(root, '/notes.md/child')).toBeNull()
  })
})

describe('store', () => {
  beforeEach(() => {
    vfsStore.getState().mount(tree())
  })

  it('lists directory children and nothing for a file', () => {
    expect(vfsStore.getState().list('/projects/hq')).toHaveLength(1)
    expect(vfsStore.getState().list('/notes.md')).toEqual([])
  })

  it('updates a file and records the write in the overlay', () => {
    vfsStore.getState().write('/notes.md', 'changed')

    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'changed' })
    expect(vfsStore.getState().overlay).toEqual({ '/notes.md': 'changed' })
  })

  it('creates a missing file inside an existing directory', () => {
    vfsStore.getState().write('/projects/hq/NOTES.md', 'new')
    expect(vfsStore.getState().read('/projects/hq/NOTES.md')).toMatchObject({
      name: 'NOTES.md',
      content: 'new',
    })
  })

  it('rejects writing through a missing or non-directory parent', () => {
    expect(() => vfsStore.getState().write('/nope/deep.md', 'x')).toThrow(/ENOTDIR/)
    expect(() => vfsStore.getState().write('/notes.md/child.md', 'x')).toThrow(/ENOTDIR/)
  })

  it('rejects overwriting a directory with file content', () => {
    expect(() => vfsStore.getState().write('/projects', 'x')).toThrow(/EISDIR/)
  })

  it('shares structure so untouched subtrees keep their identity', () => {
    const before = vfsStore.getState().read('/projects/hq')
    vfsStore.getState().write('/notes.md', 'changed')

    // Sibling subtree is referentially identical: selectors watching it stay put.
    expect(vfsStore.getState().read('/projects/hq')).toBe(before)
    expect(vfsStore.getState().root).not.toBe(before)
  })

  /**
   * Parents are recreated on replay rather than the entry being dropped. That
   * is what lets a directory created in the shell survive a reload — it leaves
   * no overlay entry of its own, so it has to be implied by the files in it.
   * It also means a write outlives the deletion of its parent, which is data
   * preservation over tidiness.
   */
  it('replays an overlay, recreating any missing parents', () => {
    vfsStore.getState().applyOverlay({
      '/notes.md': 'restored',
      '/made-in-the-shell/file.md': 'kept',
      '/deep/a/b/c.md': 'nested',
    })

    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'restored' })
    expect(vfsStore.getState().read('/made-in-the-shell/file.md')).toMatchObject({ content: 'kept' })
    expect(vfsStore.getState().read('/made-in-the-shell')).toMatchObject({ type: 'dir' })
    expect(vfsStore.getState().read('/deep/a/b/c.md')).toMatchObject({ content: 'nested' })
  })

  it('drops an overlay entry whose path collides with a file', () => {
    vfsStore.getState().applyOverlay({ '/notes.md/impossible.md': 'nope' })
    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ type: 'file' })
  })
})

describe('mkdir', () => {
  beforeEach(() => vfsStore.getState().mount(tree()))

  it('creates a directory', () => {
    vfsStore.getState().mkdir('/fresh')
    expect(vfsStore.getState().read('/fresh')).toMatchObject({ type: 'dir', name: 'fresh' })
  })

  it('refuses a missing parent without recursive', () => {
    expect(() => vfsStore.getState().mkdir('/a/b/c')).toThrow(/ENOTDIR/)
  })

  it('creates every level when recursive', () => {
    vfsStore.getState().mkdir('/a/b/c', true)
    expect(vfsStore.getState().read('/a')).toMatchObject({ type: 'dir' })
    expect(vfsStore.getState().read('/a/b/c')).toMatchObject({ type: 'dir', name: 'c' })
  })

  it('leaves an existing directory alone', () => {
    const before = vfsStore.getState().read('/projects')
    vfsStore.getState().mkdir('/projects', true)
    expect(vfsStore.getState().read('/projects')).toBe(before)
  })

  it('refuses to turn a file into a directory', () => {
    expect(() => vfsStore.getState().mkdir('/notes.md')).toThrow(/ENOTDIR/)
  })
})

describe('unlink', () => {
  beforeEach(() => vfsStore.getState().mount(tree()))

  it('removes a file created in the overlay, and its overlay entry', () => {
    vfsStore.getState().write('/scratch.md', 'mine')
    expect(vfsStore.getState().overlay['/scratch.md']).toBe('mine')

    vfsStore.getState().unlink('/scratch.md')

    expect(vfsStore.getState().read('/scratch.md')).toBeNull()
    expect(vfsStore.getState().overlay['/scratch.md']).toBeUndefined()
  })

  // The rule that makes tombstones unnecessary: you can only remove what you added.
  it('refuses published content', () => {
    expect(() => vfsStore.getState().unlink('/notes.md')).toThrow(/EROFS/)
    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'hello' })
  })

  // Removing an edit is an undo, which is more useful than refusing outright.
  it('reverts an edited published file instead of deleting it', () => {
    vfsStore.getState().write('/notes.md', 'edited')
    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'edited' })

    vfsStore.getState().unlink('/notes.md')

    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'hello' })
    expect(vfsStore.getState().overlay['/notes.md']).toBeUndefined()
  })

  it('removes a directory it created, with everything beneath it', () => {
    vfsStore.getState().mkdir('/notes/deep', true)
    vfsStore.getState().write('/notes/a.md', 'a')
    vfsStore.getState().write('/notes/deep/b.md', 'b')

    vfsStore.getState().unlink('/notes')

    expect(vfsStore.getState().read('/notes')).toBeNull()
    expect(Object.keys(vfsStore.getState().overlay)).toEqual([])
  })

  it('refuses a published directory, so nothing beneath it can be lost', () => {
    expect(() => vfsStore.getState().unlink('/projects')).toThrow(/EROFS/)
  })

  it('refuses the root and a missing path', () => {
    expect(() => vfsStore.getState().unlink('/')).toThrow(/EBUSY/)
    expect(() => vfsStore.getState().unlink('/nope')).toThrow(/ENOENT/)
  })

  it('leaves sibling subtrees referentially identical', () => {
    vfsStore.getState().write('/scratch.md', 'mine')
    const projects = vfsStore.getState().read('/projects')

    vfsStore.getState().unlink('/scratch.md')

    expect(vfsStore.getState().read('/projects')).toBe(projects)
  })

  it('survives a persistence round trip: deleted stays deleted', () => {
    vfsStore.getState().write('/scratch.md', 'mine')
    vfsStore.getState().unlink('/scratch.md')

    const saved = { ...vfsStore.getState().overlay }
    vfsStore.getState().mount(tree())
    vfsStore.getState().applyOverlay(saved)

    expect(vfsStore.getState().read('/scratch.md')).toBeNull()
  })

  it('survives a persistence round trip: created stays created', () => {
    vfsStore.getState().mkdir('/notes', true)
    vfsStore.getState().write('/notes/a.md', 'kept')

    const saved = { ...vfsStore.getState().overlay }
    vfsStore.getState().mount(tree())
    vfsStore.getState().applyOverlay(saved)

    expect(vfsStore.getState().read('/notes/a.md')).toMatchObject({ content: 'kept' })
  })
})
