import { describe, expect, it } from 'vitest'

import {
  angularDistance,
  circularMean,
  edgeBend,
  labelBox,
  overlaps,
  scaleGeometry,
  edgePath,
  DESKTOP,
  labelSide,
  minSeparation,
  nodePoint,
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

describe('labelSide', () => {
  it('reads away from the centre, above and below near 12 and 6 o’clock', () => {
    expect(labelSide(0, 1)).toBe('above')
    expect(labelSide(350, 3)).toBe('above')
    expect(labelSide(180, 2)).toBe('below')
    expect(labelSide(90, 2)).toBe('right')
    expect(labelSide(270, 2)).toBe('left')
  })

  it('puts the centre’s label below it', () => {
    expect(labelSide(0, 0)).toBe('below')
  })
})

describe('nodePoint', () => {
  it('puts the centre at the middle of the frame, and rings at their radii', () => {
    expect(nodePoint(0, 0, DESKTOP)).toEqual({ x: DESKTOP.width / 2, y: DESKTOP.height / 2 })
    const p = nodePoint(90, 3, DESKTOP)
    close(p.x, DESKTOP.width / 2 + DESKTOP.radii[3])
    close(p.y, DESKTOP.height / 2)
  })

  it('leaves room inside the frame for every ring', () => {
    expect(DESKTOP.radii[3] * 2).toBeLessThan(Math.min(DESKTOP.width, DESKTOP.height))
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

describe('edgeBend', () => {
  it('is straight for nodes at the same angle, full for nodes a quarter-turn or more apart', () => {
    expect(edgeBend(70, 70)).toBe(0)
    expect(edgeBend(0, 90)).toBe(0.35)
    expect(edgeBend(0, 180)).toBe(0.35)
    expect(edgeBend(350, 35)).toBeCloseTo(0.175)
  })
})

describe('labelBox', () => {
  const at = { x: 100, y: 100 }

  it('sits beyond the hit square, on the given side', () => {
    const right = labelBox('abcd', at, 'right', 2)
    expect(right.left).toBe(116)
    expect(right.right).toBeCloseTo(116 + 4 * 12 * 0.55)
    const left = labelBox('abcd', at, 'left', 2)
    expect(left.right).toBe(84)
    expect(labelBox('abcd', at, 'above', 2).bottom).toBe(84)
    expect(labelBox('abcd', at, 'below', 2).top).toBe(116)
  })

  it('never grows past the truncation width', () => {
    const b = labelBox('x'.repeat(200), at, 'right', 2)
    expect(b.right - b.left).toBe(176)
  })
})

describe('overlaps', () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 }

  it('is true for intersecting boxes and false for separate ones', () => {
    expect(overlaps(a, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(true)
    expect(overlaps(a, { left: 11, top: 0, right: 20, bottom: 10 })).toBe(false)
  })

  it('treats padding as required clearance', () => {
    expect(overlaps(a, { left: 11, top: 0, right: 20, bottom: 10 }, 2)).toBe(true)
  })
})

describe('scaleGeometry', () => {
  it('scales the frame and every radius together', () => {
    const g = scaleGeometry(DESKTOP, 0.5)
    expect(g.width).toBe(DESKTOP.width / 2)
    expect(g.radii[3]).toBe(DESKTOP.radii[3] / 2)
  })
})
