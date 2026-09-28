import Link from 'next/link'
import type { CSSProperties, KeyboardEvent } from 'react'

import { kindLabel, labelledOnPhone } from '@/lib/graph/interact'
import { HIT, labelSide, nodePoint, type Geometry, type LabelSide } from '@/lib/graph/layout'
import type { GraphData, GraphNode } from '@/lib/graph/model'

import { ENTER, FADED, FADED_CENTRE, type Lit } from './GraphCanvas'

/** Shift each control so its hit square, not its corner, sits on the node. */
const TRANSFORM: Record<LabelSide, string> = {
  right: `translate(-${HIT / 2}px, -50%)`,
  left: `translate(calc(-100% + ${HIT / 2}px), -50%)`,
  above: `translate(-50%, calc(-100% + ${HIT / 2}px))`,
  below: `translate(-50%, -${HIT / 2}px)`,
}

/** The label's side from `md` up… */
const FLEX: Record<LabelSide, string> = {
  right: 'md:flex-row',
  left: 'md:flex-row-reverse',
  above: 'md:flex-col-reverse',
  below: 'md:flex-col',
}

/** …and on a phone, where the inner ring's labels take the side `phoneLabelSides` picks (D-050). */
const PHONE_FLEX: Record<LabelSide, string> = {
  right: 'max-md:flex-row',
  left: 'max-md:flex-row-reverse',
  above: 'max-md:flex-col-reverse',
  below: 'max-md:flex-col',
}

/** Sizes match `LABEL_FONT` in lib/graph/layout.ts, which the label-collision test uses. */
const LABEL: Record<GraphNode['ring'], string> = {
  0: 'text-sm font-medium text-neutral-950 dark:text-neutral-50',
  // A size down on a phone: PHONE_LABEL_FONT.
  1: 'text-[13px] max-md:text-xs text-neutral-800 dark:text-neutral-200',
  2: 'text-xs text-neutral-700 dark:text-neutral-300',
  // neutral-500 on the dark background is 4.2:1, under AA's 4.5 for small text.
  3: 'font-mono text-[11px] text-neutral-500 dark:text-neutral-400',
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
  phoneSides,
  lit,
  selected,
  focused,
  visible,
  entering,
  describedBy,
  register,
  onHover,
  onSelect,
  onFocusNode,
  onKeyDown,
}: {
  graph: GraphData
  geometry: Geometry
  /** Where the inner ring's labels go on a phone (`phoneLabelSides`, D-050). */
  phoneSides: Map<string, LabelSide>
  lit: Lit | null
  selected: string | null
  focused: string
  visible: Set<string>
  /** Nodes the timeline added in the step just taken; they fade in. */
  entering: Set<string>
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
          const phoneSide = phoneSides.get(n.id) ?? side
          const faded = lit !== null && !lit.nodes.has(n.id)
          const isSelected = n.id === selected

          const className = [
            // gap-0.5 is LABEL_GAP in lib/graph/layout.ts, which the label-collision test uses.
            'pointer-events-auto absolute flex items-center gap-0.5 rounded-sm outline-none',
            'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-neutral-100',
            'transition-opacity duration-150 motion-reduce:transition-none',
            FLEX[side],
            PHONE_FLEX[phoneSide],
            // The transform follows the side, so it switches with it: phone first, desktop from md.
            '[transform:var(--place-phone)] md:[transform:var(--place)]',
            n.id === focused || n.id === selected ? 'z-10' : '',
            entering.has(n.id) ? ENTER : '',
          ].join(' ')

          const style = {
            left: `${(at.x / geometry.width) * 100}%`,
            top: `${(at.y / geometry.height) * 100}%`,
            '--place': TRANSFORM[side],
            '--place-phone': TRANSFORM[phoneSide],
            opacity: faded ? FADED : 1,
          } as CSSProperties

          const content = (
            <>
              <span aria-hidden="true" className="shrink-0" style={{ width: HIT, height: HIT }} />
              {/*
                On a phone only the inner ring keeps a visible label, by its
                short name where it has one (D-050); the full name stays in the
                accessibility tree either way, because the visually hidden copy
                below carries it.
              */}
              <span
                aria-hidden="true"
                className={`max-w-[11rem] truncate whitespace-nowrap leading-tight ${LABEL[n.ring]} ${HALO} ${isSelected ? 'font-semibold' : ''} ${labelledOnPhone(n) ? '' : 'max-md:hidden'}`}
              >
                {n.short ? (
                  <>
                    <span className="max-md:hidden">{n.label}</span>
                    <span className="md:hidden">{n.short}</span>
                  </>
                ) : (
                  n.label
                )}
                {n.opens && <span> ↗</span>}
              </span>
              <span className="sr-only">
                {n.title ?? n.label}
                {n.kind === 'me' ? '' : `, ${kindLabel(n)}`}
                {n.year !== null && n.kind === 'entry' ? `, ${n.year}` : ''}
                {n.opens ? ` — ${n.opens.label}` : ''}
              </span>
            </>
          )

          if (n.kind === 'me') {
            // The centre is a disc with the first name inside it, sized in
            // percentages of the frame so it grows and shrinks with the
            // drawing — unlike the other labels, which stay a fixed size.
            const d = geometry.centreRadius * 2
            return (
              <button
                key={n.id}
                ref={(el) => register(n.id, el)}
                type="button"
                tabIndex={n.id === focused ? 0 : -1}
                aria-pressed={isSelected}
                onClick={() => onSelect(n.id)}
                onPointerEnter={() => onHover(n.id)}
                onPointerLeave={() => onHover(null)}
                onFocus={() => onFocusNode(n.id)}
                className={[
                  'pointer-events-auto absolute flex items-center justify-center rounded-full outline-none',
                  'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-neutral-100',
                  'transition-opacity duration-150 motion-reduce:transition-none',
                  entering.has(n.id) ? ENTER : '',
                ].join(' ')}
                style={{
                  left: `${((at.x - geometry.centreRadius) / geometry.width) * 100}%`,
                  top: `${((at.y - geometry.centreRadius) / geometry.height) * 100}%`,
                  width: `${(d / geometry.width) * 100}%`,
                  height: `${(d / geometry.height) * 100}%`,
                  opacity: faded ? FADED_CENTRE : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  // Smaller on a phone, where the disc is about 50px across (D-045's trigger, D-050).
                  className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase md:text-xs md:tracking-[0.18em]"
                  style={{ color: 'var(--accent-ink)' }}
                >
                  {n.label.split(' ')[0]}
                </span>
                <span className="sr-only">{n.label}</span>
              </button>
            )
          }

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
