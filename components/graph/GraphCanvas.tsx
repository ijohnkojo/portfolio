import { nodePoint, type Geometry, type Point } from '@/lib/graph/layout'
import type { GraphData, GraphNode } from '@/lib/graph/model'

/** What a highlight leaves at full strength; everything else fades. */
export interface Lit {
  nodes: Set<string>
  edges: Set<string>
}

/** How far everything outside a highlight fades. */
export const FADED = 0.18

/**
 * The centre fades less: it is the anchor, and should stay findable while
 * something else is traced.
 */
export const FADED_CENTRE = 0.35

const FADE = 'transition-opacity duration-150 motion-reduce:transition-none'

/**
 * What the timeline just added fades in (`graph-enter` in globals.css), so a
 * replay reads as the graph growing. Nothing moves — nodes appear in place.
 */
export const ENTER = 'graph-enter'

/**
 * The drawing: edges and node marks. The rings are not drawn — the layout
 * implies them, and the lines read cleaner without them. Decoration only — `aria-hidden`,
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
  entering,
}: {
  graph: GraphData
  geometry: Geometry
  lit: Lit | null
  selected: string | null
  visible: Set<string>
  /** What the timeline added in the step just taken. */
  entering: Lit
}) {
  const at = new Map(graph.nodes.map((n) => [n.id, nodePoint(n.angle, n.ring, geometry)]))
  const opacity = (on: boolean, id?: string) => (lit && !on ? (id === 'me' ? FADED_CENTRE : FADED) : 1)
  const me = graph.nodes.find((n) => n.kind === 'me')

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
      focusable="false"
    >
      {/* Straight lines, node to node. Any that cross the middle pass under the centre disc. */}
      <g stroke="currentColor">
        {graph.edges
          .filter((e) => visible.has(e.source) && visible.has(e.target))
          .map((e) => {
            const on = lit?.edges.has(e.id) ?? false
            const [a, b] = [at.get(e.source)!, at.get(e.target)!]
            return (
              <line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={on ? 1.5 : 1}
                className={`${FADE} ${entering.edges.has(e.id) ? ENTER : ''} ${on ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-300 dark:text-neutral-700'}`}
                style={{ opacity: opacity(on) }}
              />
            )
          })}
      </g>

      <g>
        {/*
          A solid disc under the centre, outside the fade: without it, a faded
          centre lets the edges beneath it show through and its name smears.
        */}
        {me && (
          <circle
            cx={at.get(me.id)!.x}
            cy={at.get(me.id)!.y}
            r={geometry.centreRadius}
            style={{ fill: 'var(--background)' }}
          />
        )}
        {graph.nodes
          .filter((n) => visible.has(n.id))
          .map((n) => (
            <g key={n.id} className={`${FADE} ${entering.nodes.has(n.id) ? ENTER : ''}`} style={{ opacity: opacity(lit?.nodes.has(n.id) ?? false, n.id) }}>
              <Mark node={n} at={at.get(n.id)!} selected={n.id === selected} centreRadius={geometry.centreRadius} />
            </g>
          ))}
      </g>
    </svg>
  )
}

/** Base size of each kind's mark, in frame units. The centre's comes from the geometry. */
const SIZE = { org: 6.5, field: 6.5, entry: 5.5, tool: 3.25 } as const

/**
 * One node's mark. The centre is a disc in the site's accent, with a soft glow
 * and its name set inside it by the control above (D-045). Everything else is
 * neutral, and shape carries kind, so the graph reads without colour:
 * filled circle for an organisation, hollow for a field; for work, a circle
 * for a project, a square for a paper, a diamond for a talk; a small dot for a
 * tool. A node that opens something (the OS) gets an outer ring.
 */
export function Mark({
  node,
  at,
  selected,
  centreRadius,
}: {
  node: GraphNode
  at: Point
  selected: boolean
  centreRadius: number
}) {
  if (node.kind === 'me') {
    const r = centreRadius
    return (
      <>
        <circle cx={at.x} cy={at.y} r={r * 1.55} style={{ fill: 'var(--accent)', opacity: 0.06 }} />
        <circle cx={at.x} cy={at.y} r={r * 1.25} style={{ fill: 'var(--accent)', opacity: 0.12 }} />
        <circle cx={at.x} cy={at.y} r={r} style={{ fill: 'var(--accent)' }} />
        {selected && (
          <circle
            cx={at.x}
            cy={at.y}
            r={r + 5}
            fill="none"
            strokeWidth={1.5}
            className="stroke-neutral-900 dark:stroke-neutral-100"
          />
        )}
      </>
    )
  }

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
    shape = <circle cx={at.x} cy={at.y} r={r} className={strong} />
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
