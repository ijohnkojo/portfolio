import { describe, expect, it } from 'vitest'

import { connections, highlight, indexGraph, kindLabel, neighbours, nextNode, visibleAt } from './interact'
import type { GraphData, GraphNode } from './model'

/*
 * A hand-made graph, so every case below can be read off the picture:
 *
 *   ring 0   me
 *   ring 1   org:a @ 0      field:b @ 180
 *   ring 2   entry:e1 @ 10 (2024)   entry:e2 @ 170 (2026)   entry:e3 @ 300 (2025)
 *   ring 3   tool:t @ 20 (2024)
 */
const node = (id: string, ring: GraphNode['ring'], angle: number, year: number | null = null): GraphNode => ({
  id,
  kind: (id === 'me' ? 'me' : id.split(':')[0]) as GraphNode['kind'],
  ring,
  label: id,
  angle,
  year,
})
const edge = (a: string, b: string) => {
  const [source, target] = [a, b].sort()
  return { id: `${source}|${target}`, source, target }
}

const graph: GraphData = {
  nodes: [
    node('me', 0, 0),
    node('org:a', 1, 0),
    node('field:b', 1, 180),
    node('entry:e1', 2, 10, 2024),
    node('entry:e2', 2, 170, 2026),
    node('entry:e3', 2, 300, 2025),
    node('tool:t', 3, 20, 2024),
  ],
  edges: [
    edge('me', 'org:a'),
    edge('me', 'field:b'),
    edge('entry:e1', 'org:a'),
    edge('entry:e1', 'tool:t'),
    edge('entry:e2', 'field:b'),
    edge('entry:e1', 'entry:e2'),
    edge('entry:e3', 'field:b'),
  ],
  years: { first: 2024, last: 2026 },
}
const index = indexGraph(graph)
const all = new Set(graph.nodes.map((n) => n.id))

describe('neighbours and highlight', () => {
  it('finds direct neighbours only', () => {
    expect(neighbours(index, 'entry:e1')).toEqual(new Set(['org:a', 'tool:t', 'entry:e2']))
  })

  it('lights the node, its neighbours, and the edges from it — not edges between neighbours', () => {
    const h = highlight(index, 'org:a')
    expect(h.nodes).toEqual(new Set(['org:a', 'me', 'entry:e1']))
    expect(h.edges).toEqual(new Set(['me|org:a', 'entry:e1|org:a']))
    // me–field:b joins two nodes that are not org:a; it stays faded.
    expect(h.edges.has('field:b|me')).toBe(false)
  })

  it('lights nothing for an unknown id', () => {
    expect(highlight(index, 'nope').nodes.size).toBe(0)
  })
})

describe('visibleAt', () => {
  it('shows what has joined by that year, and undated nodes always', () => {
    const v = visibleAt(graph, 2024)
    expect(v.nodes).toEqual(new Set(['me', 'org:a', 'field:b', 'entry:e1', 'tool:t']))
  })

  it('shows an edge only when both of its ends are shown', () => {
    const v = visibleAt(graph, 2025)
    expect(v.edges.has('entry:e1|entry:e2')).toBe(false)
    expect(v.edges.has('entry:e3|field:b')).toBe(true)
  })

  it('shows everything at the last year', () => {
    const v = visibleAt(graph, 2026)
    expect(v.nodes).toEqual(all)
    expect(v.edges.size).toBe(graph.edges.length)
  })
})

describe('nextNode — keyboard moves', () => {
  it('goes clockwise and anticlockwise round a ring, wrapping', () => {
    expect(nextNode(index, 'entry:e1', 'next', all)).toBe('entry:e2')
    expect(nextNode(index, 'entry:e3', 'next', all)).toBe('entry:e1')
    expect(nextNode(index, 'entry:e1', 'previous', all)).toBe('entry:e3')
  })

  it('crosses rings to the node nearest in angle', () => {
    expect(nextNode(index, 'field:b', 'outward', all)).toBe('entry:e2')
    expect(nextNode(index, 'entry:e3', 'inward', all)).toBe('org:a') // 300 is 60° from 0, 120° from 180
    expect(nextNode(index, 'org:a', 'inward', all)).toBe('me')
  })

  it('goes out from the centre to the node nearest 12 o’clock, and nowhere inward', () => {
    expect(nextNode(index, 'me', 'next', all)).toBe('org:a')
    expect(nextNode(index, 'me', 'outward', all)).toBe('org:a')
    expect(nextNode(index, 'me', 'inward', all)).toBe('me')
  })

  it('goes home from anywhere', () => {
    expect(nextNode(index, 'tool:t', 'centre', all)).toBe('me')
  })

  it('stays put with nowhere to go', () => {
    expect(nextNode(index, 'tool:t', 'next', all)).toBe('tool:t')
    expect(nextNode(index, 'tool:t', 'outward', all)).toBe('tool:t')
  })

  it('skips nodes the timeline hides, and passes over empty rings', () => {
    const in2024 = visibleAt(graph, 2024).nodes
    expect(nextNode(index, 'entry:e1', 'next', in2024)).toBe('entry:e1') // e2, e3 not yet
    const noEntries = new Set(['me', 'org:a', 'field:b', 'tool:t'])
    expect(nextNode(index, 'tool:t', 'inward', noEntries)).toBe('org:a')
  })
})

describe('kindLabel', () => {
  it('names entries by collection and everything else by kind', () => {
    expect(kindLabel({ ...node('entry:x', 2, 0), collection: 'papers' })).toBe('Paper')
    expect(kindLabel({ ...node('entry:y', 2, 0), collection: 'presentations' })).toBe('Talk')
    expect(kindLabel(node('org:a', 1, 0))).toBe('Organisation')
    expect(kindLabel(node('tool:t', 3, 0))).toBe('Tool')
  })
})

describe('connections', () => {
  it('groups by kind in a fixed order, sorted by label', () => {
    expect(connections(index, 'entry:e1').map((g) => [g.title, g.nodes.map((n) => n.id)])).toEqual([
      ['Organisations', ['org:a']],
      ['Work', ['entry:e2']],
      ['Tools', ['tool:t']],
    ])
  })

  it('leaves out the centre, which every inner node connects to', () => {
    expect(connections(index, 'org:a').flatMap((g) => g.nodes.map((n) => n.id))).toEqual(['entry:e1'])
  })

  it('lists the inner ring for the centre itself', () => {
    expect(connections(index, 'me').map((g) => g.title)).toEqual(['Organisations', 'Fields'])
  })

  it('leaves out what the timeline hides', () => {
    const in2024 = visibleAt(graph, 2024).nodes
    expect(connections(index, 'entry:e1', in2024).some((g) => g.title === 'Work')).toBe(false)
  })
})
