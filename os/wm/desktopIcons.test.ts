import { describe, expect, it } from 'vitest'

import { appNode, dir, file, type VFSNode } from '@/os/kernel'
import {
  CELL,
  CELL_GAP,
  EDGE_PADDING,
  clampToDesktop,
  desktopIcons,
  iconFor,
  parsePositions,
  serializePositions,
  slotFor,
} from './desktopIcons'

const BOUNDS = { width: 1000, height: 400 }

/** 400px tall fits three 88px cells with a 10px gap, so column two starts at index 3. */
const asset = (name: string, mime: string): VFSNode => ({ type: 'file', name, mime })

const CHILDREN: VFSNode[] = [
  file('notes.md', ''),
  appNode('terminal', 'terminal'),
  dir('scratch', {}),
  file('.positions', '{}'),
]

const namesOf = (children: VFSNode[] = CHILDREN, saved = {}, options = {}) =>
  desktopIcons(children, saved, BOUNDS, options).map((icon) => icon.name)

describe('iconFor', () => {
  it('takes an app icon from its id, which is what the manifest field points at', () => {
    expect(iconFor(appNode('terminal', 'terminal'))).toBe('/icons/terminal.svg')
  })

  it('resolves everything else from the mime type', () => {
    expect(iconFor(dir('scratch', {}))).toBe('/icons/folder.svg')
    expect(iconFor(file('notes.md', ''))).toBe('/icons/markdown.svg')
    expect(iconFor(asset('paper.pdf', 'application/pdf'))).toBe('/icons/pdf.svg')
    expect(iconFor(asset('figure.png', 'image/png'))).toBe('/icons/image.svg')
    expect(iconFor(asset('data.bin', 'application/octet-stream'))).toBe('/icons/file.svg')
  })
})

describe('listing', () => {
  it('hides dotfiles, which is what lets .positions live in the directory it describes', () => {
    expect(namesOf()).not.toContain('.positions')
    expect(namesOf(CHILDREN, {}, { showHidden: true })).toContain('.positions')
  })

  it('orders apps, then folders, then files, so the seeded launchers stay top-left', () => {
    expect(namesOf()).toEqual(['terminal', 'scratch', 'notes.md'])
  })

  it('gives every entry a path under /desktop', () => {
    expect(desktopIcons(CHILDREN, {}, BOUNDS).map((i) => i.path)).toContain('/desktop/notes.md')
  })
})

describe('placement', () => {
  it('fills a column downward before starting the next', () => {
    expect(slotFor(0, BOUNDS)).toEqual({ x: EDGE_PADDING, y: EDGE_PADDING })
    expect(slotFor(1, BOUNDS)).toEqual({
      x: EDGE_PADDING,
      y: EDGE_PADDING + CELL.height + CELL_GAP,
    })
    // Three per column at this height, so the fourth wraps across.
    expect(slotFor(3, BOUNDS)).toEqual({
      x: EDGE_PADDING + CELL.width + CELL_GAP,
      y: EDGE_PADDING,
    })
  })

  it('keeps at least one row on a desktop too short for a full cell', () => {
    expect(slotFor(1, { width: 500, height: 20 })).toMatchObject({ y: EDGE_PADDING })
  })

  it('honours a saved position and lays out the rest', () => {
    const icons = desktopIcons(CHILDREN, { 'notes.md': { x: 400, y: 300 } }, BOUNDS)
    const byName = Object.fromEntries(icons.map((i) => [i.name, i.position]))

    expect(byName['notes.md']).toEqual({ x: 400, y: 300 })
    expect(byName.terminal).toEqual({ x: EDGE_PADDING, y: EDGE_PADDING })
  })

  // A file cp'd from the terminal must not land underneath an icon that has
  // already been dragged somewhere.
  it('does not place a new icon on top of a dragged one', () => {
    const saved = { terminal: slotFor(0, BOUNDS) }
    const positions = desktopIcons(CHILDREN, saved, BOUNDS).map((i) => i.position)

    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(positions.length)
  })

  it('never places two fresh icons in the same slot', () => {
    const many = Array.from({ length: 12 }, (_, i) => file(`f${i}.md`, ''))
    const positions = desktopIcons(many, {}, BOUNDS).map((p) => `${p.position.x},${p.position.y}`)

    expect(new Set(positions).size).toBe(12)
  })
})

describe('positions file', () => {
  it('round-trips', () => {
    const positions = { terminal: { x: 12, y: 40 } }
    expect(parsePositions(serializePositions(positions))).toEqual(positions)
  })

  it('ends with a newline, so cat reads it cleanly', () => {
    expect(serializePositions({})).toBe('{}\n')
  })

  /**
   * It is a dotfile in a writable filesystem — anything can `echo nonsense >`
   * it. Losing the arrangement is a far better failure than losing the desktop.
   */
  it('degrades to defaults rather than throwing', () => {
    expect(parsePositions(null)).toEqual({})
    expect(parsePositions('')).toEqual({})
    expect(parsePositions('not json')).toEqual({})
    expect(parsePositions('[1,2,3]')).toEqual({})
    expect(parsePositions('"a string"')).toEqual({})
  })

  it('drops entries that are not a point, keeping the ones that are', () => {
    const text = '{"a":{"x":1,"y":2},"b":{"x":"nope","y":2},"c":null,"d":{"x":1}}'
    expect(parsePositions(text)).toEqual({ a: { x: 1, y: 2 } })
  })
})

describe('clampToDesktop', () => {
  it('keeps a dropped icon on screen', () => {
    expect(clampToDesktop({ x: -50, y: -50 }, BOUNDS)).toEqual({ x: 0, y: 0 })
    expect(clampToDesktop({ x: 9999, y: 9999 }, BOUNDS)).toEqual({
      x: BOUNDS.width - CELL.width,
      y: BOUNDS.height - CELL.height,
    })
  })

  it('does not go negative on a desktop smaller than one cell', () => {
    expect(clampToDesktop({ x: 50, y: 50 }, { width: 10, height: 10 })).toEqual({ x: 0, y: 0 })
  })
})
