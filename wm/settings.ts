/**
 * How the desktop looks, as data.
 *
 * It lives in `wm/` rather than in the settings app because the *OS* reads it —
 * `OsShell` paints the wallpaper, the desktop sizes its icons, the taskbar
 * tints its focused entry. `apps/settings` is only an editor for it, the way
 * the terminal is only an editor for `/home/.history`.
 *
 * Stored at `/home/.settings`, which makes this the **third use of
 * [D-020](../docs/decisions.md)'s trick** after history and icon positions: a
 * dotfile riding the write overlay persists for free, needs no new storage, and
 * `cat /home/.settings` works. It also means `echo … > /home/.settings` from the
 * shell changes the wallpaper, which is the property worth having.
 */

export const SETTINGS_PATH = '/home/.settings'

export type WallpaperId = 'midnight' | 'slate' | 'ember' | 'ink'
export type AccentId = 'neutral' | 'cyan' | 'amber' | 'violet' | 'green'
export type IconSize = 'small' | 'medium' | 'large'

export interface Settings {
  wallpaper: WallpaperId
  accent: AccentId
  iconSize: IconSize
  /** Dot-prefixed entries on the desktop, as `ls -a` shows them. */
  showHidden: boolean
}

/**
 * Generated backgrounds, not images — nothing new ships in the `/os` payload
 * ([D-011](../docs/decisions.md)). The Tailwind colour variables are real CSS
 * custom properties at runtime, so these work as inline styles.
 */
export const WALLPAPERS: Record<WallpaperId, { label: string; css: string }> = {
  midnight: {
    label: 'Midnight',
    css: 'radial-gradient(ellipse at top, var(--color-neutral-800), var(--color-neutral-950))',
  },
  slate: {
    label: 'Slate',
    css: 'linear-gradient(160deg, var(--color-slate-800), var(--color-slate-950))',
  },
  ember: {
    label: 'Ember',
    css: 'radial-gradient(ellipse at top left, var(--color-stone-700), var(--color-stone-950))',
  },
  ink: {
    label: 'Ink',
    css: 'radial-gradient(ellipse at bottom, var(--color-indigo-950), var(--color-neutral-950))',
  },
}

export const ACCENTS: Record<AccentId, { label: string; color: string }> = {
  neutral: { label: 'Neutral', color: 'var(--color-neutral-300)' },
  cyan: { label: 'Cyan', color: 'var(--color-cyan-400)' },
  amber: { label: 'Amber', color: 'var(--color-amber-400)' },
  violet: { label: 'Violet', color: 'var(--color-violet-400)' },
  green: { label: 'Green', color: 'var(--color-emerald-400)' },
}

export const ICON_SIZE_LABELS: Record<IconSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

/** Midnight is what the desktop looked like before this existed. */
export const DEFAULT_SETTINGS: Settings = {
  wallpaper: 'midnight',
  accent: 'neutral',
  iconSize: 'medium',
  showHidden: false,
}

function pick<T extends string>(value: unknown, allowed: Record<T, unknown>, fallback: T): T {
  return typeof value === 'string' && value in allowed ? (value as T) : fallback
}

/**
 * Read the file, **field by field**.
 *
 * A settings file is a dotfile in a writable filesystem — anything can
 * `echo nonsense >` it, and the editor can save it half-finished. So one bad
 * field falls back on its own rather than discarding the rest, and a file that
 * is not an object at all falls back entirely. Losing your accent colour is a
 * better failure than a desktop that will not paint.
 */
export function parseSettings(text: string | null): Settings {
  if (!text) return DEFAULT_SETTINGS

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return DEFAULT_SETTINGS
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_SETTINGS
  }

  const raw = parsed as Partial<Record<keyof Settings, unknown>>
  return {
    wallpaper: pick(raw.wallpaper, WALLPAPERS, DEFAULT_SETTINGS.wallpaper),
    accent: pick(raw.accent, ACCENTS, DEFAULT_SETTINGS.accent),
    iconSize: pick(raw.iconSize, ICON_SIZE_LABELS, DEFAULT_SETTINGS.iconSize),
    showHidden:
      typeof raw.showHidden === 'boolean' ? raw.showHidden : DEFAULT_SETTINGS.showHidden,
  }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}
