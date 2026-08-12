'use client'

/**
 * Renders the process table. It never mutates it (design doc §8.4).
 *
 * This component subscribes to the *pid list* only, so it re-renders when a
 * window opens or closes and stays still while windows are dragged, resized, or
 * refocused. Each Window subscribes to its own entry from there.
 */
import { usePids } from '@/hooks/kernel'
import { Window } from './Window'

export function WindowManager() {
  const pids = usePids()

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pids.map((pid) => (
        <Window key={pid} pid={pid} />
      ))}
    </div>
  )
}
