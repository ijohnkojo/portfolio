import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventBus } from './events'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('delivers payloads to every listener', () => {
    const a = vi.fn()
    const b = vi.fn()
    bus.on('fs:changed', a)
    bus.on('fs:changed', b)

    bus.emit('fs:changed', { path: '/notes.md' })

    expect(a).toHaveBeenCalledWith({ path: '/notes.md' })
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('ignores emits with no listeners', () => {
    expect(() => bus.emit('nobody:home', 1)).not.toThrow()
  })

  // The leak this guards against is the one named in docs/gotchas.md.
  it('removes the listener via the unsubscribe returned by on()', () => {
    const handler = vi.fn()
    const off = bus.on('tick', handler)

    bus.emit('tick', 1)
    off()
    bus.emit('tick', 2)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(bus.listenerCount('tick')).toBe(0)
  })

  it('is idempotent when unsubscribed twice', () => {
    const off = bus.on('tick', vi.fn())
    const other = bus.on('tick', vi.fn())

    off()
    off()

    expect(bus.listenerCount('tick')).toBe(1)
    other()
    expect(bus.listenerCount()).toBe(0)
  })

  it('lets a handler unsubscribe during emit without skipping its peers', () => {
    const second = vi.fn()
    const off = bus.on('tick', () => off())
    bus.on('tick', second)

    expect(() => bus.emit('tick', 1)).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
    expect(bus.listenerCount('tick')).toBe(1)
  })
})
