'use client'

/**
 * The icon surface, underneath the windows.
 *
 * It renders `/desktop` — a real directory in the VFS (D-030) — so `cp x
 * /desktop` from the shell makes an icon appear and `rm` takes it away, with no
 * icon registry to keep in sync. The layout arithmetic lives in
 * `desktopIcons.ts` and the right-click rules in `contextMenu.ts`, both pure;
 * this file does the DOM and the syscalls.
 *
 * **It subscribes to nothing in the process table.** Dragging a window must not
 * re-render an icon, for the reason `docs/os/gotchas.md` gives about unscoped
 * selectors.
 */
import { useEffect, useRef, useState } from 'react'

import { systemAPI, type VFSNode } from '@/os/kernel'
import { useDirectory, useFileText } from '@/os/hooks/kernel'
import { findHandlerFor, getManifest } from '@/os/registry'
import { launchFor, performLaunch } from '@/os/registry/launch'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { actionsFor, type NodeAction } from './contextMenu'
import { DESKTOP_ID, desktopBounds } from './desktop'
import { SETTINGS_PATH, parseSettings } from './settings'
import {
  ICON_SIZES,
  DESKTOP_PATH,
  POSITIONS_PATH,
  clampToDesktop,
  desktopIcons,
  parsePositions,
  serializePositions,
  uniqueName,
  type Bounds,
  type Cell,
  type Icon,
  type Point,
  type Positions,
} from './desktopIcons'

/** Dev-only commit logging, so the drag-perf claim stays verifiable (D-007). */
const DEBUG_RENDERS = process.env.NODE_ENV === 'development'

/** Below this, the pointer was clicking rather than dragging. */
const DRAG_THRESHOLD = 4

const ACTION_LABELS: Record<NodeAction, string> = {
  open: 'Open',
  edit: 'Edit',
  rename: 'Rename',
  delete: 'Delete',
}

/** An app node's label is the manifest's name; the VFS keeps the lowercase id. */
function labelFor(node: VFSNode): string {
  if (node.type !== 'app') return node.name
  return getManifest(node.appId)?.name ?? node.name
}

/**
 * The kernel's errno shape is not something a reader can act on, so translate
 * it the way `rm` does — and say the same words, because the desktop is going
 * through the same `unlink` and deserves no softer story (D-027).
 */
function explain(name: string, thrown: unknown, suffix = ''): string {
  const detail = thrown instanceof Error ? thrown.message : String(thrown)
  return detail.startsWith('EROFS')
    ? `${name}: read-only, part of the published content${suffix}`
    : `${name}: ${detail}`
}

interface MenuState {
  at: Point
  icon?: Icon
}

export function Desktop() {
  // Subscribed, not copied into state on an effect: `useDirectory` re-renders
  // only when /desktop's own children change, so the terminal flushing
  // /home/.history every 250ms while you type costs nothing here.
  const children = useDirectory(DESKTOP_PATH)
  const positions = parsePositions(useFileText(POSITIONS_PATH))
  const settings = parseSettings(useFileText(SETTINGS_PATH))
  const cell = ICON_SIZES[settings.iconSize]

  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The grid depends on how tall the desktop is, so it has to be measured. The
  // element belongs to the WM — we render inside it — and the observer's first
  // callback is what supplies the initial size, so there is no layout effect
  // writing state during mount.
  useEffect(() => {
    const surface = document.getElementById(DESKTOP_ID)
    if (!surface) return

    const observer = new ResizeObserver(() => setBounds(desktopBounds()))
    observer.observe(surface)
    return () => observer.disconnect()
  }, [])

  /**
   * Plain functions, not `useCallback`.
   *
   * Nothing they are passed to is `React.memo`, so a stable identity buys
   * exactly nothing — and React Compiler's lint refuses to preserve manual
   * memoization it cannot verify here, correctly. The drag contract does not
   * depend on any of this: a gesture produces no renders at all.
   */
  const exists = (name: string) => Boolean(systemAPI.fs.stat(`${DESKTOP_PATH}/${name}`))

  const open = (icon: Icon) => {
    const launch = launchFor(icon.path, icon.node, findHandlerFor)

    // Null is a directory, and each surface has its own opinion about those
    // (D-032). The desktop's is to hand it to Files, pointed at that folder.
    if (!launch) {
      systemAPI.proc.spawn('files', [icon.path], icon.name)
      return
    }
    performLaunch(systemAPI, launch, (appId) => getManifest(appId)?.name ?? appId)
  }

  /**
   * One write, on drop. The gesture itself never comes through here — see the
   * pointer handlers below.
   */
  const moveTo = (name: string, point: Point) => {
    systemAPI.fs.write(
      POSITIONS_PATH,
      serializePositions({ ...positions, [name]: clampToDesktop(point, bounds, cell) })
    )
  }

  const remove = (icon: Icon) => {
    try {
      systemAPI.fs.unlink(icon.path)
      setNotice(null)
    } catch (thrown) {
      setNotice(explain(icon.name, thrown))
    }
  }

  /**
   * A rename is a write followed by a remove, which is exactly what `mv` is —
   * and it inherits `mv`'s limits, including that published content cannot move
   * because it cannot be removed.
   */
  const rename = (icon: Icon, to: string) => {
    setRenaming(null)

    const name = to.trim()
    if (!name || name === icon.name) return
    if (exists(name)) return setNotice(`${name}: already exists`)

    const content = systemAPI.fs.read(icon.path)
    if (content === null) return setNotice(`${icon.name}: cannot be renamed`)

    try {
      systemAPI.fs.unlink(icon.path)
    } catch (thrown) {
      return setNotice(explain(icon.name, thrown, ' — copy it instead'))
    }
    systemAPI.fs.write(`${DESKTOP_PATH}/${name}`, content)

    // The icon keeps its place: the positions file is keyed by name, so a
    // rename has to carry the entry across or the icon jumps to the grid.
    const position = positions[icon.name]
    if (position) {
      const next: Positions = { ...positions, [name]: position }
      delete next[icon.name]
      systemAPI.fs.write(POSITIONS_PATH, serializePositions(next))
    }

    setSelected(name)
    setNotice(null)
  }

  const create = (kind: 'folder' | 'file') => {
    const name = uniqueName(kind === 'folder' ? 'new folder' : 'untitled.md', exists)
    const path = `${DESKTOP_PATH}/${name}`

    try {
      if (kind === 'folder') systemAPI.fs.mkdir(path)
      else systemAPI.fs.write(path, '')
      setSelected(name)
      // Straight into a rename, which is what you wanted next anyway.
      setRenaming(name)
      setNotice(null)
    } catch (thrown) {
      setNotice(explain(name, thrown))
    }
  }

  /** Reset the arrangement by deleting the file that holds it. */
  const arrange = () => {
    if (systemAPI.fs.stat(POSITIONS_PATH)) systemAPI.fs.unlink(POSITIONS_PATH)
    setNotice(null)
  }

  const icons = desktopIcons(children, positions, bounds, {
    showHidden: settings.showHidden,
    cell,
  })

  const menuItems: MenuItem[] = !menu
    ? []
    : menu.icon
      ? actionsFor(menu.icon.node).map((action) => ({
          label: ACTION_LABELS[action],
          onSelect: () => {
            const icon = menu.icon!
            if (action === 'open') open(icon)
            if (action === 'edit') systemAPI.proc.spawn('editor', [icon.path], icon.name)
            if (action === 'rename') setRenaming(icon.name)
            if (action === 'delete') remove(icon)
          },
        }))
      : [
          { label: 'New Folder', onSelect: () => create('folder') },
          { label: 'New File', onSelect: () => create('file') },
          { label: 'Arrange Icons', onSelect: arrange },
          {
            // The desktop asks; the window manager decides (D-023).
            label: 'Tile Windows',
            onSelect: () => systemAPI.events.emit('wm:tile', { mode: 'grid' }),
          },
          {
            label: 'Change Wallpaper',
            onSelect: () => systemAPI.proc.spawn('settings', [], 'Settings'),
          },
        ]

  return (
    <div
      className="absolute inset-0"
      // Clicking the background clears the selection, as it does anywhere else.
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        setSelected(null)
        setNotice(null)
      }}
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        setSelected(null)
        setMenu({ at: { x: event.clientX, y: event.clientY } })
      }}
    >
      {icons.map((icon) => (
        <DesktopIcon
          key={icon.name}
          icon={icon}
          cell={cell}
          label={labelFor(icon.node)}
          selected={selected === icon.name}
          renaming={renaming === icon.name}
          onSelect={() => setSelected(icon.name)}
          onOpen={() => open(icon)}
          onMove={(point) => moveTo(icon.name, point)}
          onMenu={(at) => {
            setSelected(icon.name)
            setMenu({ at, icon })
          }}
          onRename={(to) => rename(icon, to)}
          onCancelRename={() => setRenaming(null)}
        />
      ))}

      {notice && (
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="absolute bottom-3 left-1/2 max-w-[80%] -translate-x-1/2 truncate rounded border border-neutral-700 bg-neutral-900/95 px-3 py-1.5 font-mono text-xs text-red-400 shadow-lg"
        >
          {notice}
        </button>
      )}

      {menu && (
        <ContextMenu at={menu.at} items={menuItems} onDismiss={() => setMenu(null)} />
      )}
    </div>
  )
}

interface Gesture {
  startX: number
  startY: number
  moved: boolean
}

function DesktopIcon({
  icon,
  cell,
  label,
  selected,
  renaming,
  onSelect,
  onOpen,
  onMove,
  onMenu,
  onRename,
  onCancelRename,
}: {
  icon: Icon
  cell: Cell & { glyph: number }
  label: string
  selected: boolean
  renaming: boolean
  onSelect: () => void
  onOpen: () => void
  onMove: (point: Point) => void
  onMenu: (at: Point) => void
  onRename: (to: string) => void
  onCancelRename: () => void
}) {
  const gesture = useRef<Gesture | null>(null)

  // Counts commits, not renders, and runs after every one — the same instrument
  // `wm/Window.tsx` carries (D-007). Dragging an icon must print exactly once,
  // on drop. If it prints per pointermove, something started writing position
  // to the store mid-gesture and `docs/os/gotchas.md`'s rule has been broken.
  const commits = useRef(0)
  useEffect(() => {
    commits.current += 1
    if (DEBUG_RENDERS) console.debug(`[desktop] icon ${icon.name} commit #${commits.current}`)
  })

  const placement = {
    left: icon.position.x,
    top: icon.position.y,
    width: cell.width,
    height: cell.height,
  }
  const glyph = (
    /*
      A mask rather than an <img>: an image is its own document, so the SVG's
      `currentColor` would resolve to black against a dark desktop. Masked, the
      icon takes the button's text colour and hover and selection come free.
    */
    <span
      aria-hidden
      className="shrink-0 bg-current"
      style={{
        width: cell.glyph,
        height: cell.glyph,
        maskImage: `url(${icon.icon})`,
        WebkitMaskImage: `url(${icon.icon})`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )

  // A separate branch rather than an input inside the button: nested
  // interactive elements are invalid, and every click would fight the button.
  if (renaming) {
    return (
      <div
        data-desktop-icon={icon.name}
        style={placement}
        className="absolute flex flex-col items-center gap-1.5 rounded-md px-1 pt-2 pb-1 text-center font-mono text-[11px] leading-tight text-neutral-100 ring-1 ring-neutral-100/25"
      >
        {glyph}
        <input
          autoFocus
          defaultValue={icon.name}
          aria-label={`rename ${icon.name}`}
          onFocus={(event) => event.target.select()}
          onBlur={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename(event.currentTarget.value)
            if (event.key === 'Escape') onCancelRename()
          }}
          className="w-full rounded-sm bg-neutral-800 px-1 text-center text-neutral-100 outline-none ring-1 ring-neutral-500"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      // Marks an icon for the verify script, and carries the name it is keyed by.
      data-desktop-icon={icon.name}
      data-selected={selected}
      style={{
        ...placement,
        // The accent is a custom property published by the OS root, so the
        // colour the user picked reaches here without a prop (D-034).
        ...(selected
          ? {
              backgroundColor: 'color-mix(in srgb, var(--os-accent) 20%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--os-accent) 45%, transparent)',
            }
          : null),
      }}
      className={`absolute flex flex-col items-center gap-1.5 rounded-md px-1 pt-2 pb-1 text-center font-mono text-[11px] leading-tight transition-colors ${
        selected ? 'text-neutral-100' : 'text-neutral-300 hover:bg-neutral-100/5'
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu({ x: event.clientX, y: event.clientY })
      }}
      // Enter opens what is selected. The mouse has a double-click; the
      // keyboard needs a way in, and buttons are already focusable.
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen()
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        gesture.current = { startX: event.clientX, startY: event.clientY, moved: false }
      }}
      /**
       * **The load-bearing part.** Position goes straight to the element's
       * transform, never to React state — a `setState` here would put a commit
       * inside the pointermove loop, which is exactly what `docs/os/gotchas.md`
       * and D-002 forbid for windows and D-031 extends to icons. The snap
       * preview writes the DOM directly for the same reason.
       */
      onPointerMove={(event) => {
        const active = gesture.current
        if (!active) return

        const dx = event.clientX - active.startX
        const dy = event.clientY - active.startY
        if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

        active.moved = true
        event.currentTarget.style.transform = `translate(${dx}px, ${dy}px)`
      }}
      onPointerUp={(event) => {
        const active = gesture.current
        gesture.current = null
        if (!active?.moved) return

        // Commit, then drop the transform. Both happen in one handler, so React
        // re-renders at the new left/top before anything paints.
        onMove({
          x: icon.position.x + (event.clientX - active.startX),
          y: icon.position.y + (event.clientY - active.startY),
        })
        event.currentTarget.style.transform = ''
      }}
      onPointerCancel={(event) => {
        gesture.current = null
        event.currentTarget.style.transform = ''
      }}
    >
      {glyph}
      <span className="line-clamp-2 w-full break-words">{label}</span>
    </button>
  )
}
