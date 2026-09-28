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
} from '@/os/kernel'
import { getManifest, listApps } from '@/os/registry'
import { useFileText } from '@/os/hooks/kernel'
import { Desktop } from '@/os/wm/Desktop'
import { DESKTOP_PATH } from '@/os/wm/desktopIcons'
import { DESKTOP_ID, desktopBounds } from '@/os/wm/desktop'
import { geometryFor, zoneForKey } from '@/os/wm/snap'
import { TILE_MODES, isTileMode } from '@/os/wm/tiling'
import { applyTiling } from '@/os/wm/tilingController'
import { ACCENTS, SETTINGS_PATH, WALLPAPERS, parseSettings } from '@/os/wm/settings'
import { Taskbar } from '@/os/wm/Taskbar'
import { WindowManager } from '@/os/wm/WindowManager'

const adapter = createLocalStorageAdapter()

/**
 * What sits on the desktop out of the box. Named explicitly rather than derived
 * from the registry: the viewer is a file handler and has nothing to show
 * without one, so "every app" would be wrong.
 */
const DESKTOP_APPS = ['terminal', 'files', 'editor', 'settings', 'about', 'sysinfo']

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

  // The desktop is a view of a real directory (D-030), seeded the same way and
  // for the same reason. `mknod` leaves no overlay entry, so these shortcuts are
  // re-created every boot — removing one does not stick, which is the same
  // shape as an empty directory not surviving a reload (D-027). Files you `cp`
  // here are content, and persist normally.
  vfsStore.getState().mkdir(DESKTOP_PATH)
  for (const id of DESKTOP_APPS) {
    if (getManifest(id)) vfsStore.getState().mknod(`${DESKTOP_PATH}/${id}`, appNode(id, id))
  }
}

let booted = false
let tileModeIndex = -1
let stopAutosave: (() => void) | undefined

export function OsShell({ tree }: { tree: DirNode }) {
  ensureMounted(tree)

  // Subscribed to the file rather than told over the bus: writing
  // /home/.settings *is* applying it, so `echo … >` from the shell works too
  // (D-034). This re-renders only when that one file changes.
  const settings = parseSettings(useFileText(SETTINGS_PATH))

  useEffect(() => {
    if (booted) return
    booted = true

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

  // `reset` has to be handled here rather than in the terminal: the autosave
  // flushes on pagehide, so clearing storage and then reloading from anywhere
  // else would write the session straight back on the way out.
  useEffect(
    () =>
      systemAPI.events.on('os:reset', () => {
        stopAutosave?.()
        stopAutosave = undefined
        void createLocalStorageAdapter()
          .clear()
          .then(() => window.location.reload())
      }),
    []
  )

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
    <div
      className="dark flex h-dvh flex-col overflow-hidden bg-neutral-950"
      // Published as a custom property so the taskbar and the desktop icons can
      // use it without anything being threaded through as a prop.
      style={{ '--os-accent': ACCENTS[settings.accent].color } as React.CSSProperties}
    >
      <div
        id={DESKTOP_ID}
        className="relative flex-1 overflow-hidden"
        style={{ background: WALLPAPERS[settings.wallpaper].css }}
      >
        {/* Under the windows: icons are the floor, windows sit on it. */}
        <Desktop />
        <WindowManager />
      </div>
      <Taskbar />
    </div>
  )
}
