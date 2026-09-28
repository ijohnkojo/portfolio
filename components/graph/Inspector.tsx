import Link from 'next/link'
import type { ReactNode } from 'react'

import { kindLabel, type ConnectionGroup } from '@/lib/graph/interact'
import type { GraphNode } from '@/lib/graph/model'

const BUTTON =
  'inline-block rounded border border-neutral-400 px-3 py-1.5 font-mono text-xs hover:bg-neutral-900 hover:text-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-100 dark:hover:text-neutral-900'
const LINK = 'font-mono text-xs underline underline-offset-4 text-neutral-600 hover:text-current dark:text-neutral-400'

/**
 * The panel beside the graph. With nothing selected it explains the marks;
 * with a node selected it shows what the node is and where it leads, and lists
 * its connections as buttons — a second way to walk the graph, one that does
 * not need a pointer.
 */
export function Inspector({
  node,
  groups,
  titleId,
  onSelect,
  onClear,
}: {
  node: GraphNode | null
  groups: ConnectionGroup[]
  titleId: string
  onSelect: (id: string) => void
  onClear: () => void
}) {
  return (
    <aside
      data-graph-inspector
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && node) onClear()
      }}
      className="rounded-md border border-neutral-200 p-5 dark:border-neutral-800"
    >
      {node ? <Selected node={node} groups={groups} titleId={titleId} onSelect={onSelect} onClear={onClear} /> : <Legend titleId={titleId} />}
    </aside>
  )
}

function Selected({
  node,
  groups,
  titleId,
  onSelect,
  onClear,
}: {
  node: GraphNode
  groups: ConnectionGroup[]
  titleId: string
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const external = node.href?.startsWith('https://')

  return (
    <div className="space-y-4">
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
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="-mr-1 shrink-0 rounded px-1.5 font-mono text-neutral-500 hover:text-current"
        >
          ×
        </button>
      </div>

      {node.summary && <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">{node.summary}</p>}

      {node.tags && node.tags.length > 0 && (
        <p className="flex flex-wrap gap-x-2 font-mono text-xs text-neutral-400 dark:text-neutral-600">
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
                {node.kind === 'me' ? 'About' : 'Read the page'} →
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
                    <button
                      type="button"
                      onClick={() => onSelect(n.id)}
                      className="rounded border border-neutral-200 px-2 py-0.5 text-xs hover:border-neutral-500 dark:border-neutral-800 dark:hover:border-neutral-500"
                    >
                      {n.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The empty state: how to read the marks, and how to use the graph. */
function Legend({ titleId }: { titleId: string }) {
  const items: Array<[string, ReactNode]> = [
    ['Organisation', <circle key="o" cx="8" cy="8" r="5" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Field', <circle key="f" cx="8" cy="8" r="4.5" style={{ fill: 'var(--background)' }} strokeWidth="1.5" className="stroke-neutral-800 dark:stroke-neutral-200" />],
    ['Project', <circle key="p" cx="8" cy="8" r="4.5" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Paper', <rect key="r" x="3.5" y="3.5" width="9" height="9" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Talk', <path key="t" d="M 8 2 L 14 8 L 8 14 L 2 8 Z" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Tool', <circle key="l" cx="8" cy="8" r="3" className="fill-neutral-400 dark:fill-neutral-500" />],
  ]

  return (
    <div className="space-y-4">
      <h2 id={titleId} className="font-mono text-[11px] tracking-widest text-neutral-500 uppercase">
        Reading the graph
      </h2>
      <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
        Hover a node to trace what it connects to. Select one to see it here.
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        {items.map(([label, shape]) => (
          <li key={label} className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              {shape}
            </svg>
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
