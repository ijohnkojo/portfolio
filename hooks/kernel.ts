'use client'

/**
 * React bindings for the kernel stores.
 *
 * Every hook here is deliberately *narrow*. Subscribing a window to the whole
 * process table means every window re-renders whenever any window moves — the
 * failure mode called out in docs/gotchas.md. The mutators in kernel/process.ts
 * preserve object identity for untouched processes, and these selectors are
 * what turn that into actual skipped renders.
 */
import { useEffect, useEffectEvent } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

import {
  events,
  processStore,
  vfsStore,
  type EventHandler,
  type Process,
  type VFSNode,
} from '@/kernel'

/** One window's own entry. Re-renders only when *this* process changes. */
export function useProcess(pid: number): Process | undefined {
  return useStore(processStore, (s) => s.processes[pid])
}

/**
 * Just the pids. The window manager re-renders when a window opens or closes,
 * but not when one is dragged.
 */
export function usePids(): number[] {
  return useStore(
    processStore,
    useShallow((s) => Object.keys(s.processes).map(Number))
  )
}

export function useFocusedPid(): number | null {
  return useStore(processStore, (s) => s.focusedPid)
}

/**
 * Focus as a boolean, not the focused pid. Subscribing each window to
 * `focusedPid` itself would re-render every open window on every focus change;
 * this re-renders only the two whose focus actually flipped.
 */
export function useIsFocused(pid: number): boolean {
  return useStore(processStore, (s) => s.focusedPid === pid)
}

export function useVFSNode(path: string): VFSNode | null {
  return useStore(vfsStore, (s) => s.read(path))
}

/**
 * Subscribe for the lifetime of the component. The unsubscribe returned by
 * `events.on` *is* the effect cleanup, so a listener can't outlive its owner.
 *
 * `useEffectEvent` keeps the subscription stable while the handler still sees
 * current props — a caller passing an inline arrow doesn't resubscribe on every
 * render, and nothing needs a mutable ref to achieve it.
 */
export function useEvent<T = unknown>(name: string, handler: EventHandler<T>): void {
  const onEvent = useEffectEvent(handler)

  useEffect(() => events.on<T>(name, onEvent), [name])
}
