/**
 * Graph geometry — pure, no DOM, no React, no disk (AGENTS.md invariant 2).
 *
 * Angles are **degrees clockwise from 12 o'clock**, like a clock face, so they
 * can be set by eye in `content/home/graph.json`. Every node sits on a ring at
 * a fixed angle; nothing is simulated, so nothing moves (D-041).
 */

/** 0 is the centre (me); 1 organisations and fields; 2 entries; 3 tools. */
export type Ring = 0 | 1 | 2 | 3

export interface Point {
  x: number
  y: number
}

/**
 * The closest two visible nodes on a ring may sit, in degrees. Tighter further
 * out, because a ring's circumference grows with its radius. Enforced for the
 * real graph, in every timeline year, by `load.test.ts` — a fallback angle that
 * lands on a neighbour fails the tests, and the fix is to hand-set it.
 */
export const MIN_SEPARATION: Record<Exclude<Ring, 0>, number> = {
  1: 24,
  2: 18,
  3: 10,
}

/** Into [0, 360). */
export function normaliseAngle(angle: number): number {
  return ((angle % 360) + 360) % 360
}

/** The short way round, in [0, 180]. */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(normaliseAngle(a) - normaliseAngle(b))
  return Math.min(d, 360 - d)
}

/** One decimal place — enough for layout, and keeps the page's data tidy. */
export function roundAngle(angle: number): number {
  // Normalise first: rounding first and normalising after reintroduces float
  // error (12.3 becomes 12.300000000000011).
  const rounded = Math.round(normaliseAngle(angle) * 10) / 10
  return rounded === 360 ? 0 : rounded
}

/**
 * The mean direction of a set of angles, or null when there is none — no
 * angles, or angles that cancel out (0 and 180). An arithmetic mean would put
 * 350 and 10 at 180, the opposite of where they are.
 */
export function circularMean(angles: number[]): number | null {
  if (angles.length === 0) return null
  let sin = 0
  let cos = 0
  for (const a of angles) {
    const rad = (a * Math.PI) / 180
    sin += Math.sin(rad)
    cos += Math.cos(rad)
  }
  if (Math.hypot(sin, cos) / angles.length < 1e-6) return null
  return normaliseAngle((Math.atan2(sin, cos) * 180) / Math.PI)
}

/**
 * The middle of the widest empty arc between the given angles — where a node
 * with no better claim goes. With nothing taken, 12 o'clock. Ties go to the
 * first gap clockwise from 0, so the result is deterministic.
 */
export function widestGapMidpoint(taken: number[]): number {
  if (taken.length === 0) return 0
  const sorted = [...taken].map(normaliseAngle).sort((a, b) => a - b)
  if (sorted.length === 1) return normaliseAngle(sorted[0] + 180)

  let best = { size: -1, start: 0 }
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    const end = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360
    if (end - start > best.size) best = { size: end - start, start }
  }
  return normaliseAngle(best.start + best.size / 2)
}

/** The smallest gap between any two of the angles; Infinity for fewer than two. */
export function minSeparation(angles: number[]): number {
  if (angles.length < 2) return Infinity
  const sorted = [...angles].map(normaliseAngle).sort((a, b) => a - b)
  let min = sorted[0] + 360 - sorted[sorted.length - 1]
  for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i] - sorted[i - 1])
  return min
}

/** A point `radius` from `centre`, at a clock angle: 0 is up, 90 is right. */
export function polar(angle: number, radius: number, centre: Point): Point {
  const rad = (angle * Math.PI) / 180
  return {
    x: centre.x + radius * Math.sin(rad),
    y: centre.y - radius * Math.cos(rad),
  }
}

/**
 * Which way a node's label runs, so it reads away from the centre: rightwards
 * on the right half, leftwards on the left, centred near the top and bottom
 * where either would crowd the neighbours.
 */
export function labelAnchor(angle: number): 'start' | 'middle' | 'end' {
  const a = normaliseAngle(angle)
  if (angularDistance(a, 0) < 15 || angularDistance(a, 180) < 15) return 'middle'
  return a < 180 ? 'start' : 'end'
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * An edge as an SVG path: a quadratic curve whose control point is the
 * chord's midpoint pulled toward the centre by `bend` (0 is a straight line,
 * 1 passes through the centre). Bending inward keeps long edges off the
 * labels on the outside of the rings.
 */
export function edgePath(a: Point, b: Point, centre: Point, bend = 0.35): string {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const c = { x: mid.x + (centre.x - mid.x) * bend, y: mid.y + (centre.y - mid.y) * bend }
  return `M ${r1(a.x)} ${r1(a.y)} Q ${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`
}
