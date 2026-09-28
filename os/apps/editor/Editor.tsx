'use client'

/**
 * A text editor — the first app that **creates** rather than reads.
 *
 * Everything before it consumed the filesystem; `unlink` and the write path
 * ([D-027](../../docs/decisions.md)) were built for this. Spawned with the path
 * in `args[0]`, like the viewer.
 *
 * It declares no `handles`, deliberately. The viewer already claims the text
 * mimes, and a second exact claim would be resolved by registration order in
 * `findHandlerFor` — silently, and differently depending on where someone added
 * a line. So the viewer stays the default for *opening* and the editor is
 * reached explicitly: right-click → Edit, or the viewer's own Edit button.
 * See D-033.
 */
import { useCallback, useState } from 'react'

import { basename } from '@/os/kernel'
import type { AppProps } from '@/os/registry'

/** Why this node cannot be edited, or null. Same words `cat` uses. */
function problemWith(path: string, node: ReturnType<AppProps['kernel']['fs']['stat']>): string | null {
  if (!path) return 'no file given'
  if (!node) return `${path}: No such file or directory`
  if (node.type === 'dir') return `${path}: Is a directory`
  if (node.type === 'app') return `${path}: Is an application`
  // Asset-backed: the bytes live in /public, so there is nothing here to edit.
  if (node.content === undefined) return `${path}: binary or external file (src: ${node.src ?? 'unknown'})`
  return null
}

export default function Editor({ args, kernel }: AppProps) {
  const path = args[0] ?? ''
  const node = path ? kernel.fs.stat(path) : null
  const problem = problemWith(path, node)

  // Read once into a buffer rather than subscribing: a store-driven value would
  // fight every keystroke. The cost is that a write from elsewhere — the shell,
  // another editor — is not noticed, which is what "saved" vs "on disk" means
  // in any editor.
  const initial = node?.type === 'file' ? (node.content ?? '') : ''
  const [text, setText] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  const dirty = text !== saved

  const save = useCallback(() => {
    try {
      kernel.fs.write(path, text)
      setSaved(text)
      setError(null)
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown))
    }
  }, [kernel, path, text])

  if (problem) {
    return (
      <div className="h-full w-full bg-neutral-950 p-4 font-mono text-xs text-red-400">
        editor: {problem}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 font-mono text-xs">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
        <span className="truncate text-neutral-400">{basename(path)}</span>
        {/*
          The dirty marker lives here rather than in the window title: the title
          is set once at spawn and the process table has no rename.
        */}
        {dirty && <span className="text-yellow-500">● unsaved</span>}
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="truncate text-red-400">{error}</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:hover:border-neutral-700"
          >
            save
          </button>
        </div>
      </header>

      <textarea
        value={text}
        spellCheck={false}
        aria-label={`editing ${basename(path)}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Ctrl/Cmd+S saves here rather than opening the browser's save dialog.
          if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault()
            save()
          }
        }}
        className="min-h-0 flex-1 resize-none bg-neutral-950 p-3 leading-relaxed text-neutral-200 outline-none"
      />

      <div className="shrink-0 truncate border-t border-neutral-800 px-3 py-1 text-neutral-600">
        {path} · {text.length} characters · ctrl+s to save
      </div>
    </div>
  )
}
