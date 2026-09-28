import { useId } from 'react'

/**
 * The timeline under the graph: a native range input over the years, and a
 * Replay button that walks it from the first year to the last. It holds no
 * state — `KnowledgeGraph` owns the year, so the drawing, the controls and the
 * inspector all read the same one.
 *
 * It defaults to the last year, the whole graph, so the server-rendered page
 * and the page without JavaScript show everything. Until the page hydrates the
 * controls are disabled rather than dead: without JavaScript they could not
 * move the graph.
 */
export function Timeline({
  years,
  year,
  shown,
  total,
  playing,
  ready,
  onYear,
  onReplay,
  onStop,
}: {
  years: number[]
  year: number
  /** How many nodes the graph shows at `year`, and in all. */
  shown: number
  total: number
  playing: boolean
  /** False until hydration; the controls cannot do anything before it. */
  ready: boolean
  onYear: (year: number) => void
  onReplay: () => void
  onStop: () => void
}) {
  const labelId = useId()
  const first = years[0]
  const last = years[years.length - 1]
  const all = year === last

  return (
    <div role="group" aria-labelledby={labelId} className="mt-6 flex items-center gap-4 font-mono text-xs text-neutral-500">
      <span id={labelId} className="sr-only">
        Timeline
      </span>
      <button
        type="button"
        disabled={!ready}
        onClick={playing ? onStop : onReplay}
        className="w-16 shrink-0 rounded-sm border border-neutral-300 px-2 py-1 text-neutral-700 outline-none hover:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-500 dark:focus-visible:ring-neutral-100"
      >
        {playing ? 'stop' : 'replay'}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={first}
          max={last}
          step={1}
          value={year}
          disabled={!ready}
          aria-label="Year"
          aria-valuetext={all ? `${year}, everything` : `up to ${year}`}
          onChange={(e) => onYear(Number(e.currentTarget.value))}
          className="block w-full cursor-pointer accent-neutral-800 disabled:cursor-default dark:accent-neutral-200"
        />
        <div aria-hidden="true" className="mt-1 flex justify-between">
          {years.map((y) => (
            <span key={y} className={y === year ? 'text-neutral-900 dark:text-neutral-100' : ''}>
              {y}
            </span>
          ))}
        </div>
      </div>

      {/* Hidden on a phone, where the years need the room; the current one is highlighted on the axis. */}
      <output aria-live="off" className="w-28 shrink-0 text-right tabular-nums max-sm:hidden">
        {all ? 'everything' : `up to ${year}`}
        <span className="block">
          {shown} of {total} nodes
        </span>
      </output>
    </div>
  )
}
