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

/**
 * The side of the invisible square over each mark that makes the mark itself
 * clickable, in CSS pixels. Labels start just beyond it.
 */
export const HIT = 20

/** Label type per ring, in CSS pixels — matched by the classes in NodeLayer.tsx. */
export const LABEL_FONT: Record<Ring, { size: number; em: number }> = {
  0: { size: 14, em: 0.58 },
  1: { size: 13, em: 0.55 },
  2: { size: 12, em: 0.55 },
  3: { size: 11, em: 0.6 }, // monospace
}

/** Labels truncate past this width (`max-w-[11rem]`). */
export const LABEL_MAX_WIDTH = 176

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Roughly where a label's text will sit, in the same pixel frame as `at` —
 * estimated from its length rather than measured, so it can be tested in
 * bare node. Deliberately a little generous: an estimate that errs wide makes
 * the collision test strict, which is the safe direction.
 */
export function labelBox(text: string, at: Point, side: LabelSide, ring: Ring): Box {
  const { size, em } = LABEL_FONT[ring]
  const w = Math.min(text.length * size * em, LABEL_MAX_WIDTH)
  const h = size * 1.25
  const gap = HIT / 2 + 6 // half the hit square, then `gap-1.5` before the text
  switch (side) {
    case 'right':
      return { left: at.x + gap, right: at.x + gap + w, top: at.y - h / 2, bottom: at.y + h / 2 }
    case 'left':
      return { left: at.x - gap - w, right: at.x - gap, top: at.y - h / 2, bottom: at.y + h / 2 }
    case 'above':
      return { left: at.x - w / 2, right: at.x + w / 2, top: at.y - gap - h, bottom: at.y - gap }
    case 'below':
      return { left: at.x - w / 2, right: at.x + w / 2, top: at.y + gap, bottom: at.y + gap + h }
  }
}

/** Whether two boxes overlap, with `pad` pixels of required clearance. */
export function overlaps(a: Box, b: Box, pad = 0): boolean {
  return a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad
}

/** A geometry shrunk or grown uniformly — as the graph is when its box narrows. */
export function scaleGeometry(geometry: Geometry, scale: number): Geometry {
  return {
    width: geometry.width * scale,
    height: geometry.height * scale,
    radii: {
      0: geometry.radii[0] * scale,
      1: geometry.radii[1] * scale,
      2: geometry.radii[2] * scale,
      3: geometry.radii[3] * scale,
    },
    centreRadius: geometry.centreRadius * scale,
  }
}

/** A point `radius` from `centre`, at a clock angle: 0 is up, 90 is right. */
export function polar(angle: number, radius: number, centre: Point): Point {
  const rad = (angle * Math.PI) / 180
  return {
    x: centre.x + radius * Math.sin(rad),
    y: centre.y - radius * Math.cos(rad),
  }
}

/** Where a node's label sits relative to its mark. */
export type LabelSide = 'right' | 'left' | 'above' | 'below'

/**
 * Labels read away from the centre: to the right on the right half, to the
 * left on the left, and above or below near 12 and 6 o'clock, where a sideways
 * label would run into its neighbours. The centre's label goes below it.
 */
export function labelSide(angle: number, ring: Ring): LabelSide {
  if (ring === 0) return 'below'
  const a = normaliseAngle(angle)
  if (angularDistance(a, 0) < 20) return 'above'
  if (angularDistance(a, 180) < 20) return 'below'
  return a < 180 ? 'right' : 'left'
}

/**
 * The drawing's frame, in SVG user units. The graph box keeps this aspect
 * ratio, so the SVG and the HTML control layer on top of it — positioned in
 * percentages of the same box — can never disagree about where a node is
 * (D-042). Units are roughly CSS pixels at the desktop width, which is what
 * the fixed-size HTML labels are measured against.
 */
export interface Geometry {
  width: number
  height: number
  radii: Record<Ring, number>
  /** The centre is a disc, not a dot: its name sits inside it. */
  centreRadius: number
}

export const DESKTOP: Geometry = {
  width: 800,
  height: 660,
  radii: { 0: 0, 1: 110, 2: 200, 3: 290 },
  centreRadius: 48,
}

/** Where a node sits in a geometry's frame. */
export function nodePoint(angle: number, ring: Ring, geometry: Geometry): Point {
  return polar(angle, geometry.radii[ring], { x: geometry.width / 2, y: geometry.height / 2 })
}

/**
 * How far an edge bows toward the centre, from how far apart its ends are
 * round the circle: nodes at nearly the same angle get a straight line, nodes
 * on opposite sides the full bend. A fixed bend hooks a short edge between
 * neighbouring angles into a loop.
 */
export function edgeBend(angleA: number, angleB: number, max = 0.35): number {
  return max * Math.min(1, angularDistance(angleA, angleB) / 90)
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
