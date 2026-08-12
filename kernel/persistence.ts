/**
 * Persistence — wiring is Phase 2, but the *shape* is decided now.
 *
 * Two decisions the design doc (§5) says to make before building:
 *
 * 1. What `fs.write` targets. The base tree is static, shipped with the build
 *    from /content, and treated as read-only. Only *writes* persist, as an
 *    overlay of path -> content replayed on top of the base at hydrate time.
 *    So editing the content of the site never invalidates a returning user's
 *    session, and swapping localStorage for a real backend is one more
 *    StorageAdapter rather than a rewrite of the write path.
 *
 * 2. `schemaVersion` from day one, with a migration seam, even though there is
 *    only version 1 today.
 */
import type { Process } from './process'
import { processStore } from './process'
import { vfsStore } from './vfs'

export const SCHEMA_VERSION = 1

/** Writes only, keyed by absolute path. The base tree is not persisted. */
export type Overlay = Record<string, string>

export interface PersistedSession {
  processes: Record<number, Process>
  focusedPid: number | null
  nextPid: number
  nextZIndex: number
}

export interface PersistedState {
  schemaVersion: number
  overlay: Overlay
  session: PersistedSession
}

export interface StorageAdapter {
  load: () => Promise<PersistedState | null>
  save: (state: PersistedState) => Promise<void>
  clear: () => Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Migration seam                                                             */
/* -------------------------------------------------------------------------- */

/** Keyed by the version being migrated *from*. Add `1: (s) => …` when v2 lands. */
const migrations: Record<number, (state: PersistedState) => PersistedState> = {}

/**
 * Bring a stored blob up to SCHEMA_VERSION, or return null if it can't be
 * salvaged. Null means "start fresh" — never throw at a returning user.
 */
export function migrate(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') return null

  const candidate = raw as Partial<PersistedState>
  const version = candidate.schemaVersion

  if (typeof version !== 'number' || version < 1) return null
  // Downgrade: the stored state came from a newer build than this one.
  if (version > SCHEMA_VERSION) return null

  let state = candidate as PersistedState
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) return null
    state = step(state)
  }

  if (!state.overlay || !state.session) return null
  return { ...state, schemaVersion: SCHEMA_VERSION }
}

/* -------------------------------------------------------------------------- */
/* Snapshot / hydrate                                                         */
/* -------------------------------------------------------------------------- */

export function snapshot(): PersistedState {
  const { overlay } = vfsStore.getState()
  const { processes, focusedPid, nextPid, nextZIndex } = processStore.getState()

  return {
    schemaVersion: SCHEMA_VERSION,
    overlay: { ...overlay },
    session: { processes, focusedPid, nextPid, nextZIndex },
  }
}

/** Replays an overlay onto the already-mounted base tree, then restores windows. */
export function hydrate(state: PersistedState): void {
  vfsStore.getState().applyOverlay(state.overlay)
  processStore.setState({
    processes: state.session.processes,
    focusedPid: state.session.focusedPid,
    nextPid: state.session.nextPid,
    nextZIndex: state.session.nextZIndex,
  })
}

/* -------------------------------------------------------------------------- */
/* Adapters                                                                   */
/* -------------------------------------------------------------------------- */

export function createLocalStorageAdapter(key = 'personal-os'): StorageAdapter {
  const available = () => typeof globalThis.localStorage !== 'undefined'

  return {
    async load() {
      if (!available()) return null
      const raw = globalThis.localStorage.getItem(key)
      if (!raw) return null
      try {
        return migrate(JSON.parse(raw))
      } catch {
        return null
      }
    },
    async save(state) {
      if (!available()) return
      globalThis.localStorage.setItem(key, JSON.stringify(state))
    },
    async clear() {
      if (!available()) return
      globalThis.localStorage.removeItem(key)
    },
  }
}

/** For SSR and tests: satisfies the interface, remembers nothing. */
export function createMemoryAdapter(): StorageAdapter {
  let stored: PersistedState | null = null
  return {
    async load() {
      return stored
    },
    async save(state) {
      stored = state
    },
    async clear() {
      stored = null
    },
  }
}
