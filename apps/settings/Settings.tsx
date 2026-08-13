'use client'

/**
 * Appearance settings — an editor for `/home/.settings`, and nothing more.
 *
 * The shape lives in `wm/settings.ts` because the *OS* reads it: `OsShell`
 * paints the wallpaper, the desktop sizes its icons, the taskbar tints its
 * focused entry. This app just writes the file, exactly as the terminal writes
 * `/home/.history`.
 *
 * There is no Save button and no event to announce a change. Every surface
 * subscribes to the file, so writing it *is* applying it — which also means
 * `echo '{"wallpaper":"ink"}' > /home/.settings` works from the shell. See
 * D-034.
 */
import { basename } from '@/kernel'
import { useFileText } from '@/hooks/kernel'
import type { AppProps } from '@/registry'
import {
  ACCENTS,
  ICON_SIZE_LABELS,
  SETTINGS_PATH,
  WALLPAPERS,
  parseSettings,
  serializeSettings,
  type Settings as SettingsShape,
} from '@/wm/settings'

export default function Settings({ kernel }: AppProps) {
  // Subscribed rather than held: editing the file in the editor, or from the
  // shell, updates these controls too.
  const settings = parseSettings(useFileText(SETTINGS_PATH))

  const update = (patch: Partial<SettingsShape>) => {
    kernel.fs.write(SETTINGS_PATH, serializeSettings({ ...settings, ...patch }))
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-neutral-950 px-4 py-3 font-mono text-xs text-neutral-300">
      <Section title="Wallpaper">
        <div className="flex flex-wrap gap-2">
          {Object.entries(WALLPAPERS).map(([id, wallpaper]) => (
            <button
              key={id}
              type="button"
              data-wallpaper={id}
              aria-pressed={settings.wallpaper === id}
              onClick={() => update({ wallpaper: id as SettingsShape['wallpaper'] })}
              className={`h-12 w-20 rounded border text-[10px] ${
                settings.wallpaper === id
                  ? 'border-neutral-300'
                  : 'border-neutral-800 hover:border-neutral-600'
              }`}
              style={{ background: wallpaper.css }}
              title={wallpaper.label}
            >
              <span className="sr-only">{wallpaper.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accent">
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACCENTS).map(([id, accent]) => (
            <button
              key={id}
              type="button"
              data-accent={id}
              aria-pressed={settings.accent === id}
              onClick={() => update({ accent: id as SettingsShape['accent'] })}
              title={accent.label}
              className={`h-6 w-6 rounded-full border-2 ${
                settings.accent === id ? 'border-neutral-200' : 'border-transparent'
              }`}
              style={{ backgroundColor: accent.color }}
            >
              <span className="sr-only">{accent.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Icon size">
        <div className="flex gap-1">
          {Object.entries(ICON_SIZE_LABELS).map(([id, label]) => (
            <Choice
              key={id}
              active={settings.iconSize === id}
              onClick={() => update({ iconSize: id as SettingsShape['iconSize'] })}
              data-icon-size={id}
            >
              {label}
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="Desktop">
        <Choice
          active={settings.showHidden}
          onClick={() => update({ showHidden: !settings.showHidden })}
          data-show-hidden=""
        >
          {settings.showHidden ? '☑' : '☐'} show hidden files
        </Choice>
      </Section>

      <p className="mt-5 border-t border-neutral-800 pt-3 leading-relaxed text-neutral-600">
        These live in <span className="text-neutral-400">{SETTINGS_PATH}</span>, which is a
        real file — <span className="text-neutral-400">cat {basename(SETTINGS_PATH)}</span>{' '}
        reads it, the editor edits it, and <span className="text-neutral-400">rm</span>{' '}
        restores the defaults.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[11px] tracking-wide text-neutral-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Choice({
  active,
  onClick,
  children,
  ...rest
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded border px-2 py-1 ${
        active
          ? 'border-neutral-400 text-neutral-100'
          : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}
