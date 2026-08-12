'use client'

/**
 * File viewer. Dispatches on the node's mime type and renders accordingly.
 *
 * Spawned with the path in `args[0]` — the first real use of `args`, which the
 * process table has carried since the foundation slice without anything
 * needing it.
 *
 * Two content sources, because the VFS has both: `content` inline, or `src`
 * pointing into /public for assets. Inline is synchronous; `src` has to be
 * fetched, which is the one place `kernel.fs.read` being synchronous shows
 * through (see docs/decisions.md D-011).
 */
import { useEffect, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { basename, type FileNode } from '@/kernel'
import { mdxComponents } from '@/components/mdx'
import type { AppProps } from '@/registry'

type TextState =
  | { status: 'ready'; text: string }
  | { status: 'loading' }
  | { status: 'error'; message: string }

const TEXT_MIMES = ['text/markdown', 'text/plain', 'application/json']

/**
 * The VFS stores the file exactly as it is on disk, frontmatter included — that
 * is what `cat` should print. The rendered view has to drop it, or every
 * writeup opens with its own YAML as body text.
 */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

/**
 * MDX comments — `{ /* … *\/ }` — are stripped by the MDX compiler the routes use,
 * but `react-markdown` has never heard of them and would render an author's
 * working notes as visible body text. Closes half of D-016: the two surfaces
 * still differ on embedded components, but no longer on comments.
 */
function stripMdxComments(text: string): string {
  return text.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

export default function Viewer({ args, kernel }: AppProps) {
  const path = args[0] ?? ''
  const node = path ? kernel.fs.stat(path) : null
  const file = node?.type === 'file' ? node : null

  const inline = file?.content ?? null
  const src = file?.src ?? null
  const needsFetch = Boolean(file && inline === null && src && TEXT_MIMES.includes(file.mime))

  const [fetched, setFetched] = useState<TextState>(
    needsFetch ? { status: 'loading' } : { status: 'ready', text: '' }
  )
  const [raw, setRaw] = useState(false)

  useEffect(() => {
    if (!needsFetch || !src) return

    let cancelled = false
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setFetched({ status: 'ready', text })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setFetched({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [needsFetch, src])

  if (!path) return <Notice>viewer: no file given</Notice>
  if (!node) return <Notice>{`viewer: ${path}: No such file or directory`}</Notice>
  if (!file) return <Notice>{`viewer: ${path}: Not a regular file`}</Notice>

  const text = inline ?? (fetched.status === 'ready' ? fetched.text : '')
  const isText = TEXT_MIMES.includes(file.mime)

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-3 py-1.5 font-mono text-[11px] text-neutral-500">
        <span className="truncate text-neutral-400">{basename(path)}</span>
        <span className="truncate">{file.mime}</span>
        <div className="ml-auto flex items-center gap-2">
          {src && <span className="truncate opacity-60">{src}</span>}
          {isText && (
            <button
              type="button"
              onClick={() => setRaw((r) => !r)}
              className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 hover:text-neutral-200"
            >
              {raw ? 'rendered' : 'raw'}
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <Body
          file={file}
          text={text}
          raw={raw}
          fetchState={needsFetch ? fetched : null}
        />
      </div>
    </div>
  )
}

function Body({
  file,
  text,
  raw,
  fetchState,
}: {
  file: FileNode
  text: string
  raw: boolean
  fetchState: TextState | null
}) {
  if (fetchState?.status === 'loading') return <Notice>loading…</Notice>
  if (fetchState?.status === 'error') {
    return <Notice>{`viewer: could not load ${file.src}: ${fetchState.message}`}</Notice>
  }

  // The browser's own PDF viewer already does paging, zoom, search, and print.
  if (file.mime === 'application/pdf') {
    if (!file.src) return <Notice>viewer: pdf has no source</Notice>
    return <embed src={file.src} type="application/pdf" className="h-full w-full" />
  }

  if (file.mime.startsWith('image/')) {
    if (!file.src) return <Notice>viewer: image has no source</Notice>
    return (
      <div className="grid h-full place-items-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.src} alt={file.name} className="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  if (!TEXT_MIMES.includes(file.mime)) {
    return (
      <Notice>
        {`viewer: no renderer for ${file.mime}`}
        {file.src ? ` — the file is at ${file.src}` : ''}
      </Notice>
    )
  }

  // Raw shows the file exactly as `cat` prints it, frontmatter included.
  if (raw || file.mime !== 'text/markdown') {
    return (
      <pre className="p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap text-neutral-300">
        {text}
      </pre>
    )
  }

  return (
    <div className="max-w-[68ch] p-5">
      <Markdown remarkPlugins={[remarkGfm]} components={mdxComponents}>
        {stripMdxComments(stripFrontmatter(text))}
      </Markdown>
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="p-4 font-mono text-xs text-neutral-500">{children}</p>
}
