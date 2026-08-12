'use client'

/**
 * A single window frame — the only file in the project that knows react-rnd
 * exists. If Phase 2 snapping/tiling ends up fighting the library, swapping it
 * for interact.js or raw pointer events is a change to this file alone.
 *
 * The performance contract (docs/gotchas.md):
 *
 *   Live drag is imperative and local; persisted geometry is state.
 *
 * `position`/`size` are passed as controlled props, but they are only ever
 * *written* on drag/resize stop. react-draggable renders from its own internal
 * state while `dragging` is true and ignores the prop until the pointer lifts
 * (Draggable.js, `const draggable = !controlled || this.state.dragging`), so
 * nothing in this tree re-renders during the gesture. Committing in `onDrag`
 * instead would re-render on every mousemove — the classic jank.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'

import { createKernelAPI, systemAPI } from '@/kernel'
import { useIsFocused, useProcess } from '@/hooks/kernel'
import { getManifest } from '@/registry'
import { AppErrorBoundary } from './AppErrorBoundary'
import { geometryFor, zoneFor, type Bounds } from './snap'
import { SNAP_PREVIEW_ID, hideSnapPreview, showSnapPreview } from './snapPreview'

const MIN_WIDTH = 240
const MIN_HEIGHT = 160
const TITLEBAR_CLASS = 'window-titlebar'

/** Dev-only commit logging, so the drag-perf claim stays verifiable. */
const DEBUG_RENDERS = process.env.NODE_ENV === 'development'

/** The desktop area windows are bounded to — the Rnd parent. */
function desktopBounds(): Bounds {
  const parent = document.getElementById(SNAP_PREVIEW_ID)?.parentElement
  return { width: parent?.clientWidth ?? 0, height: parent?.clientHeight ?? 0 }
}

/** Pointer position relative to the desktop, from a mouse or touch drag event. */
function pointerOf(event: unknown): { x: number; y: number } {
  const parent = document.getElementById(SNAP_PREVIEW_ID)?.parentElement
  const rect = parent?.getBoundingClientRect()
  const source = event as { clientX?: number; clientY?: number; touches?: TouchList }
  const point = source.touches?.[0] ?? source

  return {
    x: (point.clientX ?? 0) - (rect?.left ?? 0),
    y: (point.clientY ?? 0) - (rect?.top ?? 0),
  }
}

export function Window({ pid }: { pid: number }) {
  const proc = useProcess(pid)
  const isFocused = useIsFocused(pid)

  const manifest = proc ? getManifest(proc.appId) : undefined

  // Scoped once per app: the handle an app gets is built from its manifest, so
  // its permissions are baked in and can't be widened at the call site.
  const kernel = useMemo(
    () => (manifest ? createKernelAPI(manifest) : null),
    [manifest]
  )

  // Counts commits, not renders, and runs after every one. Dragging a window
  // must print exactly once, on mouse-up. If it prints per mousemove, something
  // started writing geometry to the store mid-gesture.
  const commits = useRef(0)
  useEffect(() => {
    commits.current += 1
    if (DEBUG_RENDERS) console.debug(`[wm] pid ${pid} commit #${commits.current}`)
  })

  if (!proc || !manifest || !kernel) return null

  const AppComponent = manifest.component
  const maximized = proc.state === 'maximized'
  const minimized = proc.state === 'minimized'

  return (
    <Rnd
      className="pointer-events-auto"
      bounds="parent"
      dragHandleClassName={TITLEBAR_CLASS}
      minWidth={MIN_WIDTH}
      minHeight={MIN_HEIGHT}
      disableDragging={maximized}
      enableResizing={!maximized}
      position={maximized ? { x: 0, y: 0 } : proc.position}
      size={maximized ? { width: '100%', height: '100%' } : proc.size}
      // D-013: a minimized window is hidden, not unmounted. Unmounting would
      // throw away whatever the app was holding — the terminal's scrollback, its
      // cwd, a half-typed command line. `display: none` costs memory rather
      // than frame time: no paint, no layout, no hit-testing.
      //
      // It has to go through `style` rather than a class: react-rnd sets
      // `display: inline-block` as an inline style, and only `style` is merged
      // after its own defaults.
      style={{ zIndex: proc.zIndex, display: minimized ? 'none' : undefined }}
      onMouseDown={() => systemAPI.proc.focus(pid)}
      // Preview only — no store write, no React state. See wm/snapPreview.ts.
      onDrag={(e) => {
        const zone = zoneFor(pointerOf(e), desktopBounds())
        if (zone) showSnapPreview(zone, desktopBounds())
        else hideSnapPreview()
      }}
      onDragStop={(e, d) => {
        hideSnapPreview()
        const bounds = desktopBounds()
        const zone = zoneFor(pointerOf(e), bounds)

        if (zone) {
          systemAPI.window.snap(pid, geometryFor(zone, bounds))
          return
        }

        // Dragged out of a snap: keep the new position, restore the old size.
        if (proc.preSnap) systemAPI.window.unsnap(pid, { x: d.x, y: d.y })
        else systemAPI.window.move(pid, { x: d.x, y: d.y })
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) =>
        systemAPI.window.resize(
          pid,
          { width: ref.offsetWidth, height: ref.offsetHeight },
          position
        )
      }
    >
      <div
        // Identity for tooling: which app, which pid, and whether it holds
        // focus. Windows overlap, so verification scripts need to address one
        // without depending on what happens to be on top.
        data-app={manifest.id}
        data-pid={pid}
        data-focused={isFocused}
        className={`flex h-full w-full flex-col overflow-hidden rounded-lg border bg-neutral-900 shadow-2xl transition-colors ${
          isFocused
            ? 'border-neutral-500 shadow-black/60'
            : 'border-neutral-800 shadow-black/30'
        }`}
      >
        <div
          className={`${TITLEBAR_CLASS} flex shrink-0 cursor-move items-center gap-2 border-b border-neutral-800 px-3 py-1.5 select-none ${
            isFocused ? 'bg-neutral-800' : 'bg-neutral-900'
          }`}
          onDoubleClick={() =>
            systemAPI.window.setState(pid, maximized ? 'normal' : 'maximized')
          }
        >
          <span
            className={`flex-1 truncate font-mono text-xs ${
              isFocused ? 'text-neutral-100' : 'text-neutral-500'
            }`}
          >
            {proc.title}
            <span className="ml-2 opacity-40">[{pid}]</span>
          </span>

          <WindowButton
            label="minimize"
            onClick={() => systemAPI.window.setState(pid, 'minimized')}
          >
            &#8211;
          </WindowButton>
          <WindowButton
            label={maximized ? 'restore' : 'maximize'}
            onClick={() =>
              systemAPI.window.setState(pid, maximized ? 'normal' : 'maximized')
            }
          >
            &#9633;
          </WindowButton>
          <WindowButton label="close" onClick={() => systemAPI.proc.kill(pid)}>
            &#10005;
          </WindowButton>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-neutral-950 text-neutral-200">
          <AppErrorBoundary appId={manifest.id}>
            <AppComponent pid={pid} args={proc.args} kernel={kernel} />
          </AppErrorBoundary>
        </div>
      </div>
    </Rnd>
  )
}

function WindowButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="grid h-5 w-5 place-items-center rounded text-xs text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
    >
      {children}
    </button>
  )
}
