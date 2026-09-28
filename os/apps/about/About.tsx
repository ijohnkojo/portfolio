'use client'

/**
 * Deliberately thin. Its job this phase is to exercise the syscall boundary for
 * real — it reads its own content through `kernel.fs.read` rather than
 * importing it, so the path from app to VFS is proven rather than assumed.
 *
 * Its manifest declares only `fs.read`; calling `kernel.fs.write` from here
 * throws PermissionDeniedError. The "crash" button below demonstrates that the
 * window's error boundary contains a thrown render.
 */
import { useState } from 'react'
import type { AppProps } from '@/os/registry'

const SOURCE = '/home/about.md'

export default function About({ kernel }: AppProps) {
  const [crashed, setCrashed] = useState(false)
  if (crashed) throw new Error(`unhandled read at ${SOURCE}`)

  const content = kernel.fs.read(SOURCE)

  return (
    <div className="p-5">
      <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-neutral-300">
        {content ?? `cat: ${SOURCE}: No such file or directory`}
      </pre>

      <p className="mt-4 font-mono text-[11px] text-neutral-600">
        read via kernel.fs.read({SOURCE}) — permissions: fs.read
      </p>

      <button
        type="button"
        onClick={() => setCrashed(true)}
        className="mt-3 rounded border border-neutral-700 px-2 py-1 font-mono text-[11px] text-neutral-500 hover:border-red-500/50 hover:text-red-300"
      >
        crash this app
      </button>
    </div>
  )
}
