/**
 * Imperative control of the snap-preview overlay.
 *
 * This exists as direct DOM manipulation rather than React state on purpose.
 * The preview has to update on every mousemove of a drag, and routing that
 * through a store or `useState` would put a React commit inside the gesture —
 * precisely the jank [D-002](../docs/decisions.md) and docs/gotchas.md are
 * built to avoid. `pnpm verify` asserts zero commits during a drag, so a
 * regression here fails a test rather than merely feeling bad.
 */
import { geometryFor, type Bounds, type SnapZone } from './snap'

export const SNAP_PREVIEW_ID = 'wm-snap-preview'

function element(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(SNAP_PREVIEW_ID)
}

export function showSnapPreview(zone: SnapZone, bounds: Bounds): void {
  const el = element()
  if (!el) return

  const { position, size } = geometryFor(zone, bounds)
  el.style.transform = `translate(${position.x}px, ${position.y}px)`
  el.style.width = `${size.width}px`
  el.style.height = `${size.height}px`
  el.classList.remove('hidden')
}

export function hideSnapPreview(): void {
  element()?.classList.add('hidden')
}
