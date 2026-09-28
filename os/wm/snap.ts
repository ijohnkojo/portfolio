/**
 * Window snapping geometry. Pure, so the zones can be tested without a browser
 * and so `Window.tsx` stays about wiring rather than arithmetic.
 */
import type { Position, Size } from '@/os/kernel'

export type SnapZone = 'left' | 'right' | 'top'

export interface Bounds {
  width: number
  height: number
}

/** How close to an edge the pointer must get, in px. */
export const SNAP_MARGIN = 24

/**
 * Which zone a pointer at `point` is in, or null.
 *
 * Top wins over the sides, so the corners maximize rather than half-snapping —
 * dragging into a corner is almost always aiming for the top edge.
 */
export function zoneFor(point: Position, bounds: Bounds): SnapZone | null {
  if (point.y <= SNAP_MARGIN) return 'top'
  if (point.x <= SNAP_MARGIN) return 'left'
  if (point.x >= bounds.width - SNAP_MARGIN) return 'right'
  return null
}

export interface Geometry {
  position: Position
  size: Size
}

export function geometryFor(zone: SnapZone, bounds: Bounds): Geometry {
  const half = Math.round(bounds.width / 2)

  switch (zone) {
    case 'left':
      return { position: { x: 0, y: 0 }, size: { width: half, height: bounds.height } }
    case 'right':
      return {
        position: { x: bounds.width - half, y: 0 },
        size: { width: half, height: bounds.height },
      }
    case 'top':
      return {
        position: { x: 0, y: 0 },
        size: { width: bounds.width, height: bounds.height },
      }
  }
}

/** Arrow key → zone. Down means "restore", so it maps to null. */
export function zoneForKey(key: string): SnapZone | null | undefined {
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'ArrowUp') return 'top'
  if (key === 'ArrowDown') return null
  return undefined
}
