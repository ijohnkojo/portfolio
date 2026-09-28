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
 * clickable, in CSS pixels. Labels start just beyond it. 24, the WCAG 2.2
 * minimum target size (2.5.8) — on a phone, where labels are hidden, the
 * square is the whole target.
 */
export const HIT = 24

/**
 * Between the hit square and the label's text, in CSS pixels (`gap-0.5`). The
 * square grew from 20 to 24 for target size and this shrank from 6 to 2, so
 * labels sit 2px nearer their marks than before rather than further out.
 */
export const LABEL_GAP = 2

/** Label type per ring, in CSS pixels — matched by the classes in NodeLayer.tsx. */
export const LABEL_FONT: Record<Ring, { size: number; em: number }> = {
  0: { size: 14, em: 0.58 },
  1: { size: 13, em: 0.55 },
  2: { size: 12, em: 0.55 },
  3: { size: 11, em: 0.6 }, // monospace
}

/** The inner ring's labels on a phone, a size down (`max-md:text-xs` in NodeLayer.tsx). */
export const PHONE_LABEL_FONT = { size: 12, em: 0.55 }

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
export function labelBox(
  text: string,
  at: Point,
  side: LabelSide,
  ring: Ring,
  font: { size: number; em: number } = LABEL_FONT[ring]
): Box {
  const { size, em } = font
  const w = Math.min(text.length * size * em, LABEL_MAX_WIDTH)
  const h = size * 1.25
  const gap = HIT / 2 + LABEL_GAP
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

/** The narrowest phone the layout is checked at, and its side gutter, in CSS px. */
export const PHONE_MIN_WIDTH = 360
export const PHONE_GUTTER = 16

/**
 * On a phone a label may cross the centre's glow but must clear the solid
 * disc by this many CSS px. The desktop keeps labels off the glow as well.
 */
export const PHONE_DISC_CLEARANCE = 2

/** Enough of a node to place its label: `GraphNode` satisfies it. */
export interface Placeable {
  id: string
  ring: Ring
  angle: number
  label: string
  /** The phone's shorter name, when the node has one. */
  short?: string
}

/**
 * Which side each inner-ring label takes on a phone, where only the inner
 * ring is labelled and the frame is cropped to a square (D-050). Its desktop
 * side first; if that leaves the square or lands on a label already placed or
 * on any mark, then above or below, outward first; then the remaining side.
 * Worked out at the narrowest phone, the hardest case — at wider phones the
 * drawing grows and the labels do not. Deterministic: nodes go in angle order.
 * A node with no side that fits keeps its desktop side, and the legibility
 * test in load.test.ts names it.
 */
export function phoneLabelSides(nodes: Placeable[], viewport = PHONE_MIN_WIDTH): Map<string, LabelSide> {
  const stage = cropStage(DESKTOP)
  const scale = (viewport - 2 * PHONE_GUTTER) / stage.side
  const geometry = scaleGeometry(DESKTOP, scale)
  const frame = phoneFrame(scale)
  const mark = 7 * scale
  // Off the solid disc, not its glow: on a phone the glow is the one place with room to spare.
  const disc = geometry.centreRadius + PHONE_DISC_CLEARANCE
  const markBoxes = nodes.map((n) => {
    const p = nodePoint(n.angle, n.ring, geometry)
    const r = n.ring === 0 ? disc : mark
    return { id: n.id, box: { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r } }
  })
  const placed: Box[] = []
  const sides = new Map<string, LabelSide>()

  for (const n of nodes.filter((m) => m.ring === 1).sort((x, y) => x.angle - y.angle || x.id.localeCompare(y.id))) {
    const at = nodePoint(n.angle, n.ring, geometry)
    const outward: LabelSide = angularDistance(n.angle, 0) <= 90 ? 'above' : 'below'
    const inward: LabelSide = outward === 'above' ? 'below' : 'above'
    const desktop = labelSide(n.angle, n.ring)
    const candidates = [...new Set<LabelSide>([desktop, outward, inward, 'right', 'left'])]
    const fits = (side: LabelSide) => {
      const box = labelBox(n.short ?? n.label, at, side, n.ring, PHONE_LABEL_FONT)
      if (box.left < frame.left || box.right > frame.right || box.top < frame.top || box.bottom > frame.bottom) return null
      if (placed.some((p) => overlaps(box, p, 2))) return null
      if (markBoxes.some((m) => m.id !== n.id && overlaps(box, m.box, 1))) return null
      return box
    }
    const side = candidates.find((c) => fits(c)) ?? desktop
    sides.set(n.id, side)
    placed.push(labelBox(n.short ?? n.label, at, side, n.ring, PHONE_LABEL_FONT))
  }
  return sides
}

/** The cropped square, in the coordinates of the desktop frame scaled by `scale`. */
export function phoneFrame(scale: number): Box {
  const stage = cropStage(DESKTOP)
  const left = ((DESKTOP.width - stage.side) / 2) * scale
  const top = ((DESKTOP.height - stage.side) / 2) * scale
  return { left, top, right: left + stage.side * scale, bottom: top + stage.side * scale }
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

/**
 * On a phone the frame is cropped to a square just around the outer ring:
 * the desktop frame's side margins exist for outer-ring labels, which a phone
 * does not show, so cropping them makes the drawing larger on a small screen.
 * The drawing itself is unchanged — same frame, same coordinates — and is
 * positioned inside the square by `cropStage`, so the SVG and the control layer
 * still share one coordinate function (D-042, D-050).
 */
export const PHONE_MARGIN = 20

/**
 * Where the full frame sits inside the square crop, in percentages of the
 * square: its size and offset. Pure CSS arithmetic, so the switch between the
 * two layouts needs no JavaScript and cannot flash on hydration.
 */
export function cropStage(geometry: Geometry, margin = PHONE_MARGIN) {
  const side = 2 * (geometry.radii[3] + margin)
  const pct = (v: number) => (v / side) * 100
  return {
    side,
    width: pct(geometry.width),
    height: pct(geometry.height),
    left: pct(side / 2 - geometry.width / 2),
    top: pct(side / 2 - geometry.height / 2),
  }
}

/** Where a node sits in a geometry's frame. */
export function nodePoint(angle: number, ring: Ring, geometry: Geometry): Point {
  return polar(angle, geometry.radii[ring], { x: geometry.width / 2, y: geometry.height / 2 })
}
