/**
 * The desktop surface windows live on, and the arithmetic that needs it.
 *
 * Shared by the snap zones and the tiling controller so there is one answer to
 * "how big is the desktop" rather than two that can disagree.
 */
import type { Bounds } from './snap'

export const DESKTOP_ID = 'wm-desktop'

function element(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(DESKTOP_ID)
}

export function desktopBounds(): Bounds {
  const el = element()
  return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }
}

/** Pointer position relative to the desktop, from a mouse or touch drag event. */
export function pointerOf(event: unknown): { x: number; y: number } {
  const rect = element()?.getBoundingClientRect()
  const source = event as { clientX?: number; clientY?: number; touches?: TouchList }
  const point = source.touches?.[0] ?? source

  return {
    x: (point.clientX ?? 0) - (rect?.left ?? 0),
    y: (point.clientY ?? 0) - (rect?.top ?? 0),
  }
}
