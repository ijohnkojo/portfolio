'use client'

/**
 * App registry — appId -> manifest (design doc §3).
 *
 * Adding an app is "write a component, register a manifest." It is never a
 * kernel change, and that is the whole point of the boundary.
 *
 * Every component is loaded through `next/dynamic`, so an app's code ships only
 * when it is first spawned. Letting one app get bundled into the main chunk
 * because it was faster to wire up is exactly how performance debt compounds
 * (design doc §5).
 *
 * The import paths below must stay literal strings — Next cannot match a
 * template literal or variable back to a chunk, so an interpolated
 * `import()` silently defeats code splitting.
 */
import dynamic from 'next/dynamic'

import { findHandlerFor as resolveHandler } from './handlers'
import type { AppManifest } from './types'

function AppLoading() {
  return <div className="p-4 font-mono text-xs text-neutral-500">loading…</div>
}

export const registry: Record<string, AppManifest> = {
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    icon: '/icons/terminal.svg',
    // fs.write is for /home/.history — the terminal is the first app that
    // can modify the filesystem (D-020).
    permissions: [
      'fs.read',
      'fs.write',
      'proc.spawn',
      'proc.kill',
      'proc.focus',
      'proc.list',
      // `tile` asks the WM for a layout over the bus rather than moving
      // windows itself (D-023).
      'events.emit',
    ],
    component: dynamic(() => import('@/apps/terminal/Terminal'), {
      ssr: false,
      loading: AppLoading,
    }),
  },
  about: {
    id: 'about',
    name: 'About',
    icon: '/icons/about.svg',
    permissions: ['fs.read'],
    component: dynamic(() => import('@/apps/about/About'), {
      ssr: false,
      loading: AppLoading,
    }),
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    icon: '/icons/viewer.svg',
    permissions: ['fs.read'],
    handles: ['text/markdown', 'text/plain', 'application/json', 'application/pdf', 'image/*'],
    component: dynamic(() => import('@/apps/viewer/Viewer'), {
      ssr: false,
      loading: AppLoading,
    }),
  },
  files: {
    id: 'files',
    name: 'Files',
    icon: '/icons/files.svg',
    // fs.write is new folder and delete; proc.spawn is opening what you click.
    permissions: ['fs.read', 'fs.write', 'proc.spawn', 'proc.focus', 'proc.list'],
    // No `handles`, deliberately. A directory is resolved by caller opinion
    // rather than by mime (D-032) — `launchFor` returns null for one — so a
    // declaration here would be data nothing reads.
    component: dynamic(() => import('@/apps/files/Files'), {
      ssr: false,
      loading: AppLoading,
    }),
  },
  sysinfo: {
    id: 'sysinfo',
    name: 'System Info',
    icon: '/icons/sysinfo.svg',
    permissions: ['fs.read', 'events.listen'],
    component: dynamic(() => import('@/apps/sysinfo/SysInfo'), {
      ssr: false,
      loading: AppLoading,
    }),
  },
}

export function getManifest(appId: string): AppManifest | undefined {
  return registry[appId]
}

/** Which app opens this mime type. Matching rule lives in `handlers.ts`. */
export function findHandlerFor(mime: string): string | null {
  return resolveHandler(mime, Object.values(registry))
}

export function listApps(): AppManifest[] {
  return Object.values(registry)
}

export type { AppManifest, AppProps } from './types'
