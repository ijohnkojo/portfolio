/**
 * The desktop's contents, as data.
 *
 * The desktop is a *view of `/desktop`*, a real directory in the VFS — so
 * `cp x /desktop` puts something there, `ls /desktop` lists it, and `rm` takes
 * it off, with no icon registry to keep in sync. See D-030.
 *
 * This module turns that directory into positioned icons and is pure, so it
 * tests in bare node like everything else that matters. The component does the
 * DOM; this decides what goes where.
 */
import type { VFSNode } from '@/os/kernel'
import type { IconSize } from './settings'

export const DESKTOP_PATH = '/desktop'

/** Where icon positions persist. A dotfile riding the write overlay, as `/home/.history` does (D-020). */
export const POSITIONS_PATH = `${DESKTOP_PATH}/.positions`

/**
 * One icon cell, per size setting. Tall enough for two lines of label at the OS
 * font size; `glyph` is the mask square inside it.
 */
export const ICON_SIZES: Record<IconSize, { width: number; height: number; glyph: number }> = {
  small: { width: 68, height: 74, glyph: 24 },
  medium: { width: 84, height: 88, glyph: 32 },
  large: { width: 106, height: 112, glyph: 44 },
}

/** The default, so callers with no opinion about size need not carry one. */
export const CELL = ICON_SIZES.medium
export const CELL_GAP = 10
export const EDGE_PADDING = 12

export interface Cell {
  width: number
  height: number
}

export interface Bounds {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type Positions = Record<string, Point>

export interface Icon {
  /** The entry name, which is also its key in `.positions`. */
  name: string
  path: string
  node: VFSNode
  /** What the label reads — the manifest name for an app, resolved by the caller. */
  icon: string
  position: Point
}

/**
 * Which glyph a node gets. App icons come from the manifest's `icon` field,
 * which has pointed at `/icons/<id>.svg` since the foundation slice with
 * nothing behind it; everything else is resolved from the mime type here.
 */
export function iconFor(node: VFSNode): string {
  if (node.type === 'app') return `/icons/${node.appId}.svg`
  if (node.type === 'dir') return '/icons/folder.svg'

  if (node.mime === 'text/markdown') return '/icons/markdown.svg'
  if (node.mime === 'application/pdf') return '/icons/pdf.svg'
  if (node.mime.startsWith('image/')) return '/icons/image.svg'
  return '/icons/file.svg'
}

/** How many icons fit in one column before wrapping to the next. */
function perColumn(bounds: Bounds, cell: Cell): number {
  const usable = bounds.height - EDGE_PADDING
  return Math.max(1, Math.floor(usable / (cell.height + CELL_GAP)))
}

/** Grid slots fill downward first, then across — as a desktop does. */
export function slotFor(index: number, bounds: Bounds, cell: Cell = CELL): Point {
  const rows = perColumn(bounds, cell)
  return {
    x: EDGE_PADDING + Math.floor(index / rows) * (cell.width + CELL_GAP),
    y: EDGE_PADDING + (index % rows) * (cell.height + CELL_GAP),
  }
}

/** The slot a dragged icon has come to rest nearest, so nothing is placed on top of it. */
function nearestSlot(point: Point, bounds: Bounds, cell: Cell): number {
  const rows = perColumn(bounds, cell)
  const column = Math.max(0, Math.round((point.x - EDGE_PADDING) / (cell.width + CELL_GAP)))
  const row = Math.max(
    0,
    Math.min(rows - 1, Math.round((point.y - EDGE_PADDING) / (cell.height + CELL_GAP)))
  )
  return column * rows + row
}

/**
 * Read the saved positions.
 *
 * **A corrupt file degrades to defaults rather than breaking the desktop.** It
 * is a dotfile in a writable filesystem — anything can `echo nonsense >` it,
 * and losing your icon arrangement is a far better failure than losing the
 * desktop.
 */
export function parsePositions(text: string | null): Positions {
  if (!text) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

  const positions: Positions = {}
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    const point = value as Partial<Point> | null
    if (
      typeof point?.x === 'number' &&
      typeof point.y === 'number' &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    ) {
      positions[name] = { x: point.x, y: point.y }
    }
  }
  return positions
}

export function serializePositions(positions: Positions): string {
  return `${JSON.stringify(positions)}\n`
}

/** Apps, then folders, then files — so the seeded launchers stay top-left. */
const TYPE_ORDER = { app: 0, dir: 1, file: 2 } as const

/**
 * Place every entry: saved position where there is one, first free grid slot
 * otherwise. A file `cp`'d from the terminal therefore appears somewhere
 * sensible without the shell knowing the desktop exists.
 *
 * Dot-prefixed entries are hidden as `ls` hides them — which is what lets
 * `.positions` live in the directory it describes without becoming an icon.
 */
export function desktopIcons(
  children: readonly VFSNode[],
  saved: Positions,
  bounds: Bounds,
  { showHidden = false, cell = CELL }: { showHidden?: boolean; cell?: Cell } = {}
): Icon[] {
  const visible = children
    .filter((node) => showHidden || !node.name.startsWith('.'))
    .sort(
      (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name)
    )

  const taken = new Set(
    Object.values(saved).map((position) => nearestSlot(position, bounds, cell))
  )
  let next = 0

  return visible.map((node) => {
    let position = saved[node.name]

    if (!position) {
      while (taken.has(next)) next++
      taken.add(next)
      position = slotFor(next, bounds, cell)
    }

    return {
      name: node.name,
      path: `${DESKTOP_PATH}/${node.name}`,
      node,
      icon: iconFor(node),
      position,
    }
  })
}

/**
 * A name nothing has taken yet, numbering **before the extension** so
 * `untitled.md` becomes `untitled 2.md` rather than `untitled.md 2`.
 *
 * Shared with the file manager, which creates folders the same way.
 */
export function uniqueName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base

  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const extension = dot > 0 ? base.slice(dot) : ''

  for (let n = 2; ; n++) {
    const candidate = `${stem} ${n}${extension}`
    if (!taken(candidate)) return candidate
  }
}

/** Keep a dropped icon on the desktop, whatever the pointer did. */
export function clampToDesktop(point: Point, bounds: Bounds, cell: Cell = CELL): Point {
  return {
    x: Math.max(0, Math.min(point.x, Math.max(0, bounds.width - cell.width))),
    y: Math.max(0, Math.min(point.y, Math.max(0, bounds.height - cell.height))),
  }
}
