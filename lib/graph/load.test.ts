/**
 * The real graph, built from the real `content/`. Where model.test.ts checks
 * the rules on fixtures, this checks that the content obeys them — and that
 * the hand-set layout stays legible in every year of the timeline.
 */
import { describe, expect, it } from 'vitest'

import { allEntries, getHomeFile, listAllPublished, listHomeFiles } from '@/lib/content'

import { labelledOnPhone, visibleAt } from './interact'
import {
  cropStage,
  DESKTOP,
  labelBox,
  labelSide,
  MIN_SEPARATION,
  minSeparation,
  nodePoint,
  overlaps,
  PHONE_DISC_CLEARANCE,
  PHONE_GUTTER,
  PHONE_LABEL_FONT,
  phoneFrame,
  phoneLabelSides,
  scaleGeometry,
  type Box,
} from './layout'
import { GRAPH_FILE, loadGraph } from './load'

const graph = loadGraph()
const byId = new Map(graph.nodes.map((n) => [n.id, n]))

describe('the real graph', () => {
  it('builds from content/home/graph.json, which is a real file the OS mounts at /home', () => {
    expect(getHomeFile(GRAPH_FILE)).not.toBeNull()
    expect(listHomeFiles().map((f) => f.name)).toContain(GRAPH_FILE)
  })

  it('has a node for every published entry, and none for a draft', () => {
    for (const e of listAllPublished()) expect(byId.has(`entry:${e.collection}/${e.slug}`), e.sourcePath).toBe(true)
    for (const e of allEntries().filter((e) => e.draft)) {
      expect(byId.has(`entry:${e.collection}/${e.slug}`), e.sourcePath).toBe(false)
    }
  })

  it('connects every node to something', () => {
    const touched = new Set(graph.edges.flatMap((e) => [e.source, e.target]))
    for (const n of graph.nodes) expect(touched.has(n.id), n.id).toBe(true)
  })

  it('has the OS as a node that boots it', () => {
    expect(byId.get('entry:projects/personal-os')?.opens).toEqual({ href: '/os', label: 'Launch the OS' })
  })

  it('has a timeline', () => {
    expect(graph.years).not.toBeNull()
  })

  // D-041: nothing is simulated, so nothing moves apart on its own. A node
  // placed too close to a neighbour — by hand or by the fallback — fails here,
  // in whichever year it first collides.
  it('keeps every ring legible in every year of the timeline', () => {
    const { first, last } = graph.years!
    for (let year = first; year <= last; year++) {
      const visible = visibleAt(graph, year).nodes
      for (const ring of [1, 2, 3] as const) {
        const onRing = graph.nodes.filter((n) => n.ring === ring && visible.has(n.id))
        const gap = minSeparation(onRing.map((n) => n.angle))
        expect(gap, `ring ${ring} in ${year}: ${onRing.map((n) => `${n.id}@${n.angle}`).join(', ')}`).toBeGreaterThanOrEqual(
          MIN_SEPARATION[ring]
        )
      }
    }
  })

  // A label runs outward, so it can collide with a node on the next ring out
  // or with another ring's label — something ring spacing alone cannot see.
  // Checked at full size and at 80%, about where the graph sits beside the
  // inspector at 1024px wide. Labels stay the same pixel size as the drawing
  // shrinks, which is why the smaller scale is the harder test.
  it.each([1, 0.8])('keeps labels clear of each other and of other marks at %s scale', (scale) => {
    const geometry = scaleGeometry(DESKTOP, scale)
    const mark = 7 * scale
    // The centre is a disc with its name inside: it has no label of its own to
    // collide, but every other label must stay off it, glow included.
    const disc = geometry.centreRadius + 6 * scale
    const { first, last } = graph.years!
    const clashes = new Set<string>()

    for (let year = first; year <= last; year++) {
      const shown = graph.nodes.filter((n) => visibleAt(graph, year).nodes.has(n.id))
      const placed = shown.map((n) => {
        const at = nodePoint(n.angle, n.ring, geometry)
        const text = n.opens ? `${n.label} ↗` : n.label
        return { id: n.id, at, box: labelBox(text, at, labelSide(n.angle, n.ring), n.ring) }
      })
      const markBox = (p: (typeof placed)[number]): Box => {
        const r = p.id === 'me' ? disc : mark
        return { left: p.at.x - r, right: p.at.x + r, top: p.at.y - r, bottom: p.at.y + r }
      }

      for (const a of placed) {
        for (const b of placed) {
          if (a.id === b.id || a.id === 'me') continue
          if (b.id !== 'me' && a.id < b.id && overlaps(a.box, b.box, 2)) clashes.add(`${a.id} label × ${b.id} label`)
          if (overlaps(a.box, markBox(b), 1)) clashes.add(`${a.id} label × ${b.id} mark`)
        }
      }
    }
    expect([...clashes].sort()).toEqual([])
  })

  // On a phone the frame is cropped to a square around the outer ring, and
  // only the inner ring is labelled, each on the side `phoneLabelSides` picks
  // (D-050). Those labels must stay inside the square — it clips — and clear
  // of each other and of every mark, in every year, from the narrowest phone
  // supported to the widest before the desktop layout takes over.
  it.each([360, 390, 767])('keeps phone labels inside the frame and clear at %ipx wide', (viewport) => {
    const sides = phoneLabelSides(graph.nodes)
    const scale = (viewport - 2 * PHONE_GUTTER) / cropStage(DESKTOP).side
    const geometry = scaleGeometry(DESKTOP, scale)
    const frame = phoneFrame(scale)
    const mark = 7 * scale
    const disc = geometry.centreRadius + PHONE_DISC_CLEARANCE
    const { first, last } = graph.years!
    const problems = new Set<string>()

    for (let year = first; year <= last; year++) {
      const shown = graph.nodes.filter((n) => visibleAt(graph, year).nodes.has(n.id))
      const at = new Map(shown.map((n) => [n.id, nodePoint(n.angle, n.ring, geometry)]))
      const labelled = shown
        .filter((n) => n.id !== 'me' && labelledOnPhone(n))
        .map((n) => ({ id: n.id, box: labelBox(n.short ?? n.label, at.get(n.id)!, sides.get(n.id)!, n.ring, PHONE_LABEL_FONT) }))
      for (const a of labelled) {
        const { box } = a
        if (box.left < frame.left || box.right > frame.right || box.top < frame.top || box.bottom > frame.bottom) {
          problems.add(`${a.id} label leaves the frame`)
        }
        for (const b of labelled) {
          if (a.id < b.id && overlaps(a.box, b.box, 2)) problems.add(`${a.id} label × ${b.id} label`)
        }
        for (const n of shown) {
          if (n.id === a.id) continue
          const p = at.get(n.id)!
          const r = n.id === 'me' ? disc : mark
          if (overlaps(box, { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r }, 1)) {
            problems.add(`${a.id} label × ${n.id} mark`)
          }
        }
      }
    }
    expect([...problems].sort()).toEqual([])
  })

  // Edges are straight lines, so an edge can run through a node it has nothing
  // to do with — HSCP to Python once passed dead through CERN/CMS, reading as
  // HSCP → CERN → Python. Every edge must clear every other node's mark. The
  // centre is exempt: an edge between nodes on opposite sides cannot avoid it,
  // and since everything connects to the centre, passing under it misleads no one.
  it('draws no edge through a node that is not one of its ends', () => {
    const CLEARANCE = 12 // frame units, from the node's centre
    const at = new Map(graph.nodes.map((n) => [n.id, nodePoint(n.angle, n.ring, DESKTOP)]))
    const through: string[] = []
    for (const e of graph.edges) {
      const a = at.get(e.source)!
      const b = at.get(e.target)!
      const dx = b.x - a.x
      const dy = b.y - a.y
      for (const n of graph.nodes) {
        if (n.id === e.source || n.id === e.target || n.id === 'me') continue
        const p = at.get(n.id)!
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
        const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
        if (d < CLEARANCE) through.push(`${e.id} passes ${d.toFixed(1)} from ${n.id}`)
      }
    }
    expect(through).toEqual([])
  })
})
