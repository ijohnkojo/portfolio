/**
 * The syscall boundary (design doc §3).
 *
 * Apps never touch kernel stores directly — they receive a scoped API built
 * from their manifest, and every method checks the app's declared permissions
 * first. With a single user there is nothing to defend against; the point is
 * that the boundary is real, so adding a plugin system later doesn't mean
 * reworking every call site.
 */
import { events, type EventHandler, type Unsubscribe } from './events'
import {
  processStore,
  type Position,
  type Process,
  type Size,
  type WindowState,
} from './process'
import { vfsStore, type VFSNode } from './vfs'

export type Permission =
  | 'fs.read'
  | 'fs.write'
  | 'proc.spawn'
  | 'proc.kill'
  | 'proc.focus'
  | 'proc.list'
  | 'window.manage'
  | 'events.emit'
  | 'events.listen'

/** The slice of a manifest the kernel cares about. The registry adds the rest. */
export interface AppIdentity {
  id: string
  permissions: readonly Permission[]
}

export class PermissionDeniedError extends Error {
  constructor(
    readonly appId: string,
    readonly permission: Permission
  ) {
    super(`EPERM: app '${appId}' has not declared permission '${permission}'`)
    this.name = 'PermissionDeniedError'
  }
}

export interface KernelAPI {
  fs: {
    /** File contents as text, or null if missing / not a file / asset-backed. */
    read: (path: string) => string | null
    write: (path: string, data: string) => void
    list: (path: string) => VFSNode[]
    /** Node metadata without reading contents — for mime, src, app targets. */
    stat: (path: string) => VFSNode | null
    mkdir: (path: string, recursive?: boolean) => void
    /** Refuses published content; reverts an edit to it. See kernel/vfs.ts. */
    unlink: (path: string) => void
  }
  proc: {
    /** `title` labels this instance; it defaults to the appId. */
    spawn: (appId: string, args?: string[], title?: string) => number
    kill: (pid: number) => void
    focus: (pid: number) => void
    /** Snapshot of the process table, ordered by pid. Backs `ps`. */
    list: () => Process[]
  }
  window: {
    /** `pos` is supplied when a top/left resize handle moved the origin too. */
    resize: (pid: number, dims: Size, pos?: Position) => void
    move: (pid: number, pos: Position) => void
    setState: (pid: number, state: WindowState) => void
    /** Snapped geometry, remembering what to restore to. */
    snap: (pid: number, geometry: { position: Position; size: Size }) => void
    /** Restore pre-snap size; `pos` keeps the window where it is now. */
    unsnap: (pid: number, pos?: Position) => void
  }
  events: {
    emit: <T>(name: string, payload: T) => void
    on: <T>(name: string, handler: EventHandler<T>) => Unsubscribe
  }
}

function assertPermission(app: AppIdentity, permission: Permission): void {
  if (!app.permissions.includes(permission)) {
    throw new PermissionDeniedError(app.id, permission)
  }
}

export function createKernelAPI(app: AppIdentity): KernelAPI {
  return {
    fs: {
      read: (path) => {
        assertPermission(app, 'fs.read')
        const node = vfsStore.getState().read(path)
        if (!node || node.type !== 'file') return null
        return node.content ?? null
      },
      write: (path, data) => {
        assertPermission(app, 'fs.write')
        vfsStore.getState().write(path, data)
        events.emit('fs:changed', { path, appId: app.id })
      },
      list: (path) => {
        assertPermission(app, 'fs.read')
        return vfsStore.getState().list(path)
      },
      stat: (path) => {
        assertPermission(app, 'fs.read')
        return vfsStore.getState().read(path)
      },
      mkdir: (path, recursive) => {
        assertPermission(app, 'fs.write')
        vfsStore.getState().mkdir(path, recursive)
        events.emit('fs:changed', { path, appId: app.id })
      },
      unlink: (path) => {
        assertPermission(app, 'fs.write')
        vfsStore.getState().unlink(path)
        events.emit('fs:changed', { path, appId: app.id })
      },
    },

    proc: {
      spawn: (appId, args = [], title) => {
        assertPermission(app, 'proc.spawn')
        return processStore.getState().spawn(appId, { args, title })
      },
      kill: (pid) => {
        assertPermission(app, 'proc.kill')
        processStore.getState().kill(pid)
      },
      focus: (pid) => {
        assertPermission(app, 'proc.focus')
        processStore.getState().focus(pid)
      },
      list: () => {
        assertPermission(app, 'proc.list')
        return Object.values(processStore.getState().processes).sort(
          (a, b) => a.pid - b.pid
        )
      },
    },

    // NOTE: permissions are per-app, not per-pid, so an app holding
    // 'window.manage' can move any window. Scoping writes to the caller's own
    // pids is a Phase 3 concern — see the plugin-system note in design doc §4.
    window: {
      resize: (pid, dims, pos) => {
        assertPermission(app, 'window.manage')
        processStore.getState().resize(pid, dims, pos)
      },
      move: (pid, pos) => {
        assertPermission(app, 'window.manage')
        processStore.getState().move(pid, pos)
      },
      setState: (pid, state) => {
        assertPermission(app, 'window.manage')
        processStore.getState().setWindowState(pid, state)
      },
      snap: (pid, geometry) => {
        assertPermission(app, 'window.manage')
        processStore.getState().snap(pid, geometry)
      },
      unsnap: (pid, pos) => {
        assertPermission(app, 'window.manage')
        processStore.getState().unsnap(pid, pos)
      },
    },

    events: {
      emit: (name, payload) => {
        assertPermission(app, 'events.emit')
        events.emit(name, payload)
      },
      on: (name, handler) => {
        assertPermission(app, 'events.listen')
        return events.on(name, handler)
      },
    },
  }
}

/**
 * Unrestricted handle for the WM and shell, which are policy layers of the
 * system rather than apps running on top of it.
 */
export const ALL_PERMISSIONS: readonly Permission[] = [
  'fs.read',
  'fs.write',
  'proc.spawn',
  'proc.kill',
  'proc.focus',
  'proc.list',
  'window.manage',
  'events.emit',
  'events.listen',
]

export const systemAPI: KernelAPI = createKernelAPI({
  id: 'system',
  permissions: ALL_PERMISSIONS,
})
