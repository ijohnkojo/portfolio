import { describe, expect, it } from 'vitest'

import { appNode, dir, file, type VFSNode } from '@/kernel'
import {
  back,
  breadcrumb,
  canGoBack,
  canGoForward,
  createNavigation,
  currentPath,
  describeNode,
  forward,
  navigate,
  parentOf,
  sortEntries,
} from './navigation'

describe('history', () => {
  it('starts nowhere to go', () => {
    const nav = createNavigation('/')
    expect(currentPath(nav)).toBe('/')
    expect(canGoBack(nav)).toBe(false)
    expect(canGoForward(nav)).toBe(false)
  })

  it('walks back and forward again', () => {
    let nav = navigate(navigate(createNavigation('/'), '/papers'), '/papers/hq')
    expect(currentPath(nav)).toBe('/papers/hq')

    nav = back(nav)
    expect(currentPath(nav)).toBe('/papers')
    expect(canGoForward(nav)).toBe(true)

    nav = forward(nav)
    expect(currentPath(nav)).toBe('/papers/hq')
  })

  /**
   * Having gone back and then somewhere else, the branch you abandoned is not
   * somewhere "forward" of you any more — the same rule a browser follows.
   */
  it('drops the forward branch once you go somewhere new', () => {
    let nav = navigate(navigate(createNavigation('/'), '/papers'), '/papers/hq')
    nav = navigate(back(nav), '/projects')

    expect(currentPath(nav)).toBe('/projects')
    expect(canGoForward(nav)).toBe(false)
    expect(nav.history).toEqual(['/', '/papers', '/projects'])
  })

  it('ignores navigating to where you already are', () => {
    const nav = navigate(createNavigation('/papers'), '/papers')
    expect(nav.history).toEqual(['/papers'])
  })

  it('stops at either end rather than falling off', () => {
    const nav = createNavigation('/')
    expect(back(nav)).toBe(nav)
    expect(forward(nav)).toBe(nav)
  })
})

describe('breadcrumb', () => {
  it('gives every ancestor something to click', () => {
    expect(breadcrumb('/papers/hq')).toEqual([
      { name: '/', path: '/' },
      { name: 'papers', path: '/papers' },
      { name: 'hq', path: '/papers/hq' },
    ])
  })

  it('is just the root at the root', () => {
    expect(breadcrumb('/')).toEqual([{ name: '/', path: '/' }])
  })
})

describe('parentOf', () => {
  it('walks up, and stops at the root', () => {
    expect(parentOf('/papers/hq')).toBe('/papers')
    expect(parentOf('/papers')).toBe('/')
    expect(parentOf('/')).toBe('/')
  })
})

describe('sortEntries', () => {
  // Different from the desktop's order on purpose: there, launchers belong top
  // left; here, folders are what you are navigating.
  it('puts directories first, then applications, then files', () => {
    const entries: VFSNode[] = [
      file('z.md', ''),
      appNode('terminal', 'terminal'),
      dir('papers', {}),
      file('a.md', ''),
      dir('apps', {}),
    ]

    expect(sortEntries(entries).map((n) => n.name)).toEqual([
      'apps',
      'papers',
      'terminal',
      'a.md',
      'z.md',
    ])
  })

  it('does not mutate what it was given', () => {
    const entries = [file('b.md', ''), file('a.md', '')]
    sortEntries(entries)
    expect(entries.map((n) => n.name)).toEqual(['b.md', 'a.md'])
  })
})

describe('describeNode', () => {
  it('counts a directory, and gets the singular right', () => {
    expect(describeNode(dir('x', {}), 3)).toBe('3 items')
    expect(describeNode(dir('x', {}), 1)).toBe('1 item')
    expect(describeNode(dir('x', {}), 0)).toBe('0 items')
  })

  it('sizes an inline file and names an app', () => {
    expect(describeNode(file('a.md', 'hello'), 0)).toBe('5 B')
    expect(describeNode(appNode('terminal', 'terminal'), 0)).toBe('application')
  })

  // The bytes live in /public, not in the filesystem (D-012).
  it('says so for an asset-backed node rather than reporting 0 B', () => {
    const asset: VFSNode = { type: 'file', name: 'f.pdf', mime: 'application/pdf', src: '/x' }
    expect(describeNode(asset, 0)).toBe('external')
  })
})
