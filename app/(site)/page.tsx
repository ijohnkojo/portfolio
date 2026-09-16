import Link from 'next/link'

import { EntryList } from '@/components/entry'
import { listEntries } from '@/lib/content'

export default function Home() {
  const projects = listEntries('projects')
  const papers = listEntries('papers')
  const presentations = listEntries('presentations')

  return (
    <div className="space-y-14">
      {/*
        The ten-second answer: who, what, and a way in. Anyone who wants the
        long version has /about and the OS itself; this section's job is to be
        readable by someone who will not click anything.
      */}
      <section className="max-w-[60ch] space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Michael Noamesi</h1>
        {/*
          PLACEHOLDER — rewrite in your own words. Deliberately flat and
          factual rather than polished, so there is nothing here worth keeping
          by accident. Two or three sentences is the right length.
        */}
        <p className="leading-7 text-neutral-700 dark:text-neutral-300">
          Physics and computer science at Gettysburg College. I work on
          software for experimental particle physics.
        </p>
        <p className="leading-7 text-neutral-700 dark:text-neutral-300">
          This site is a mock operating system. Everything below is also a real
          URL, server-rendered — the OS is one way to read it, not the only
          one.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/os"
            className="inline-block rounded border border-neutral-400 px-4 py-2 font-mono text-sm hover:bg-neutral-900 hover:text-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-100 dark:hover:text-neutral-900"
          >
            boot →
          </Link>
          <Link
            href="/about"
            className="font-mono text-sm text-neutral-500 underline underline-offset-4 hover:text-current"
          >
            about
          </Link>
        </div>
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

      <section>
        <h2 className="mb-2 font-mono text-xs tracking-widest text-neutral-500 uppercase">
          Talks &amp; posters
        </h2>
        <EntryList entries={presentations} />
      </section>
    </div>
  )
}
