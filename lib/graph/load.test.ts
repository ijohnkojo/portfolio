/**
 * The real graph, built from the real `content/`. Where model.test.ts checks
 * the rules on fixtures, this checks that the content obeys them — and that
 * the hand-set layout stays legible in every year of the timeline.
 */
import { describe, expect, it } from 'vitest'

import { allEntries, getHomeFile, listAllPublished, listHomeFiles } from '@/lib/content'

import { visibleAt } from './interact'
import { MIN_SEPARATION, minSeparation } from './layout'
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
})
