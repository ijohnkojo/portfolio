import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PermissionDeniedError, createKernelAPI, systemAPI } from './api'
import { events } from './events'
import { processStore } from './process'
import { dir, file, vfsStore } from './vfs'

const readOnlyApp = { id: 'reader', permissions: ['fs.read'] as const }
const inertApp = { id: 'inert', permissions: [] as const }

beforeEach(() => {
  vfsStore.setState({
    root: dir('/', { 'notes.md': file('notes.md', 'hello') }),
    overlay: {},
  })
  processStore.getState().reset()
  events.clear()
})

describe('permission gate', () => {
  it('allows what the manifest declared', () => {
    const api = createKernelAPI(readOnlyApp)
    expect(api.fs.read('/notes.md')).toBe('hello')
  })

  it('refuses what it did not, naming the app and the permission', () => {
    const api = createKernelAPI(readOnlyApp)

    expect(() => api.fs.write('/notes.md', 'nope')).toThrow(PermissionDeniedError)
    expect(() => api.fs.write('/notes.md', 'nope')).toThrow(/reader.*fs\.write/)
    expect(vfsStore.getState().read('/notes.md')).toMatchObject({ content: 'hello' })
  })

  it('gates every surface, not just the filesystem', () => {
    const api = createKernelAPI(inertApp)

    expect(() => api.fs.read('/notes.md')).toThrow(PermissionDeniedError)
    expect(() => api.fs.list('/')).toThrow(PermissionDeniedError)
    expect(() => api.fs.stat('/')).toThrow(PermissionDeniedError)
    expect(() => api.proc.spawn('about')).toThrow(PermissionDeniedError)
    expect(() => api.proc.kill(1)).toThrow(PermissionDeniedError)
    expect(() => api.proc.focus(1)).toThrow(PermissionDeniedError)
    expect(() => api.window.move(1, { x: 0, y: 0 })).toThrow(PermissionDeniedError)
    expect(() => api.window.resize(1, { width: 1, height: 1 })).toThrow(PermissionDeniedError)
    expect(() => api.window.setState(1, 'minimized')).toThrow(PermissionDeniedError)
    expect(() => api.events.emit('x', 1)).toThrow(PermissionDeniedError)
    expect(() => api.events.on('x', vi.fn())).toThrow(PermissionDeniedError)
  })

  it('cannot be widened after construction', () => {
    const permissions = ['fs.read'] as const
    const api = createKernelAPI({ id: 'reader', permissions })

    // The handle closes over the manifest it was built from.
    expect(() => api.fs.write('/notes.md', 'nope')).toThrow(PermissionDeniedError)
  })
})

describe('fs surface', () => {
  it('reads file contents, not nodes, and returns null for non-files', () => {
    const api = createKernelAPI(readOnlyApp)

    expect(api.fs.read('/notes.md')).toBe('hello')
    expect(api.fs.read('/')).toBeNull()
    expect(api.fs.read('/missing.md')).toBeNull()
    expect(api.fs.stat('/notes.md')).toMatchObject({ type: 'file', mime: 'text/markdown' })
  })

  it('announces writes on the event bus so other apps can refresh', () => {
    const handler = vi.fn()
    events.on('fs:changed', handler)

    systemAPI.fs.write('/notes.md', 'edited')

    expect(handler).toHaveBeenCalledWith({ path: '/notes.md', appId: 'system' })
    expect(systemAPI.fs.read('/notes.md')).toBe('edited')
  })
})

describe('systemAPI', () => {
  it('drives the process table for the WM, which is policy rather than an app', () => {
    const pid = systemAPI.proc.spawn('about', [], 'About')

    expect(processStore.getState().processes[pid].title).toBe('About')

    systemAPI.window.move(pid, { x: 12, y: 34 })
    expect(processStore.getState().processes[pid].position).toEqual({ x: 12, y: 34 })

    systemAPI.proc.kill(pid)
    expect(processStore.getState().processes[pid]).toBeUndefined()
  })
})
