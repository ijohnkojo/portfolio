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
    vfsStore.setState({ root: tree(), overlay: {} })
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

  it('replays an overlay and skips entries whose parent is gone', () => {
    vfsStore.getState().applyOverlay({
      '/notes.md': 'restored',
      '/deleted-dir/file.md': 'orphan',
    })

    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'restored' })
    expect(vfsStore.getState().read('/deleted-dir/file.md')).toBeNull()
  })
})
