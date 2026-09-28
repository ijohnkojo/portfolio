/**
 * Applies a tiling request to the real process table.
 *
 * Separate from `tiling.ts` so the geometry stays pure and testable. This half
 * is the part that touches the DOM and the stores, and it lives in the window
 * manager because arranging windows is the WM's business — an app can ask for a
 * layout over the event bus, but it cannot perform one (D-023).
 */
import { processStore, systemAPI } from '@/os/kernel'
import { desktopBounds } from './desktop'
import { tileLayout, type TileMode } from './tiling'

export function applyTiling(mode: TileMode): void {
  const bounds = desktopBounds()
  if (bounds.width === 0 || bounds.height === 0) return

  // Minimized windows are not on screen; tiling around them would leave holes.
  // Sorted by pid so repeating the same layout is stable rather than shuffling.
  const windows = Object.values(processStore.getState().processes)
    .filter((proc) => proc.state !== 'minimized')
    .sort((a, b) => a.pid - b.pid)

  const layout = tileLayout(windows.length, bounds, mode)

  // Through `snap`, so each window records its pre-tile geometry and
  // Alt+Shift+Down restores one individually.
  windows.forEach((proc, index) => {
    systemAPI.window.snap(proc.pid, layout[index])
  })
}
