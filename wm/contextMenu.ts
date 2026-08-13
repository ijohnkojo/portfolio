/**
 * What a right-click offers, and where the menu goes.
 *
 * Pure — `ContextMenu.tsx` does the DOM. The interesting part is which actions
 * apply to which node, because two of the answers are constraints from
 * elsewhere in the system rather than taste.
 */
import type { VFSNode } from '@/kernel'
import { isEditable } from '@/registry/launch'

export type NodeAction = 'open' | 'edit' | 'rename' | 'delete'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/**
 * The actions that make sense for a node.
 *
 * **An application shortcut gets only Open.** It is re-seeded on every boot
 * ([D-030](../docs/decisions.md)), so Delete would appear to work and silently
 * revert on reload — an action you would have to discover was a lie. Offering
 * less is more honest than offering that.
 *
 * **A directory cannot be renamed**, for the same reason `mv` refuses one: a
 * rename is a copy followed by a remove, and the VFS copy path handles a single
 * file. The desktop gets no capability the shell lacks.
 */
export function actionsFor(node: VFSNode): NodeAction[] {
  if (node.type === 'app') return ['open']
  if (node.type === 'dir') return ['open', 'delete']

  return isEditable(node)
    ? ['open', 'edit', 'rename', 'delete']
    : ['open', 'rename', 'delete']
}

/** Menu geometry, fixed so the size is known without measuring the DOM. */
export const MENU_WIDTH = 168
export const MENU_ITEM_HEIGHT = 26
export const MENU_PADDING = 8

export function menuSize(itemCount: number): Size {
  return { width: MENU_WIDTH, height: itemCount * MENU_ITEM_HEIGHT + MENU_PADDING }
}

/**
 * Keep the menu on screen: **flip rather than clip** when it would overflow, so
 * a right-click near the bottom-right corner still shows every item instead of
 * a menu with its last option cut off.
 */
export function clampMenu(at: Point, size: Size, viewport: Size): Point {
  return {
    x: at.x + size.width > viewport.width ? Math.max(0, at.x - size.width) : at.x,
    y: at.y + size.height > viewport.height ? Math.max(0, at.y - size.height) : at.y,
  }
}
