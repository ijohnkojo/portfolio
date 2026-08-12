import { beforeEach, describe, expect, it } from 'vitest'

import {
  SCHEMA_VERSION,
  createMemoryAdapter,
  hydrate,
  migrate,
  snapshot,
  type PersistedState,
} from './persistence'
import { processStore } from './process'
import { dir, file, vfsStore } from './vfs'

const baseTree = () =>
  dir('/', {
    home: dir('home', { 'about.md': file('about.md', 'original') }),
  })

beforeEach(() => {
  vfsStore.setState({ root: baseTree(), overlay: {} })
  processStore.getState().reset()
})

describe('migrate', () => {
  it('accepts a current-version blob', () => {
    const state: PersistedState = {
      schemaVersion: SCHEMA_VERSION,
      overlay: { '/home/about.md': 'edited' },
      session: { processes: {}, focusedPid: null, nextPid: 1, nextZIndex: 1 },
    }

    expect(migrate(state)).toEqual(state)
  })

  // Never throw at a returning user: an unusable blob means "start fresh".
  it('returns null rather than throwing on junk', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate('nope')).toBeNull()
    expect(migrate({})).toBeNull()
    expect(migrate({ schemaVersion: 0 })).toBeNull()
  })

  it('returns null for a blob written by a newer build', () => {
    expect(migrate({ schemaVersion: SCHEMA_VERSION + 1, overlay: {}, session: {} })).toBeNull()
  })

  it('returns null when a version is missing its migration step', () => {
    // Only reachable once SCHEMA_VERSION > 1; asserts the seam fails closed.
    expect(migrate({ schemaVersion: 0.5, overlay: {}, session: {} })).toBeNull()
  })
})

describe('snapshot / hydrate', () => {
  it('persists writes rather than the base tree', () => {
    vfsStore.getState().write('/home/about.md', 'edited')
    const saved = snapshot()

    expect(saved.overlay).toEqual({ '/home/about.md': 'edited' })
    // The base content is not in the blob, so shipping new content can't stale it.
    expect(JSON.stringify(saved)).not.toContain('original')
  })

  it('replays an overlay onto a freshly built base tree', () => {
    vfsStore.getState().write('/home/about.md', 'edited')
    const saved = snapshot()

    vfsStore.setState({ root: baseTree(), overlay: {} })
    expect(vfsStore.getState().read('/home/about.md')).toMatchObject({ content: 'original' })

    hydrate(saved)
    expect(vfsStore.getState().read('/home/about.md')).toMatchObject({ content: 'edited' })
  })

  it('restores the window session', () => {
    const pid = processStore.getState().spawn('about', { title: 'About' })
    processStore.getState().move(pid, { x: 42, y: 42 })
    const saved = snapshot()

    processStore.getState().reset()
    expect(processStore.getState().processes[pid]).toBeUndefined()

    hydrate(saved)
    expect(processStore.getState().processes[pid]).toMatchObject({
      title: 'About',
      position: { x: 42, y: 42 },
    })
    expect(processStore.getState().focusedPid).toBe(pid)
  })

  it('round-trips through an adapter as JSON', async () => {
    const adapter = createMemoryAdapter()
    vfsStore.getState().write('/home/about.md', 'edited')

    await adapter.save(JSON.parse(JSON.stringify(snapshot())))
    const loaded = await adapter.load()

    expect(loaded).not.toBeNull()
    expect(migrate(loaded)).toMatchObject({ overlay: { '/home/about.md': 'edited' } })
  })
})
