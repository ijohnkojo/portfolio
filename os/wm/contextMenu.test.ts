import { describe, expect, it } from 'vitest'

import { appNode, dir, file, type VFSNode } from '@/os/kernel'
import { actionsFor, clampMenu, menuSize } from './contextMenu'

const asset = (name: string, mime: string): VFSNode => ({ type: 'file', name, mime, src: '/x' })

describe('actionsFor', () => {
  it('offers everything for an editable file', () => {
    expect(actionsFor(file('notes.md', '# hi'))).toEqual(['open', 'edit', 'rename', 'delete'])
  })

  it('drops Edit for a file whose bytes are not in the filesystem', () => {
    expect(actionsFor(asset('paper.pdf', 'application/pdf'))).toEqual([
      'open',
      'rename',
      'delete',
    ])
    // Text mime, but asset-backed — there is nothing here to edit (D-012).
    expect(actionsFor(asset('figure.txt', 'text/plain'))).not.toContain('edit')
  })

  /**
   * A shortcut is re-seeded at every boot (D-030), so Delete would appear to
   * work and silently revert. Offering less beats offering a lie.
   */
  it('offers only Open for an application shortcut', () => {
    expect(actionsFor(appNode('terminal', 'terminal'))).toEqual(['open'])
  })

  // Same reason `mv` refuses a directory: a rename is copy + remove, and the
  // copy path handles one file.
  it('does not offer Rename for a directory', () => {
    expect(actionsFor(dir('scratch', {}))).toEqual(['open', 'delete'])
  })
})

describe('clampMenu', () => {
  const viewport = { width: 1000, height: 800 }
  const size = menuSize(4)

  it('leaves a menu with room where it was opened', () => {
    expect(clampMenu({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 })
  })

  // Flipping keeps every item reachable; clipping would hide the last one.
  it('flips rather than clips near an edge', () => {
    const at = { x: 980, y: 780 }
    expect(clampMenu(at, size, viewport)).toEqual({
      x: 980 - size.width,
      y: 780 - size.height,
    })
  })

  it('never goes off the top-left, even on a viewport smaller than the menu', () => {
    expect(clampMenu({ x: 10, y: 10 }, size, { width: 50, height: 50 })).toEqual({ x: 0, y: 0 })
  })
})

describe('menuSize', () => {
  it('grows with the number of items', () => {
    expect(menuSize(2).height).toBeLessThan(menuSize(4).height)
    expect(menuSize(4).width).toBe(menuSize(2).width)
  })
})
