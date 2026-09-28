'use client'

/**
 * Renders the process table. It never mutates it (design doc §8.4).
 *
 * This component subscribes to the *pid list* only, so it re-renders when a
 * window opens or closes and stays still while windows are dragged, resized, or
 * refocused. Each Window subscribes to its own entry from there.
 */
import { usePids } from '@/os/hooks/kernel'
import { SNAP_PREVIEW_ID } from './snapPreview'
import { Window } from './Window'

export function WindowManager() {
  const pids = usePids()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pids.map((pid) => (
        <Window key={pid} pid={pid} />
      ))}

      {/*
        The snap preview. Positioned by direct DOM writes during a drag and
        never through React state — rendering it from state would put a commit
        inside the mousemove loop, which is exactly what D-002 forbids.
      */}
      <div
        id={SNAP_PREVIEW_ID}
        aria-hidden
        className="pointer-events-none absolute hidden rounded-lg border-2 border-neutral-400/70 bg-neutral-400/15"
        style={{ zIndex: 999999 }}
      />
    </div>
  )
}
