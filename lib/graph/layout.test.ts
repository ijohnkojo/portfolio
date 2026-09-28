import { describe, expect, it } from 'vitest'

import {
  angularDistance,
  circularMean,
  edgePath,
  labelAnchor,
  minSeparation,
  normaliseAngle,
  polar,
  roundAngle,
  widestGapMidpoint,
} from './layout'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

describe('angles', () => {
  it('normalises into [0, 360)', () => {
    expect(normaliseAngle(360)).toBe(0)
    expect(normaliseAngle(-10)).toBe(350)
    expect(normaliseAngle(725)).toBe(5)
  })

  it('measures the short way round', () => {
    expect(angularDistance(350, 10)).toBe(20)
    expect(angularDistance(10, 350)).toBe(20)
    expect(angularDistance(0, 180)).toBe(180)
  })

  it('rounds to a tenth of a degree and stays in range', () => {
    expect(roundAngle(12.345)).toBe(12.3)
    expect(roundAngle(359.97)).toBe(0)
  })
})

describe('circularMean', () => {
  it('averages across 12 o’clock the way a clock does, not the way arithmetic does', () => {
    close(circularMean([350, 10])!, 0)
    close(circularMean([80, 100])!, 90)
  })

  it('is null for nothing, and for angles that cancel out', () => {
    expect(circularMean([])).toBeNull()
    expect(circularMean([0, 180])).toBeNull()
  })
})

describe('widestGapMidpoint', () => {
  it('goes to 12 o’clock on an empty ring, and opposite a lone node', () => {
    expect(widestGapMidpoint([])).toBe(0)
    expect(widestGapMidpoint([90])).toBe(270)
  })

  it('finds the widest arc, including the one across 12 o’clock', () => {
    expect(widestGapMidpoint([0, 90, 180])).toBe(270)
    expect(widestGapMidpoint([100, 200, 300])).toBe(20) // 300 → 100 is 160°, the widest
  })

  it('breaks ties deterministically, clockwise from 0', () => {
    expect(widestGapMidpoint([0, 180])).toBe(90)
  })
})

describe('minSeparation', () => {
  it('is the closest pair, counting the wrap', () => {
    expect(minSeparation([10, 350, 180])).toBe(20)
    expect(minSeparation([0, 90, 180, 270])).toBe(90)
  })

  it('is Infinity for fewer than two', () => {
    expect(minSeparation([42])).toBe(Infinity)
  })
})

describe('polar', () => {
  const c = { x: 100, y: 100 }

  it('puts 0 at the top and 90 on the right, like a clock', () => {
    const top = polar(0, 50, c)
    close(top.x, 100)
    close(top.y, 50)
    const right = polar(90, 50, c)
    close(right.x, 150)
    close(right.y, 100)
    const bottom = polar(180, 50, c)
    close(bottom.y, 150)
  })
})

describe('labelAnchor', () => {
  it('reads away from the centre, centred at top and bottom', () => {
    expect(labelAnchor(0)).toBe('middle')
    expect(labelAnchor(180)).toBe('middle')
    expect(labelAnchor(90)).toBe('start')
    expect(labelAnchor(270)).toBe('end')
    expect(labelAnchor(355)).toBe('middle')
  })
})

describe('edgePath', () => {
  const c = { x: 0, y: 0 }

  it('is a straight line at zero bend', () => {
    expect(edgePath({ x: 10, y: 0 }, { x: 0, y: 10 }, c, 0)).toBe('M 10 0 Q 5 5 0 10')
  })

  it('pulls the control point toward the centre', () => {
    expect(edgePath({ x: 10, y: 0 }, { x: 0, y: 10 }, c, 0.5)).toBe('M 10 0 Q 2.5 2.5 0 10')
  })
})
