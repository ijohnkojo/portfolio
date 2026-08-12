import Link from 'next/link'

/**
 * Placeholder landing page. The SSG content routes (/projects/[slug],
 * /papers/[slug]) that make this crawlable are the next phase — the OS is a
 * client for content that has real URLs, not the only way in (design doc §5).
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 font-mono">
      <h1 className="text-lg tracking-wide">personal-os</h1>
      <p className="max-w-md text-center text-sm text-neutral-500">
        A portfolio built as a mock operating system: a kernel that knows only
        about a filesystem, a process table, and an event bus — and everything
        else layered on top as policy.
      </p>
      <Link
        href="/os"
        className="rounded border border-neutral-600 px-4 py-2 text-sm hover:bg-neutral-100 hover:text-neutral-900"
      >
        boot →
      </Link>
    </main>
  )
}
