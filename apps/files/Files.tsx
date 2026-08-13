'use client'

/**
 * The file manager.
 *
 * A window onto the same tree the shell walks and the desktop shows a corner of
 * — the third view of one filesystem, and the one that makes `/papers` and
 * `/projects` browsable without typing.
 *
 * Everything with logic lives in `navigation.ts` and is tested in bare node.
 * This file holds the DOM, the selection, and the calls across the syscall
 * boundary.
 */
import { useCallback, useState } from 'react'

import { resolvePath, type VFSNode } from '@/kernel'
import { useDirectory } from '@/hooks/kernel'
import { findHandlerFor, getManifest, type AppProps } from '@/registry'
import { launchFor, performLaunch } from '@/registry/launch'
import { ContextMenu, type MenuItem } from '@/wm/ContextMenu'
import { actionsFor } from '@/wm/contextMenu'
import { iconFor, uniqueName } from '@/wm/desktopIcons'
import {
  back,
  breadcrumb,
  canGoBack,
  canGoForward,
  createNavigation,
  currentPath,
  describeNode,
  forward,
  navigate,
  parentOf,
  sortEntries,
} from './navigation'

/** Masked, not an <img>: an image is its own document and would paint black. */
function Glyph({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 bg-current"
      style={{
        width: size,
        height: size,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}

export default function Files({ args, kernel }: AppProps) {
  const [nav, setNav] = useState(() => createNavigation(args[0] ?? '/'))
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; node: VFSNode } | null>(null)

  const path = currentPath(nav)
  const entries = sortEntries(useDirectory(path))

  const goTo = useCallback((next: string) => {
    setNav((current) => navigate(current, next))
    setSelected(null)
    setError(null)
  }, [])

  /**
   * A directory is where this view and the others disagree, which is why
   * `launchFor` returns null for one: the shell errors, the desktop opens this
   * app, and here it simply means "go in".
   */
  const open = useCallback(
    (node: VFSNode) => {
      const target = resolvePath(path, node.name)
      const launch = launchFor(target, node, findHandlerFor)

      if (!launch) return goTo(target)
      if (launch.kind === 'unhandled') {
        return setError(`no application registered for ${launch.mime}`)
      }
      performLaunch(kernel, launch, (appId) => getManifest(appId)?.name ?? appId)
    },
    [path, goTo, kernel]
  )

  const removeNamed = useCallback(
    (name: string) => {
      const target = resolvePath(path, name)

      try {
        kernel.fs.unlink(target)
        setSelected(null)
        setError(null)
      } catch (thrown) {
        // The desktop and the file manager get no privileges the shell lacks:
        // published content is read-only, and removing an *edit* to it reverts
        // (D-027). Say it in the words `rm` uses.
        const detail = thrown instanceof Error ? thrown.message : String(thrown)
        setError(
          detail.startsWith('EROFS')
            ? `${name}: read-only, part of the published content`
            : `${name}: ${detail}`
        )
      }
    },
    [path, kernel]
  )

  const remove = useCallback(() => {
    if (selected) removeNamed(selected)
  }, [selected, removeNamed])

  const newFolder = useCallback(() => {
    // Names itself rather than prompting: a `window.prompt` inside an OS that
    // has its own windows would be a lie.
    const name = uniqueName('new folder', (candidate) =>
      Boolean(kernel.fs.stat(resolvePath(path, candidate)))
    )

    try {
      kernel.fs.mkdir(resolvePath(path, name))
      setSelected(name)
      setError(null)
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown))
    }
  }, [path, kernel])

  const menuItems: MenuItem[] = !menu
    ? []
    : actionsFor(menu.node).map((action) => ({
        label: { open: 'Open', edit: 'Edit', rename: 'Rename', delete: 'Delete' }[action],
        // Rename is the desktop's, not this window's — there is no inline field
        // in a list row yet, and a disabled item says so more honestly than a
        // missing one.
        disabled: action === 'rename',
        onSelect: () => {
          if (action === 'open') open(menu.node)
          if (action === 'edit') {
            kernel.proc.spawn('editor', [resolvePath(path, menu.node.name)], menu.node.name)
          }
          if (action === 'delete') {
            setSelected(menu.node.name)
            removeNamed(menu.node.name)
          }
        },
      }))

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 font-mono text-xs text-neutral-300">
      <div className="flex shrink-0 items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        <ToolButton label="back" disabled={!canGoBack(nav)} onClick={() => setNav(back)}>
          ←
        </ToolButton>
        <ToolButton label="forward" disabled={!canGoForward(nav)} onClick={() => setNav(forward)}>
          →
        </ToolButton>
        <ToolButton label="up" disabled={path === '/'} onClick={() => goTo(parentOf(path))}>
          ↑
        </ToolButton>

        <div className="mx-1 h-4 w-px bg-neutral-800" />

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {breadcrumb(path).map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
              {/* Not after the root, which is already a slash. */}
              {index > 1 && <span className="text-neutral-600">/</span>}
              <button
                type="button"
                onClick={() => goTo(crumb.path)}
                className="rounded px-1 py-0.5 hover:bg-neutral-800 hover:text-neutral-100"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <ToolButton label="new folder" onClick={newFolder}>
          +
        </ToolButton>
        <ToolButton label="delete" disabled={!selected} onClick={remove}>
          ␡
        </ToolButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {entries.length === 0 ? (
          <p className="px-3 py-2 text-neutral-600">empty</p>
        ) : (
          entries.map((node) => (
            <button
              key={node.name}
              type="button"
              data-entry={node.name}
              onClick={() => setSelected(node.name)}
              onDoubleClick={() => open(node)}
              onContextMenu={(event) => {
                event.preventDefault()
                setSelected(node.name)
                setMenu({ at: { x: event.clientX, y: event.clientY }, node })
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                open(node)
              }}
              className={`flex w-full items-center gap-2 px-3 py-1 text-left ${
                selected === node.name
                  ? 'bg-neutral-100/10 text-neutral-100'
                  : 'hover:bg-neutral-100/5'
              }`}
            >
              <Glyph src={iconFor(node)} />
              <span className="min-w-0 flex-1 truncate">
                {node.name}
                {node.type === 'dir' && '/'}
              </span>
              <span className="shrink-0 text-neutral-600">
                {describeNode(node, node.type === 'dir' ? kernel.fs.list(resolvePath(path, node.name)).length : 0)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="shrink-0 truncate border-t border-neutral-800 px-3 py-1">
        <span className={error ? 'text-red-400' : 'text-neutral-600'}>
          {error ?? (selected ? resolvePath(path, selected) : `${entries.length} entries`)}
        </span>
      </div>

      {menu && <ContextMenu at={menu.at} items={menuItems} onDismiss={() => setMenu(null)} />}
    </div>
  )
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
