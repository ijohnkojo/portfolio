'use client'

/**
 * Taskbar: a launcher for registered apps, and one button per running process.
 *
 * Each running entry is its own component subscribed to its own process, for
 * the same reason windows are — so dragging window 1 doesn't re-render the
 * taskbar entry for window 2.
 */
import { systemAPI } from '@/kernel'
import { useIsFocused, usePids, useProcess } from '@/hooks/kernel'
import { listApps } from '@/registry'

export function Taskbar() {
  const pids = usePids()
  const apps = listApps()

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-t border-neutral-800 bg-neutral-900 px-2">
      <span className="px-2 font-mono text-xs tracking-wide text-neutral-500 select-none">
        personal-os
      </span>

      <div className="mx-1 h-5 w-px bg-neutral-800" />

      {apps.map((app) => (
        <button
          key={app.id}
          type="button"
          // Marks a launcher rather than a running-window button, so tooling can
          // tell the taskbar's two roles apart.
          data-launcher={app.id}
          onClick={() => systemAPI.proc.spawn(app.id, [], app.name)}
          className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          {/* Masked rather than an <img>, so the glyph follows the text colour
              through hover. Same technique as the desktop icons. */}
          <span
            aria-hidden
            className="h-3.5 w-3.5 bg-current"
            style={{
              maskImage: `url(${app.icon})`,
              WebkitMaskImage: `url(${app.icon})`,
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
            }}
          />
          {app.name}
        </button>
      ))}

      <div className="mx-1 h-5 w-px bg-neutral-800" />

      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {pids.map((pid) => (
          <TaskbarItem key={pid} pid={pid} />
        ))}
      </div>
    </div>
  )
}

function TaskbarItem({ pid }: { pid: number }) {
  const proc = useProcess(pid)
  const isFocused = useIsFocused(pid)
  if (!proc) return null

  const minimized = proc.state === 'minimized'

  return (
    <button
      type="button"
      onClick={() => {
        // Clicking the focused window's own button tucks it away; clicking any
        // other one brings it forward (focus() also un-minimizes).
        if (isFocused && !minimized) systemAPI.window.setState(pid, 'minimized')
        else systemAPI.proc.focus(pid)
      }}
      // The accent arrives as a custom property from the OS root, so nothing
      // has to be passed down for a colour the user picked (D-034).
      style={
        isFocused && !minimized
          ? { backgroundColor: 'color-mix(in srgb, var(--os-accent) 28%, transparent)' }
          : undefined
      }
      className={`max-w-40 truncate rounded px-2 py-1 font-mono text-xs ${
        isFocused && !minimized
          ? 'text-neutral-100'
          : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
      } ${minimized ? 'opacity-50' : ''}`}
    >
      {proc.title}
      <span className="ml-1.5 opacity-40">{pid}</span>
    </button>
  )
}
