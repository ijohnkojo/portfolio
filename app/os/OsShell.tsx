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

import { appNode, processStore, vfsStore, type DirNode } from '@/kernel'
import { listApps } from '@/registry'
import { Taskbar } from '@/wm/Taskbar'
import { WindowManager } from '@/wm/WindowManager'

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

let spawnedInitialWindow = false

export function OsShell({ tree }: { tree: DirNode }) {
  ensureMounted(tree)

  useEffect(() => {
    if (spawnedInitialWindow) return
    spawnedInitialWindow = true
    // Boot into a shell. About stays launchable, and its text is `cat`-able at
    // /home/about.md — the OS should open onto the thing that makes it an OS.
    processStore.getState().spawn('terminal', {
      title: 'Terminal',
      size: { width: 720, height: 440 },
    })
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950">
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-neutral-800),var(--color-neutral-950))]">
        <WindowManager />
      </div>
      <Taskbar />
    </div>
  )
}
