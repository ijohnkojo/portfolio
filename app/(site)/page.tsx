import Link from 'next/link'

import { EntryList } from '@/components/entry'
import { listEntries } from '@/lib/content'

export default function Home() {
  const projects = listEntries('projects')
  const papers = listEntries('papers')

  return (
    <div className="space-y-14">
      <section className="max-w-[60ch] space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">personal-os</h1>
        <p className="leading-7 text-neutral-700 dark:text-neutral-300">
          A portfolio built as a mock operating system. The kernel knows about
          three things — a filesystem, a process table, and an event bus — and
          everything else is policy layered on top.
        </p>
        <p className="leading-7 text-neutral-700 dark:text-neutral-300">
          Every writeup below has a real URL and is server-rendered. The OS is
          one way to read them, not the only way.
        </p>
        <Link
          href="/os"
          className="inline-block rounded border border-neutral-400 px-4 py-2 font-mono text-sm hover:bg-neutral-900 hover:text-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
        >
          boot →
        </Link>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-widest text-neutral-500 uppercase">
          Projects
        </h2>
        <EntryList entries={projects} />
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-widest text-neutral-500 uppercase">
          Papers
        </h2>
        <EntryList entries={papers} />
      </section>
    </div>
  )
}
