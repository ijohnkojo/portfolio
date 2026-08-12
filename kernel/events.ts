/**
 * Event bus — pub/sub so the WM, shell, and apps talk without direct references.
 *
 * `on()` returns its own unsubscribe function rather than exposing an `off()`.
 * Uncleaned listeners are the classic leak that kills a long-lived session
 * (docs/gotchas.md), so the API makes cleanup the thing you're already holding.
 */

export type EventHandler<T = unknown> = (payload: T) => void
export type Unsubscribe = () => void

export class EventBus {
  private listeners = new Map<string, Set<EventHandler<never>>>()

  on<T = unknown>(name: string, handler: EventHandler<T>): Unsubscribe {
    let set = this.listeners.get(name)
    if (!set) {
      set = new Set()
      this.listeners.set(name, set)
    }
    set.add(handler as EventHandler<never>)

    let active = true
    return () => {
      if (!active) return
      active = false
      const current = this.listeners.get(name)
      if (!current) return
      current.delete(handler as EventHandler<never>)
      if (current.size === 0) this.listeners.delete(name)
    }
  }

  /** Fire and forget. Iterates a copy so a handler may unsubscribe mid-emit. */
  emit<T = unknown>(name: string, payload: T): void {
    const set = this.listeners.get(name)
    if (!set) return
    for (const handler of [...set]) {
      ;(handler as EventHandler<T>)(payload)
    }
  }

  /** Introspection, for tests and a future `ps`-style debug view. */
  listenerCount(name?: string): number {
    if (name !== undefined) return this.listeners.get(name)?.size ?? 0
    let total = 0
    for (const set of this.listeners.values()) total += set.size
    return total
  }

  clear(): void {
    this.listeners.clear()
  }
}

export const events = new EventBus()
