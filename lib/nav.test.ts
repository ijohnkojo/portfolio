import { describe, expect, it } from 'vitest'

import { NAV, navState } from './nav'

describe('navState', () => {
  it('marks the page a link points at', () => {
    expect(navState('/', '/')).toBe('page')
    expect(navState('/about', '/about')).toBe('page')
    expect(navState('/projects/', '/projects')).toBe('page')
  })

  it('marks the section a writeup belongs to', () => {
    expect(navState('/projects/hq', '/projects')).toBe('section')
    expect(navState('/presentations/hq-agc-demo-day', '/presentations')).toBe('section')
  })

  it('never marks home as a section, and does not match on a shared prefix', () => {
    expect(navState('/about', '/')).toBeNull()
    expect(navState('/papersmith', '/papers')).toBeNull()
  })

  it('marks exactly one link on every page of the site', () => {
    for (const path of ['/', '/about', '/projects', '/projects/hq', '/papers/hscp', '/presentations', '/presentations/x']) {
      expect(NAV.filter((l) => navState(path, l.href) !== null)).toHaveLength(1)
    }
  })
})
