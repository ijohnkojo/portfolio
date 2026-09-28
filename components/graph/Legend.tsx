import type { ReactNode } from 'react'

/**
 * How to read the marks, and how to use the graph. It sits above the
 * inspector, beside the introduction, and stays put — it no longer gives way
 * when something is selected. No state, so it renders on the server.
 */
export function Legend() {
  const items: Array<[string, ReactNode]> = [
    ['Organisation', <circle key="o" cx="8" cy="8" r="5" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Field', <circle key="f" cx="8" cy="8" r="4.5" style={{ fill: 'var(--background)' }} strokeWidth="1.5" className="stroke-neutral-800 dark:stroke-neutral-200" />],
    ['Project', <circle key="p" cx="8" cy="8" r="4.5" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Paper', <rect key="r" x="3.5" y="3.5" width="9" height="9" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Talk', <path key="t" d="M 8 2 L 14 8 L 8 14 L 2 8 Z" className="fill-neutral-800 dark:fill-neutral-200" />],
    ['Tool', <circle key="l" cx="8" cy="8" r="3" className="fill-neutral-400 dark:fill-neutral-500" />],
  ]

  return (
    <section
      aria-labelledby="graph-legend"
      className="space-y-4 rounded-md border border-neutral-200 p-5 dark:border-neutral-800"
    >
      <h2 id="graph-legend" className="font-mono text-[11px] tracking-widest text-neutral-500 uppercase">
        Reading the graph
      </h2>
      <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
        Hover a node to trace what it connects to. Select one to see it below.
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
    </section>
  )
}
