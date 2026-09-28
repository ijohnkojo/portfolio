import Link from 'next/link'
import type { KeyboardEvent } from 'react'

import { kindLabel } from '@/lib/graph/interact'
import { HIT, labelSide, nodePoint, type Geometry, type LabelSide } from '@/lib/graph/layout'
import type { GraphData, GraphNode } from '@/lib/graph/model'

import { FADED, type Lit } from './GraphCanvas'

/** Shift each control so its hit square, not its corner, sits on the node. */
const TRANSFORM: Record<LabelSide, string> = {
  right: `translate(-${HIT / 2}px, -50%)`,
  left: `translate(calc(-100% + ${HIT / 2}px), -50%)`,
  above: `translate(-50%, calc(-100% + ${HIT / 2}px))`,
  below: `translate(-50%, -${HIT / 2}px)`,
}

const FLEX: Record<LabelSide, string> = {
  right: 'flex-row',
  left: 'flex-row-reverse',
  above: 'flex-col-reverse',
  below: 'flex-col',
}

/** Sizes match `LABEL_FONT` in lib/graph/layout.ts, which the label-collision test uses. */
const LABEL: Record<GraphNode['ring'], string> = {
  0: 'text-sm font-medium text-neutral-950 dark:text-neutral-50',
  1: 'text-[13px] text-neutral-800 dark:text-neutral-200',
  2: 'text-xs text-neutral-700 dark:text-neutral-300',
  3: 'font-mono text-[11px] text-neutral-500',
}

/** A halo in the page's own colour, so a label stays legible over an edge. */
const HALO =
  '[text-shadow:0_0_2px_var(--background),0_0_4px_var(--background),0_0_6px_var(--background)]'

/**
 * The interactive layer: one real control per node, positioned in percentages
 * of the same frame the SVG draws in (D-042). A node is a `<button>` that
 * selects it; the OS node is a link that boots it (D-044).
 *
 * The graph is **one tab stop**: only the current node is in the tab order
 * (roving tabindex), and the arrow keys move between nodes — so a keyboard user
 * crosses the whole graph with one Tab rather than thirty.
 */
export function NodeLayer({
  graph,
  geometry,
  lit,
  selected,
  focused,
  visible,
  describedBy,
  register,
  onHover,
  onSelect,
  onFocusNode,
  onKeyDown,
}: {
  graph: GraphData
  geometry: Geometry
  lit: Lit | null
  selected: string | null
  focused: string
  visible: Set<string>
  describedBy: string
  register: (id: string, el: HTMLElement | null) => void
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onFocusNode: (id: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      role="group"
      aria-label="Knowledge graph"
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      className="pointer-events-none absolute inset-0"
    >
      {graph.nodes
        .filter((n) => visible.has(n.id))
        .map((n) => {
          const at = nodePoint(n.angle, n.ring, geometry)
          const side = labelSide(n.angle, n.ring)
          const faded = lit !== null && !lit.nodes.has(n.id)
          const isSelected = n.id === selected

          const className = [
            'pointer-events-auto absolute flex items-center gap-1.5 rounded-sm outline-none',
            'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-neutral-100',
            'transition-opacity duration-150 motion-reduce:transition-none',
            FLEX[side],
            n.id === focused || n.id === selected ? 'z-10' : '',
          ].join(' ')

          const style = {
            left: `${(at.x / geometry.width) * 100}%`,
            top: `${(at.y / geometry.height) * 100}%`,
            transform: TRANSFORM[side],
            opacity: faded ? FADED : 1,
          }

          const content = (
            <>
              <span aria-hidden="true" className="shrink-0" style={{ width: HIT, height: HIT }} />
              <span
                className={`max-w-[11rem] truncate whitespace-nowrap leading-tight ${LABEL[n.ring]} ${HALO} ${isSelected ? 'font-semibold' : ''}`}
              >
                {n.label}
                {n.opens && <span aria-hidden="true"> ↗</span>}
              </span>
              <span className="sr-only">
                {n.kind === 'me' ? '' : `, ${kindLabel(n)}`}
                {n.year !== null && n.kind === 'entry' ? `, ${n.year}` : ''}
                {n.opens ? ` — ${n.opens.label}` : ''}
              </span>
            </>
          )

          const common = {
            ref: (el: HTMLElement | null) => register(n.id, el),
            tabIndex: n.id === focused ? 0 : -1,
            className,
            style,
            title: n.title && n.title !== n.label ? n.title : undefined,
            onPointerEnter: () => onHover(n.id),
            onPointerLeave: () => onHover(null),
            onFocus: () => onFocusNode(n.id),
          }

          return n.opens ? (
            <Link key={n.id} href={n.opens.href} prefetch={false} {...common}>
              {content}
            </Link>
          ) : (
            <button key={n.id} type="button" aria-pressed={isSelected} onClick={() => onSelect(n.id)} {...common}>
              {content}
            </button>
          )
        })}
    </div>
  )
}
