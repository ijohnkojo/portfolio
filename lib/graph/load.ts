/**
 * Reads the graph off disk — the only impure part of `lib/graph/`. Server-only:
 * it goes through `lib/content.ts`, which reads with `node:fs`. The home page
 * calls it during its static render and hands the result, plain data, to the
 * client component — the same shape as `/os` receiving its filesystem.
 *
 * Every validation error in `model.ts` throws from here, so a bad reference
 * fails `pnpm build` naming the file.
 */
import { allEntries, getHomeFile } from '@/lib/content'
import { memo } from '@/lib/memo'
import { SITE_INTRO, SITE_NAME } from '@/lib/site'

import { buildGraph, type GraphData } from './model'

export const GRAPH_FILE = 'graph.json'
const SPEC_PATH = `content/home/${GRAPH_FILE}`

export const loadGraph = memo((): GraphData => {
  const file = getHomeFile(GRAPH_FILE)
  if (!file) throw new Error(`${SPEC_PATH}: missing — the home page's graph is built from it`)

  let spec: unknown
  try {
    spec = JSON.parse(file.raw)
  } catch (error) {
    throw new Error(`${SPEC_PATH}: not valid JSON — ${(error as Error).message}`)
  }

  return buildGraph(spec, allEntries(), {
    centre: { label: SITE_NAME, href: '/about', summary: SITE_INTRO },
    specPath: SPEC_PATH,
  })
})
