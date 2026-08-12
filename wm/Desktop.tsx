'use client'

/**
 * The icon surface, underneath the windows.
 *
 * It renders `/desktop` — a real directory in the VFS (D-030) — so `cp x
 * /desktop` from the shell makes an icon appear and `rm` takes it away, with no
 * icon registry to keep in sync. The layout arithmetic lives in
 * `desktopIcons.ts` and is pure; this file does the DOM and nothing else.
 *
 * **It subscribes to nothing in the process table.** Dragging a window must not
 * re-render an icon, for the reason `docs/gotchas.md` gives about unscoped
 * selectors.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { systemAPI, type VFSNode } from '@/kernel'
import { useDirectory, useFileText } from '@/hooks/kernel'
import { findHandlerFor, getManifest } from '@/registry'
import { launchFor, performLaunch } from '@/registry/launch'
import { DESKTOP_ID, desktopBounds } from './desktop'
import {
  CELL,
  DESKTOP_PATH,
  POSITIONS_PATH,
  clampToDesktop,
  desktopIcons,
  parsePositions,
  serializePositions,
  type Bounds,
  type Icon,
  type Point,
} from './desktopIcons'

/** Dev-only commit logging, so the drag-perf claim stays verifiable (D-007). */
const DEBUG_RENDERS = process.env.NODE_ENV === 'development'

/** Below this, the pointer was clicking rather than dragging. */
const DRAG_THRESHOLD = 4

/** An app node's label is the manifest's name; the VFS keeps the lowercase id. */
function labelFor(node: VFSNode): string {
  if (node.type !== 'app') return node.name
  return getManifest(node.appId)?.name ?? node.name
}

export function Desktop() {
  // Subscribed, not copied into state on an effect: `useDirectory` re-renders
  // only when /desktop's own children change, so the terminal flushing
  // /home/.history every 250ms while you type costs nothing here.
  const children = useDirectory(DESKTOP_PATH)
  const positions = parsePositions(useFileText(POSITIONS_PATH))

  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 })
  const [selected, setSelected] = useState<string | null>(null)

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

  const open = useCallback((icon: Icon) => {
    const launch = launchFor(icon.path, icon.node, findHandlerFor)

    // Null is a directory, and each surface has its own opinion about those
    // (D-032). The desktop's is to hand it to Files, pointed at that folder.
    if (!launch) {
      systemAPI.proc.spawn('files', [icon.path], icon.name)
      return
    }

    performLaunch(systemAPI, launch, (appId) => getManifest(appId)?.name ?? appId)
  }, [])

  /**
   * One write, on drop. The gesture itself never comes through here — see the
   * pointer handlers below.
   */
  const moveTo = useCallback(
    (name: string, point: Point) => {
      systemAPI.fs.write(
        POSITIONS_PATH,
        serializePositions({ ...positions, [name]: clampToDesktop(point, bounds) })
      )
    },
    [positions, bounds]
  )

  const icons = desktopIcons(children, positions, bounds)

  return (
    <div
      className="absolute inset-0"
      // Clicking the background clears the selection, as it does anywhere else.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSelected(null)
      }}
    >
      {icons.map((icon) => (
        <DesktopIcon
          key={icon.name}
          icon={icon}
          label={labelFor(icon.node)}
          selected={selected === icon.name}
          onSelect={() => setSelected(icon.name)}
          onOpen={() => open(icon)}
          onMove={(point) => moveTo(icon.name, point)}
        />
      ))}
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
  label,
  selected,
  onSelect,
  onOpen,
  onMove,
}: {
  icon: Icon
  label: string
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onMove: (point: Point) => void
}) {
  const gesture = useRef<Gesture | null>(null)

  // Counts commits, not renders, and runs after every one — the same instrument
  // `wm/Window.tsx` carries (D-007). Dragging an icon must print exactly once,
  // on drop. If it prints per pointermove, something started writing position
  // to the store mid-gesture and `docs/gotchas.md`'s rule has been broken.
  const commits = useRef(0)
  useEffect(() => {
    commits.current += 1
    if (DEBUG_RENDERS) console.debug(`[desktop] icon ${icon.name} commit #${commits.current}`)
  })

  return (
    <button
      type="button"
      // Marks an icon for the verify script, and carries the name it is keyed by.
      data-desktop-icon={icon.name}
      data-selected={selected}
      style={{
        left: icon.position.x,
        top: icon.position.y,
        width: CELL.width,
        height: CELL.height,
      }}
      className={`absolute flex flex-col items-center gap-1.5 rounded-md px-1 pt-2 pb-1 text-center font-mono text-[11px] leading-tight transition-colors ${
        selected
          ? 'bg-neutral-100/10 text-neutral-100 ring-1 ring-neutral-100/25'
          : 'text-neutral-300 hover:bg-neutral-100/5'
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
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
       * inside the pointermove loop, which is exactly what `docs/gotchas.md`
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
      {/*
        A mask rather than an <img>: an image is its own document, so the SVG's
        `currentColor` would resolve to black against a dark desktop. Masked,
        the icon takes the button's text colour and hover and selection come
        for free.
      */}
      <span
        aria-hidden
        className="h-8 w-8 shrink-0 bg-current"
        style={{
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
      <span className="line-clamp-2 w-full break-words">{label}</span>
    </button>
  )
}
