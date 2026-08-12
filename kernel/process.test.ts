import { beforeEach, describe, expect, it } from 'vitest'

import { processStore } from './process'

const table = () => processStore.getState()

describe('process table', () => {
  beforeEach(() => {
    table().reset()
  })

  it('assigns increasing pids and focuses the newest window', () => {
    const a = table().spawn('about')
    const b = table().spawn('sysinfo')

    expect(b).toBeGreaterThan(a)
    expect(table().focusedPid).toBe(b)
    expect(table().processes[b].zIndex).toBeGreaterThan(table().processes[a].zIndex)
  })

  it('defaults the title to the appId and cascades windows apart', () => {
    const a = table().spawn('about')
    const b = table().spawn('about', { title: 'About' })

    expect(table().processes[a].title).toBe('about')
    expect(table().processes[b].title).toBe('About')
    expect(table().processes[b].position).not.toEqual(table().processes[a].position)
  })

  /**
   * The invariant the whole windowing performance story rests on: mutating one
   * process must leave every other process object referentially identical, or
   * scoped selectors re-render every window on every drag.
   */
  it('preserves the identity of untouched processes on move and resize', () => {
    const a = table().spawn('about')
    const b = table().spawn('sysinfo')
    const untouched = table().processes[b]

    table().move(a, { x: 300, y: 200 })
    expect(table().processes[b]).toBe(untouched)

    table().resize(a, { width: 800, height: 600 })
    expect(table().processes[b]).toBe(untouched)

    expect(table().processes[a].position).toEqual({ x: 300, y: 200 })
    expect(table().processes[a].size).toEqual({ width: 800, height: 600 })
  })

  it('skips the update entirely when a move lands on the current position', () => {
    const a = table().spawn('about')
    const before = table().processes[a]

    table().move(a, { ...before.position })

    expect(table().processes[a]).toBe(before)
  })

  it('applies the origin shift when a resize came from a top/left handle', () => {
    const a = table().spawn('about', { position: { x: 100, y: 100 } })

    table().resize(a, { width: 500, height: 400 }, { x: 40, y: 60 })

    expect(table().processes[a].position).toEqual({ x: 40, y: 60 })
  })

  it('raises a refocused window above the current top', () => {
    const a = table().spawn('about')
    const b = table().spawn('sysinfo')

    table().focus(a)

    expect(table().focusedPid).toBe(a)
    expect(table().processes[a].zIndex).toBeGreaterThan(table().processes[b].zIndex)
  })

  it('does not churn state when focusing the window that is already on top', () => {
    const a = table().spawn('about')
    const before = table().processes[a]

    table().focus(a)

    expect(table().processes[a]).toBe(before)
  })

  it('restores a minimized window when it is focused', () => {
    const a = table().spawn('about')
    table().setWindowState(a, 'minimized')

    table().focus(a)

    expect(table().processes[a].state).toBe('normal')
    expect(table().focusedPid).toBe(a)
  })

  it('hands focus to the topmost survivor when the focused window minimizes', () => {
    const a = table().spawn('about')
    const b = table().spawn('sysinfo')

    table().setWindowState(b, 'minimized')

    expect(table().focusedPid).toBe(a)
  })

  it('hands focus to the topmost survivor on kill, and to nothing when last', () => {
    const a = table().spawn('about')
    const b = table().spawn('sysinfo')

    table().kill(b)
    expect(table().processes[b]).toBeUndefined()
    expect(table().focusedPid).toBe(a)

    table().kill(a)
    expect(table().focusedPid).toBeNull()
  })

  it('ignores operations on a pid that is gone', () => {
    expect(() => table().move(999, { x: 0, y: 0 })).not.toThrow()
    expect(() => table().kill(999)).not.toThrow()
    expect(() => table().focus(999)).not.toThrow()
  })
})
