'use client'

/**
 * The OS shell: client-rendered, mounted on top of the kernel.
 *
 * Seeding happens at module scope so the VFS is populated before the first
 * render — no window flashes an empty filesystem. The initial window is spawned
 * from an effect, guarded so React's development double-invoke doesn't open two.
 */
import { useEffect } from 'react'

import { processStore, vfsStore } from '@/kernel'
import { buildContentTree } from '@/content'
import { Taskbar } from '@/wm/Taskbar'
import { WindowManager } from '@/wm/WindowManager'

vfsStore.getState().mount(buildContentTree())

let spawnedInitialWindow = false

export function OsShell() {
  useEffect(() => {
    if (spawnedInitialWindow) return
    spawnedInitialWindow = true
    processStore.getState().spawn('about', { title: 'About' })
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
