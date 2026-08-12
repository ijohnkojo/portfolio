'use client'

/**
 * The OS shell: client-rendered, mounted on top of the kernel.
 *
 * The VFS tree arrives as a prop, built from disk by the server component that
 * renders this (docs/decisions.md D-011). It crosses the boundary as plain JSON
 * because the kernel's node types are deliberately serializable.
 *
 * Mounting happens during the first render rather than in an effect, so the
 * filesystem is populated before anything paints — no window ever renders
 * against an empty tree.
 */
import { useEffect } from 'react'

import {
  appNode,
  createLocalStorageAdapter,
  hydrate,
  processStore,
  startAutosave,
  systemAPI,
  vfsStore,
  type DirNode,
} from '@/kernel'
import { getManifest, listApps } from '@/registry'
import { DESKTOP_ID, desktopBounds } from '@/wm/desktop'
import { geometryFor, zoneForKey } from '@/wm/snap'
import { TILE_MODES, isTileMode } from '@/wm/tiling'
import { applyTiling } from '@/wm/tilingController'
import { Taskbar } from '@/wm/Taskbar'
import { WindowManager } from '@/wm/WindowManager'

const adapter = createLocalStorageAdapter()

let mounted = false

function ensureMounted(tree: DirNode) {
  if (mounted) return
  mounted = true

  vfsStore.getState().mount(tree)

  // App nodes are registered here rather than by the server loader: the
  // registry holds React components, so it is necessarily a client module.
  // This is what gives a future shell `ls /apps` and `open /apps/about`.
  vfsStore.getState().mkdir('/apps')
  for (const app of listApps()) {
    vfsStore.getState().mknod(`/apps/${app.id}`, appNode(app.id, app.id))
  }
}

let booted = false
let tileModeIndex = -1

export function OsShell({ tree }: { tree: DirNode }) {
  ensureMounted(tree)

  useEffect(() => {
    if (booted) return
    booted = true

    let stopAutosave: (() => void) | undefined

    void (async () => {
      const saved = await adapter.load()

      // A saved session replaces the default window. Spawning as well would add
      // one terminal per reload.
      if (saved) {
        hydrate(saved, { isKnownApp: (appId) => Boolean(getManifest(appId)) })
      }

      if (Object.keys(processStore.getState().processes).length === 0) {
        processStore.getState().spawn('terminal', {
          title: 'Terminal',
          size: { width: 720, height: 440 },
        })
      }

      // Started after hydrate so restoring doesn't immediately rewrite what it
      // just read.
      stopAutosave = startAutosave(adapter)
    })()

    return () => stopAutosave?.()
  }, [])

  // Apps ask for a layout on the bus; the window manager decides (D-023).
  // This is the second real use of the event bus, and the one design doc §2
  // actually described it for.
  useEffect(
    () =>
      systemAPI.events.on<{ mode: string }>('wm:tile', ({ mode }) => {
        if (isTileMode(mode)) applyTiling(mode)
      }),
    []
  )

  // Window snapping from the keyboard. Alt+Shift+Arrow, because Super is taken
  // by Windows and GNOME, Cmd+Arrow navigates in browsers, and Ctrl+Alt+Arrow
  // switches workspaces on GNOME. The terminal's custom key handler lets this
  // chord bubble rather than swallowing it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || !event.shiftKey) return

      // Alt+Shift+T cycles the tiling layouts.
      if (event.key.toLowerCase() === 't') {
        event.preventDefault()
        tileModeIndex = (tileModeIndex + 1) % TILE_MODES.length
        applyTiling(TILE_MODES[tileModeIndex])
        return
      }

      const zone = zoneForKey(event.key)
      if (zone === undefined) return

      const { focusedPid } = processStore.getState()
      if (focusedPid === null) return

      event.preventDefault()

      if (zone === null) systemAPI.window.unsnap(focusedPid)
      else systemAPI.window.snap(focusedPid, geometryFor(zone, desktopBounds()))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    // `dark` is load-bearing: the OS is always dark, so components shared with
    // the theme-aware site must resolve their dark styles here regardless of
    // the visitor's system preference. See the @custom-variant in globals.css.
    <div className="dark flex h-dvh flex-col overflow-hidden bg-neutral-950">
      <div
        id={DESKTOP_ID}
        className="relative flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-neutral-800),var(--color-neutral-950))]"
      >
        <WindowManager />
      </div>
      <Taskbar />
    </div>
  )
}
