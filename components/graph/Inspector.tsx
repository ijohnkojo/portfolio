import Link from 'next/link'

import { kindLabel, type ConnectionGroup } from '@/lib/graph/interact'
import type { GraphNode } from '@/lib/graph/model'

const BUTTON =
  'inline-block rounded border border-neutral-400 px-3 py-1.5 font-mono text-xs hover:bg-neutral-900 hover:text-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-100 dark:hover:text-neutral-900'
const LINK = 'font-mono text-xs underline underline-offset-4 text-neutral-600 hover:text-current dark:text-neutral-400'

const CHIP =
  'rounded border border-neutral-200 px-2 py-0.5 text-xs hover:border-neutral-500 dark:border-neutral-800 dark:hover:border-neutral-500'

/**
 * The panel beside the graph: what a node is, where it leads, and its
 * connections as buttons — a second way to walk the graph, one that does not
 * need a pointer. With nothing selected it shows the centre, me, and lists all
 * the work; `selection` is false then, so there is nothing to clear.
 */
export function Inspector({
  node,
  selection,
  groups,
  work,
  titleId,
  sheet = false,
  onSelect,
  onClear,
}: {
  node: GraphNode
  /** True when a node was chosen; false for the default view of the centre. */
  selection: boolean
  groups: ConnectionGroup[]
  /** For the centre: every piece of work, newest first. */
  work: GraphNode[] | null
  titleId: string
  /** Inside the phone's bottom sheet: no border of its own, and the dialog handles Escape. */
  sheet?: boolean
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const external = node.href?.startsWith('https://')

  return (
    <aside
      data-graph-inspector
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selection && !sheet) onClear()
      }}
      className={
        sheet
          ? 'space-y-4 p-5'
          : 'h-full space-y-4 rounded-md border border-neutral-200 p-5 dark:border-neutral-800'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {node.kind !== 'me' && (
            <p className="font-mono text-[11px] tracking-widest text-neutral-500 uppercase">
              {kindLabel(node)}
              {node.date && <> · <time dateTime={node.date}>{node.date}</time></>}
            </p>
          )}
          <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight text-balance">
            {node.title ?? node.label}
          </h2>
        </div>
        {selection && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="-mr-1 shrink-0 rounded px-1.5 font-mono text-neutral-500 hover:text-current"
          >
            ×
          </button>
        )}
      </div>

      {node.summary && <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">{node.summary}</p>}

      {node.tags && node.tags.length > 0 && (
        <p className="flex flex-wrap gap-x-2 font-mono text-xs text-neutral-500">
          {node.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
      )}

      {(node.opens || node.href) && (
        <div className="flex flex-wrap items-center gap-3">
          {node.opens && (
            <Link href={node.opens.href} prefetch={false} className={BUTTON}>
              {node.opens.label} →
            </Link>
          )}
          {node.href &&
            (external ? (
              <a href={node.href} target="_blank" rel="noreferrer noopener" className={LINK}>
                Visit site ↗
              </a>
            ) : (
              <Link href={node.href} className={LINK}>
                {node.kind === 'me' ? 'About me' : 'Read the page'} →
              </Link>
            ))}
        </div>
      )}

      {groups.length > 0 && (
        <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="font-mono text-[11px] tracking-widest text-neutral-500 uppercase">{g.title}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {g.nodes.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => onSelect(n.id)} className={CHIP}>
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {work && work.length > 0 && (
        <div>
          <h3 className="font-mono text-[11px] tracking-widest text-neutral-500 uppercase">Work · newest first</h3>
          <ul className="mt-1.5 -mx-1.5">
            {work.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelect(n.id)}
                  className="flex w-full items-baseline justify-between gap-3 rounded px-1.5 py-1 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                >
                  <span>{n.label}</span>
                  {n.year !== null && <span className="shrink-0 font-mono text-xs text-neutral-500">{n.year}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
