/**
 * Process table — the flat map of open windows.
 *
 * Focus and z-index live here, centrally, never in per-window local state.
 * Splitting them across windows is how z-index bugs appear (design doc §2).
 *
 * Every mutator must leave *untouched* process objects referentially identical,
 * so a window subscribed via a scoped selector doesn't re-render when a
 * different window moves (docs/gotchas.md).
 */
import { createStore } from 'zustand/vanilla'

export type WindowState = 'normal' | 'minimized' | 'maximized'

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Process {
  pid: number
  appId: string
  args: string[]
  title: string
  position: Position
  size: Size
  zIndex: number
  state: WindowState
}

export interface SpawnOptions {
  args?: string[]
  title?: string
  position?: Position
  size?: Size
}

const DEFAULT_SIZE: Size = { width: 640, height: 420 }
const CASCADE_STEP = 28
const CASCADE_WRAP = 8

export interface ProcessTableState {
  processes: Record<number, Process>
  focusedPid: number | null
  nextPid: number
  nextZIndex: number

  spawn: (appId: string, options?: SpawnOptions) => number
  kill: (pid: number) => void
  focus: (pid: number) => void
  move: (pid: number, position: Position) => void
  resize: (pid: number, size: Size, position?: Position) => void
  setWindowState: (pid: number, state: WindowState) => void
  reset: () => void
}

/** Offset each new window so they don't land exactly on top of each other. */
function cascade(index: number): Position {
  const step = index % CASCADE_WRAP
  return { x: 80 + step * CASCADE_STEP, y: 60 + step * CASCADE_STEP }
}

export const processStore = createStore<ProcessTableState>()((set, get) => ({
  processes: {},
  focusedPid: null,
  nextPid: 1,
  nextZIndex: 1,

  spawn: (appId, options = {}) => {
    const { nextPid, nextZIndex } = get()
    const pid = nextPid

    const proc: Process = {
      pid,
      appId,
      args: options.args ?? [],
      title: options.title ?? appId,
      position: options.position ?? cascade(Object.keys(get().processes).length),
      size: options.size ?? DEFAULT_SIZE,
      zIndex: nextZIndex,
      state: 'normal',
    }

    set((s) => ({
      processes: { ...s.processes, [pid]: proc },
      focusedPid: pid,
      nextPid: pid + 1,
      nextZIndex: nextZIndex + 1,
    }))

    return pid
  },

  kill: (pid) => {
    set((s) => {
      if (!s.processes[pid]) return s
      const processes = { ...s.processes }
      delete processes[pid]

      // Focus falls to the topmost surviving window, not to nothing.
      let focusedPid = s.focusedPid
      if (focusedPid === pid) {
        const survivors = Object.values(processes).filter((p) => p.state !== 'minimized')
        focusedPid = survivors.length
          ? survivors.reduce((top, p) => (p.zIndex > top.zIndex ? p : top)).pid
          : null
      }

      return { processes, focusedPid }
    })
  },

  focus: (pid) => {
    const s = get()
    const proc = s.processes[pid]
    if (!proc) return

    const alreadyOnTop = s.focusedPid === pid && proc.zIndex === s.nextZIndex - 1
    if (alreadyOnTop && proc.state !== 'minimized') return

    set((current) => ({
      processes: {
        ...current.processes,
        [pid]: {
          ...proc,
          zIndex: current.nextZIndex,
          // Clicking a minimized window in the taskbar restores it.
          state: proc.state === 'minimized' ? 'normal' : proc.state,
        },
      },
      focusedPid: pid,
      nextZIndex: current.nextZIndex + 1,
    }))
  },

  move: (pid, position) => {
    set((s) => {
      const proc = s.processes[pid]
      if (!proc) return s
      if (proc.position.x === position.x && proc.position.y === position.y) return s
      return { processes: { ...s.processes, [pid]: { ...proc, position } } }
    })
  },

  resize: (pid, size, position) => {
    set((s) => {
      const proc = s.processes[pid]
      if (!proc) return s
      return {
        processes: {
          ...s.processes,
          [pid]: { ...proc, size, position: position ?? proc.position },
        },
      }
    })
  },

  setWindowState: (pid, state) => {
    set((s) => {
      const proc = s.processes[pid]
      if (!proc || proc.state === state) return s

      const processes = { ...s.processes, [pid]: { ...proc, state } }

      // A window that minimizes itself must hand focus off.
      let focusedPid = s.focusedPid
      if (state === 'minimized' && focusedPid === pid) {
        const visible = Object.values(processes).filter((p) => p.state !== 'minimized')
        focusedPid = visible.length
          ? visible.reduce((top, p) => (p.zIndex > top.zIndex ? p : top)).pid
          : null
      }

      return { processes, focusedPid }
    })
  },

  reset: () => set({ processes: {}, focusedPid: null, nextPid: 1, nextZIndex: 1 }),
}))
