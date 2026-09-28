import Link from 'next/link'

import { EntryList } from '@/components/entry'
import { GRAPH_COLUMNS } from '@/components/graph/columns'
import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph'
import { Legend } from '@/components/graph/Legend'
import { listEntries } from '@/lib/content'
import { loadGraph } from '@/lib/graph/load'
import { SITE_INTRO, SITE_NAME } from '@/lib/site'

/**
 * The front page: who this is, the work as a graph, and the work as a list.
 *
 * The graph is built here, on the server, from `content/` (D-039) and handed to
 * the client component as plain data. Building it here is also what makes a
 * bad reference in any entry fail `pnpm build`. The listings underneath are
 * the scan-friendly, crawlable way to reach everything — they do not depend on
 * JavaScript or on anything the graph is doing.
 *
 * One wide frame, the same as the header's: the intro and the graph start at
 * its left edge, and the legend and the inspector share its right-hand column
 * (D-048). The listings keep the reading width, left-aligned in the frame.
 * This page sits outside the `(reading)` group, so it can be wider than the
 * text pages (D-043).
 */
export default function Home() {
  const graph = loadGraph()
  const projects = listEntries('projects')
  const papers = listEntries('papers')
  const presentations = listEntries('presentations')

  return (
    <div className="mx-auto w-full max-w-[82rem] space-y-10 px-4 md:px-6">
      {/*
        The intro spans from the graph's left edge; the legend sits beside it,
        over the inspector, in the same two columns as the graph below.
      */}
      <div className={`${GRAPH_COLUMNS} lg:items-start`}>
        {/*
          The ten-second answer: who, what, and a way in. Anyone who wants the
          long version has /about; this section's job is to be readable by
          someone who will not click anything.
        */}
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">{SITE_NAME}</h1>
          <p className="max-w-[60ch] leading-7 text-neutral-700 dark:text-neutral-300">{SITE_INTRO}</p>
          <Link
            href="/about"
            className="inline-block font-mono text-sm text-neutral-500 underline underline-offset-4 hover:text-current"
          >
            about
          </Link>
        </section>
        <Legend />
      </div>

      <section aria-label="The work, as a graph">
        <KnowledgeGraph graph={graph} />
      </section>

      <div className="max-w-3xl space-y-14 pt-4">
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
