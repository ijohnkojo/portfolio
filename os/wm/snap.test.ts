import { describe, expect, it } from 'vitest'

import { SNAP_MARGIN, geometryFor, zoneFor, zoneForKey } from './snap'

const bounds = { width: 1000, height: 600 }

describe('zoneFor', () => {
  it('finds the left and right edges', () => {
    expect(zoneFor({ x: 0, y: 300 }, bounds)).toBe('left')
    expect(zoneFor({ x: SNAP_MARGIN, y: 300 }, bounds)).toBe('left')
    expect(zoneFor({ x: 1000, y: 300 }, bounds)).toBe('right')
    expect(zoneFor({ x: 1000 - SNAP_MARGIN, y: 300 }, bounds)).toBe('right')
  })

  it('finds the top edge', () => {
    expect(zoneFor({ x: 500, y: 0 }, bounds)).toBe('top')
  })

  it('returns null away from every edge', () => {
    expect(zoneFor({ x: 500, y: 300 }, bounds)).toBeNull()
    expect(zoneFor({ x: SNAP_MARGIN + 1, y: SNAP_MARGIN + 1 }, bounds)).toBeNull()
  })

  // Aiming into a corner is nearly always aiming for the top edge.
  it('lets the top edge win in the corners', () => {
    expect(zoneFor({ x: 0, y: 0 }, bounds)).toBe('top')
    expect(zoneFor({ x: 1000, y: 0 }, bounds)).toBe('top')
  })

  it('does not snap along the bottom', () => {
    expect(zoneFor({ x: 500, y: 600 }, bounds)).toBeNull()
  })
})

describe('geometryFor', () => {
  it('halves the desktop for the sides, leaving no gap or overlap', () => {
    const left = geometryFor('left', bounds)
    const right = geometryFor('right', bounds)

    expect(left).toEqual({ position: { x: 0, y: 0 }, size: { width: 500, height: 600 } })
    expect(right.position.x + right.size.width).toBe(bounds.width)
    expect(left.size.width + right.size.width).toBe(bounds.width)
  })

  it('fills the desktop for the top', () => {
    expect(geometryFor('top', bounds)).toEqual({
      position: { x: 0, y: 0 },
      size: { width: 1000, height: 600 },
    })
  })

  it('keeps the halves flush on an odd width', () => {
    const odd = { width: 999, height: 600 }
    const left = geometryFor('left', odd)
    const right = geometryFor('right', odd)
    expect(right.position.x + right.size.width).toBe(999)
    expect(left.size.width + right.size.width).toBeGreaterThanOrEqual(999)
  })
})

describe('zoneForKey', () => {
  it('maps the arrows, with down meaning restore', () => {
    expect(zoneForKey('ArrowLeft')).toBe('left')
    expect(zoneForKey('ArrowRight')).toBe('right')
    expect(zoneForKey('ArrowUp')).toBe('top')
    expect(zoneForKey('ArrowDown')).toBeNull()
  })

  // undefined means "not our key" — distinct from null, which means "restore".
  it('returns undefined for anything else', () => {
    expect(zoneForKey('a')).toBeUndefined()
    expect(zoneForKey('Enter')).toBeUndefined()
  })
})
