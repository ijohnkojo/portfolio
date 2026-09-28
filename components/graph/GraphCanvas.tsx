import { edgeBend, edgePath, nodePoint, type Geometry, type Point } from '@/lib/graph/layout'
import type { GraphData, GraphNode } from '@/lib/graph/model'

/** What a highlight leaves at full strength; everything else fades. */
export interface Lit {
  nodes: Set<string>
  edges: Set<string>
}

/** How far everything outside a highlight fades. */
export const FADED = 0.18

const FADE = 'transition-opacity duration-150 motion-reduce:transition-none'

/**
 * The drawing: rings, edges and node marks. Decoration only — `aria-hidden`,
 * and no pointer events — because every interactive thing is a real button in
 * the layer above it (D-042). Both layers place nodes with `nodePoint` in the
 * same frame, so they cannot drift apart.
 */
export function GraphCanvas({
  graph,
  geometry,
  lit,
  selected,
  visible,
}: {
  graph: GraphData
  geometry: Geometry
  lit: Lit | null
  selected: string | null
  visible: Set<string>
}) {
  const centre = { x: geometry.width / 2, y: geometry.height / 2 }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const at = new Map(graph.nodes.map((n) => [n.id, nodePoint(n.angle, n.ring, geometry)]))
  const opacity = (on: boolean) => (lit && !on ? FADED : 1)

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
      focusable="false"
    >
      <g className="text-neutral-200 dark:text-neutral-800" fill="none" stroke="currentColor">
        {([1, 2, 3] as const).map((ring) => (
          <circle key={ring} cx={centre.x} cy={centre.y} r={geometry.radii[ring]} strokeWidth={1} />
        ))}
      </g>

      <g fill="none" stroke="currentColor">
        {graph.edges
          .filter((e) => visible.has(e.source) && visible.has(e.target))
          .map((e) => {
            const on = lit?.edges.has(e.id) ?? false
            const spoke = e.source === 'me' || e.target === 'me'
            const bend = spoke ? 0 : edgeBend(byId.get(e.source)!.angle, byId.get(e.target)!.angle)
            return (
              <path
                key={e.id}
                d={edgePath(at.get(e.source)!, at.get(e.target)!, centre, bend)}
                strokeWidth={on ? 1.5 : 1}
                className={`${FADE} ${on ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-300 dark:text-neutral-700'}`}
                style={{ opacity: opacity(on) }}
              />
            )
          })}
      </g>

      <g>
        {graph.nodes
          .filter((n) => visible.has(n.id))
          .map((n) => (
            <g key={n.id} className={FADE} style={{ opacity: opacity(lit?.nodes.has(n.id) ?? false) }}>
              <Mark node={n} at={at.get(n.id)!} selected={n.id === selected} />
            </g>
          ))}
      </g>
    </svg>
  )
}

/** Base size of each kind's mark, in frame units. */
const SIZE = { me: 9, org: 6.5, field: 6.5, entry: 5.5, tool: 3.25 } as const

/**
 * One node's mark. Shape carries kind, so the graph reads without colour:
 * filled circle for an organisation, hollow for a field; for work, a circle
 * for a project, a square for a paper, a diamond for a talk; a small dot for a
 * tool. A node that opens something (the OS) gets an outer ring.
 */
export function Mark({ node, at, selected }: { node: GraphNode; at: Point; selected: boolean }) {
  const r = SIZE[node.kind]
  const strong = 'fill-neutral-800 dark:fill-neutral-200'

  let shape
  if (node.kind === 'field') {
    shape = (
      <circle
        cx={at.x}
        cy={at.y}
        r={r}
        style={{ fill: 'var(--background)' }}
        className="stroke-neutral-800 dark:stroke-neutral-200"
        strokeWidth={1.75}
      />
    )
  } else if (node.kind === 'entry' && node.collection === 'papers') {
    shape = <rect x={at.x - r} y={at.y - r} width={r * 2} height={r * 2} className={strong} />
  } else if (node.kind === 'entry' && node.collection === 'presentations') {
    const d = r * 1.35
    shape = <path d={`M ${at.x} ${at.y - d} L ${at.x + d} ${at.y} L ${at.x} ${at.y + d} L ${at.x - d} ${at.y} Z`} className={strong} />
  } else if (node.kind === 'tool') {
    shape = <circle cx={at.x} cy={at.y} r={r} className="fill-neutral-400 dark:fill-neutral-500" />
  } else {
    shape = <circle cx={at.x} cy={at.y} r={r} className={node.kind === 'me' ? 'fill-neutral-950 dark:fill-neutral-50' : strong} />
  }

  return (
    <>
      {node.opens && (
        <circle cx={at.x} cy={at.y} r={r + 4} fill="none" strokeWidth={1} className="stroke-neutral-500" />
      )}
      {shape}
      {selected && (
        <circle
          cx={at.x}
          cy={at.y}
          r={r + (node.opens ? 8 : 5)}
          fill="none"
          strokeWidth={1.5}
          className="stroke-neutral-900 dark:stroke-neutral-100"
        />
      )}
    </>
  )
}
