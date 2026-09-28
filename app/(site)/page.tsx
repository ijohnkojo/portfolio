import Link from 'next/link'

import { EntryList } from '@/components/entry'
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph'
import { listEntries } from '@/lib/content'
import { loadGraph } from '@/lib/graph/load'

/**
 * The front page: who this is, the work as a graph, and the work as a list.
 *
 * The graph is built here, on the server, from `content/` (D-039) and handed to
 * the client component as plain data. Building it here is also what makes a
 * bad reference in any entry fail `pnpm build`. The listings underneath are
 * the scan-friendly, crawlable way to reach everything — they do not depend on
 * JavaScript or on anything the graph is doing.
 *
 * Widths are set per section: this page sits outside the `(reading)` group, so
 * the graph can be wider than the text around it (D-043).
 */
export default function Home() {
  const graph = loadGraph()
  const projects = listEntries('projects')
  const papers = listEntries('papers')
  const presentations = listEntries('presentations')

  return (
    <div className="space-y-14">
      {/*
        The ten-second answer: who, what, and a way in. Anyone who wants the
        long version has /about; this section's job is to be readable by
        someone who will not click anything.
      */}
      <section className="mx-auto w-full max-w-3xl space-y-4 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Michael Noamesi</h1>
        {/*
          PLACEHOLDER — rewrite in your own words. Deliberately flat and
          factual rather than polished, so there is nothing here worth keeping
          by accident. Two or three sentences is the right length.
        */}
        <p className="max-w-[60ch] leading-7 text-neutral-700 dark:text-neutral-300">
          Physics and computer science at Gettysburg College. I work on
          software for experimental particle physics.
        </p>
        {/*
          PLACEHOLDER — this paragraph describes the old framing, when the site
          *was* a mock operating system. The site is now this graph of the work,
          with the OS as one project on it (D-037). Rewrite or remove. The
          second sentence still holds: everything is also a real URL.
        */}
        <p className="max-w-[60ch] leading-7 text-neutral-700 dark:text-neutral-300">
          This site is a mock operating system. Everything below is also a real
          URL, server-rendered — the OS is one way to read it, not the only
          one.
        </p>
        <Link
          href="/about"
          className="inline-block font-mono text-sm text-neutral-500 underline underline-offset-4 hover:text-current"
        >
          about
        </Link>
      </section>

      <section aria-label="The work, as a graph" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <KnowledgeGraph graph={graph} />
      </section>

      <div className="mx-auto w-full max-w-3xl space-y-14 px-6">
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
    </div>
  )
}
