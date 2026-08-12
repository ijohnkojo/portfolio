/**
 * Tiling: arrange *every* window, as opposed to snapping, which moves one.
 *
 * Pure geometry, so the layouts are tested without a browser.
 */
import type { Bounds, Geometry } from './snap'

export type TileMode = 'grid' | 'columns' | 'rows' | 'cascade'

export const TILE_MODES: readonly TileMode[] = ['grid', 'columns', 'rows', 'cascade']

export function isTileMode(value: string): value is TileMode {
  return (TILE_MODES as readonly string[]).includes(value)
}

const CASCADE_STEP = 32
const CASCADE_WRAP = 8
/** Cascaded windows take this share of the desktop. */
const CASCADE_SCALE = 0.62

/**
 * Split `total` into `parts` whole pixels that sum exactly to it, so tiles meet
 * flush instead of leaving a rounding gap between them.
 */
function divide(total: number, parts: number): number[] {
  const base = Math.floor(total / parts)
  const remainder = total - base * parts
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0))
}

function offsets(sizes: readonly number[]): number[] {
  let running = 0
  return sizes.map((size) => {
    const start = running
    running += size
    return start
  })
}

export function tileLayout(count: number, bounds: Bounds, mode: TileMode): Geometry[] {
  if (count <= 0) return []

  if (mode === 'cascade') {
    const width = Math.round(bounds.width * CASCADE_SCALE)
    const height = Math.round(bounds.height * CASCADE_SCALE)
    return Array.from({ length: count }, (_, i) => {
      const step = i % CASCADE_WRAP
      return {
        position: { x: step * CASCADE_STEP, y: step * CASCADE_STEP },
        size: { width, height },
      }
    })
  }

  if (mode === 'columns') {
    const widths = divide(bounds.width, count)
    const xs = offsets(widths)
    return widths.map((width, i) => ({
      position: { x: xs[i], y: 0 },
      size: { width, height: bounds.height },
    }))
  }

  if (mode === 'rows') {
    const heights = divide(bounds.height, count)
    const ys = offsets(heights)
    return heights.map((height, i) => ({
      position: { x: 0, y: ys[i] },
      size: { width: bounds.width, height },
    }))
  }

  // grid: near-square, and the final row stretches so there is never a hole.
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)

  const heights = divide(bounds.height, rows)
  const ys = offsets(heights)
  const layout: Geometry[] = []

  for (let row = 0; row < rows; row++) {
    const remaining = count - row * columns
    const inThisRow = Math.min(columns, remaining)
    const widths = divide(bounds.width, inThisRow)
    const xs = offsets(widths)

    for (let column = 0; column < inThisRow; column++) {
      layout.push({
        position: { x: xs[column], y: ys[row] },
        size: { width: widths[column], height: heights[row] },
      })
    }
  }

  return layout
}
