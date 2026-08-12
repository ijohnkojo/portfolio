import { describe, expect, it } from 'vitest'

import { TILE_MODES, isTileMode, tileLayout, type TileMode } from './tiling'
import type { Geometry } from './snap'

const bounds = { width: 1000, height: 600 }

const area = (g: Geometry) => g.size.width * g.size.height

function overlaps(a: Geometry, b: Geometry): boolean {
  return (
    a.position.x < b.position.x + b.size.width &&
    b.position.x < a.position.x + a.size.width &&
    a.position.y < b.position.y + b.size.height &&
    b.position.y < a.position.y + a.size.height
  )
}

function anyOverlap(layout: Geometry[]): boolean {
  return layout.some((a, i) => layout.slice(i + 1).some((b) => overlaps(a, b)))
}

const tilingModes: TileMode[] = ['grid', 'columns', 'rows']

describe('tileLayout', () => {
  it('returns nothing for no windows', () => {
    for (const mode of TILE_MODES) expect(tileLayout(0, bounds, mode)).toEqual([])
  })

  it('produces one tile per window', () => {
    for (const mode of TILE_MODES) {
      for (const count of [1, 2, 3, 4, 5, 9]) {
        expect(tileLayout(count, bounds, mode)).toHaveLength(count)
      }
    }
  })

  describe.each(tilingModes)('%s', (mode) => {
    it.each([1, 2, 3, 4, 5, 9])('never overlaps with %i windows', (count) => {
      expect(anyOverlap(tileLayout(count, bounds, mode))).toBe(false)
    })

    // Whole-pixel division, so tiles meet flush instead of leaving seams.
    it.each([1, 2, 3, 4, 5, 9])('covers the desktop exactly with %i windows', (count) => {
      const layout = tileLayout(count, bounds, mode)
      const covered = layout.reduce((sum, g) => sum + area(g), 0)
      expect(covered).toBe(bounds.width * bounds.height)
    })

    it.each([1, 2, 3, 4, 5, 9])('stays inside the bounds with %i windows', (count) => {
      for (const g of tileLayout(count, bounds, mode)) {
        expect(g.position.x).toBeGreaterThanOrEqual(0)
        expect(g.position.y).toBeGreaterThanOrEqual(0)
        expect(g.position.x + g.size.width).toBeLessThanOrEqual(bounds.width)
        expect(g.position.y + g.size.height).toBeLessThanOrEqual(bounds.height)
      }
    })
  })

  it('gives a single window the whole desktop', () => {
    for (const mode of tilingModes) {
      expect(tileLayout(1, bounds, mode)[0]).toEqual({
        position: { x: 0, y: 0 },
        size: { width: 1000, height: 600 },
      })
    }
  })

  it('splits two windows into halves, side by side in grid and columns', () => {
    for (const mode of ['grid', 'columns'] as TileMode[]) {
      const [a, b] = tileLayout(2, bounds, mode)
      expect(a.size.width).toBe(500)
      expect(b.position.x).toBe(500)
      expect(a.size.height).toBe(600)
    }
  })

  it('stacks rows top to bottom', () => {
    const [a, b] = tileLayout(2, bounds, 'rows')
    expect(a.size.height).toBe(300)
    expect(b.position.y).toBe(300)
    expect(a.size.width).toBe(1000)
  })

  // Three in a 2-column grid: the last row stretches rather than leaving a hole.
  it('stretches the final grid row to fill the width', () => {
    const layout = tileLayout(3, bounds, 'grid')
    expect(layout[0].size.width).toBe(500)
    expect(layout[1].size.width).toBe(500)
    expect(layout[2].size.width).toBe(1000)
    expect(layout[2].position.x).toBe(0)
  })

  it('handles an odd width without leaving a seam', () => {
    const odd = { width: 999, height: 601 }
    const layout = tileLayout(3, odd, 'columns')
    const total = layout.reduce((sum, g) => sum + g.size.width, 0)
    expect(total).toBe(999)
    expect(layout[2].position.x + layout[2].size.width).toBe(999)
  })
})

describe('cascade', () => {
  it('offsets each window instead of stacking them exactly', () => {
    const layout = tileLayout(3, bounds, 'cascade')
    expect(layout[0].position).toEqual({ x: 0, y: 0 })
    expect(layout[1].position.x).toBeGreaterThan(layout[0].position.x)
    expect(layout[2].position.x).toBeGreaterThan(layout[1].position.x)
  })

  it('leaves windows smaller than the desktop, so they read as overlapping', () => {
    for (const g of tileLayout(4, bounds, 'cascade')) {
      expect(g.size.width).toBeLessThan(bounds.width)
      expect(g.size.height).toBeLessThan(bounds.height)
    }
  })

  it('wraps rather than marching off the desktop', () => {
    const layout = tileLayout(20, bounds, 'cascade')
    for (const g of layout) {
      expect(g.position.x + g.size.width).toBeLessThanOrEqual(bounds.width)
    }
  })
})

describe('isTileMode', () => {
  it('accepts the four modes and nothing else', () => {
    for (const mode of TILE_MODES) expect(isTileMode(mode)).toBe(true)
    expect(isTileMode('spiral')).toBe(false)
    expect(isTileMode('')).toBe(false)
  })
})
