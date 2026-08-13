'use client'

/**
 * A right-click menu.
 *
 * Rendered through a **portal to `document.body`**, which is not decoration:
 * react-rnd positions windows with a CSS `transform`, and a transformed
 * ancestor makes `position: fixed` resolve against that ancestor instead of the
 * viewport. A menu opened inside a window would land in the wrong place. The
 * portal takes it out of that subtree entirely.
 *
 * Its size is computed rather than measured (`contextMenu.ts`), so there is no
 * layout effect writing state to reposition after the first paint.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { MENU_WIDTH, clampMenu, menuSize } from './contextMenu'

export interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

export function ContextMenu({
  at,
  items,
  onDismiss,
}: {
  at: { x: number; y: number }
  items: MenuItem[]
  onDismiss: () => void
}) {
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A pointer down anywhere else closes it, as does Escape, a scroll, or the
    // window changing size underneath it.
    function onPointerDown(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) onDismiss()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onDismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onDismiss)
    }
  }, [onDismiss])

  if (typeof document === 'undefined' || items.length === 0) return null

  const position = clampMenu(at, menuSize(items.length), {
    width: window.innerWidth,
    height: window.innerHeight,
  })

  return createPortal(
    <div
      ref={menu}
      role="menu"
      data-context-menu
      style={{ left: position.x, top: position.y, width: MENU_WIDTH }}
      // Above every window: z-index comes from the process table and grows, so
      // this sits deliberately far beyond it.
      className="fixed z-[9999] rounded-md border border-neutral-700 bg-neutral-900 py-1 font-mono text-xs shadow-xl shadow-black/50"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect()
            onDismiss()
          }}
          className="block w-full px-3 py-1 text-left text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
