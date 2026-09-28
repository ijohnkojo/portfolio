/**
 * What the graph does when someone points at it — pure, so every rule here
 * runs in bare node (AGENTS.md invariant 2). The client component holds the
 * state; this holds the logic.
 */
import { angularDistance, type Ring } from './layout'
import type { GraphData, GraphNode } from './model'

export interface GraphIndex {
  byId: Map<string, GraphNode>
  /** Node id → the ids it shares an edge with. */
  adjacent: Map<string, Set<string>>
  /** Node id → the ids of its edges. */
  edgesOf: Map<string, Set<string>>
}

/** Build once per graph; everything below reads from it. */
export function indexGraph(graph: GraphData): GraphIndex {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const adjacent = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]))
  const edgesOf = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]))

  for (const e of graph.edges) {
    adjacent.get(e.source)?.add(e.target)
    adjacent.get(e.target)?.add(e.source)
    edgesOf.get(e.source)?.add(e.id)
    edgesOf.get(e.target)?.add(e.id)
  }
  return { byId, adjacent, edgesOf }
}

export function neighbours(index: GraphIndex, id: string): Set<string> {
  return new Set(index.adjacent.get(id) ?? [])
}

/**
 * What stays at full strength when a node is hovered, focused or selected: the
 * node, its direct neighbours, and the edges from it to them. An edge between
 * two of its neighbours is not included — it is not part of this node's
 * story, and lighting it makes the trace harder to read.
 */
export function highlight(index: GraphIndex, id: string): { nodes: Set<string>; edges: Set<string> } {
  if (!index.byId.has(id)) return { nodes: new Set(), edges: new Set() }
  return {
    nodes: new Set([id, ...(index.adjacent.get(id) ?? [])]),
    edges: new Set(index.edgesOf.get(id) ?? []),
  }
}

/**
 * What the timeline shows at `year`: every node that has joined by then, and
 * every edge whose ends both have. A node with no year is always there.
 */
export function visibleAt(graph: GraphData, year: number): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set(graph.nodes.filter((n) => n.year === null || n.year <= year).map((n) => n.id))
  const edges = new Set(
    graph.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)).map((e) => e.id)
  )
  return { nodes, edges }
}

/**
 * Every year the timeline can stop at, oldest first — each year in the span,
 * including any in which nothing joins, so the scrubber moves at an even pace.
 * Empty when nothing in the graph is dated, which means no timeline.
 */
export function timelineYears(graph: GraphData): number[] {
  if (!graph.years) return []
  const { first, last } = graph.years
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

/**
 * What joins the graph in exactly `year`: shown then, not the year before.
 * An edge joins with the later of its two ends. The first year of the span
 * brings everything visible in it, undated nodes included.
 */
export function joinedIn(graph: GraphData, year: number): { nodes: Set<string>; edges: Set<string> } {
  const now = visibleAt(graph, year)
  const before =
    graph.years && year > graph.years.first
      ? visibleAt(graph, year - 1)
      : { nodes: new Set<string>(), edges: new Set<string>() }
  return {
    nodes: new Set([...now.nodes].filter((id) => !before.nodes.has(id))),
    edges: new Set([...now.edges].filter((id) => !before.edges.has(id))),
  }
}

/** Clockwise / anticlockwise round a ring, out / in across rings, or home. */
export type NavMove = 'next' | 'previous' | 'outward' | 'inward' | 'centre'

function ringNodes(index: GraphIndex, ring: Ring, visible: Set<string>): GraphNode[] {
  return [...index.byId.values()]
    .filter((n) => n.ring === ring && visible.has(n.id))
    .sort((a, b) => a.angle - b.angle || a.id.localeCompare(b.id))
}

/** The visible node on `ring` nearest in angle; ties to the smaller angle. */
function nearestOn(index: GraphIndex, ring: Ring, angle: number, visible: Set<string>): GraphNode | null {
  let best: GraphNode | null = null
  for (const n of ringNodes(index, ring, visible)) {
    if (!best || angularDistance(n.angle, angle) < angularDistance(best.angle, angle)) best = n
  }
  return best
}

/**
 * Where a keyboard move goes from `current`. Only visible nodes are
 * candidates, so the timeline's hidden nodes are skipped. Moving across rings
 * lands on the nearest node by angle and passes over empty rings; a move with
 * nowhere to go stays put. From the centre, every move but `inward` goes out
 * to the node nearest 12 o'clock.
 */
export function nextNode(index: GraphIndex, current: string, move: NavMove, visible: Set<string>): string {
  const node = index.byId.get(current)
  if (move === 'centre' || !node) return 'me'

  if (node.ring === 0) {
    if (move === 'inward') return current
    for (const ring of [1, 2, 3] as const) {
      const n = nearestOn(index, ring, 0, visible)
      if (n) return n.id
    }
    return current
  }

  if (move === 'next' || move === 'previous') {
    const ring = ringNodes(index, node.ring, visible)
    const i = ring.findIndex((n) => n.id === current)
    if (i === -1 || ring.length < 2) return current
    const step = move === 'next' ? 1 : -1
    return ring[(i + step + ring.length) % ring.length].id
  }

  const step = move === 'outward' ? 1 : -1
  for (let ring = node.ring + step; ring >= 0 && ring <= 3; ring += step) {
    if (ring === 0) return 'me'
    const n = nearestOn(index, ring as Ring, node.angle, visible)
    if (n) return n.id
  }
  return current
}

/** What a node is, in a word — the inspector's eyebrow and part of its accessible name. */
export function kindLabel(node: GraphNode): string {
  if (node.kind === 'entry') {
    return { projects: 'Project', papers: 'Paper', presentations: 'Talk' }[node.collection ?? 'projects']
  }
  return { me: 'Me', org: 'Organisation', field: 'Field', tool: 'Tool' }[node.kind]
}

export interface ConnectionGroup {
  title: string
  nodes: GraphNode[]
}

const GROUPS: Array<{ title: string; kinds: GraphNode['kind'][] }> = [
  { title: 'Organisations', kinds: ['org'] },
  { title: 'Fields', kinds: ['field'] },
  { title: 'Work', kinds: ['entry'] },
  { title: 'Tools', kinds: ['tool'] },
]

/**
 * A node's connections as the inspector lists them: grouped by kind, sorted by
 * label, hidden nodes left out. The centre is left out too — every inner node
 * connects to it, so listing it says nothing.
 */
export function connections(index: GraphIndex, id: string, visible?: Set<string>): ConnectionGroup[] {
  const around = [...(index.adjacent.get(id) ?? [])]
    .filter((n) => n !== 'me' && (!visible || visible.has(n)))
    .map((n) => index.byId.get(n)!)
  return GROUPS.map(({ title, kinds }) => ({
    title,
    nodes: around.filter((n) => kinds.includes(n.kind)).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter((g) => g.nodes.length > 0)
}
