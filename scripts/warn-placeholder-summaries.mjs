/**
 * Warns — without failing — when a published entry still carries a placeholder
 * summary, one starting with "DRAFT". The summary is the listing subtitle, the
 * meta description and the graph inspector's first line, so a placeholder
 * there is the most visible unfinished thing on the site.
 *
 * Runs from `prebuild`, once, rather than inside lib/content.ts: `next build`
 * renders pages in several worker processes, and each would print its own copy.
 *
 * Non-fatal by choice (docs/plans/2026-09-27-graph-home.md, answer 3). To make
 * it an error at launch, exit non-zero when `found` is not empty.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import matter from 'gray-matter'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')
const COLLECTIONS = ['projects', 'papers', 'presentations']

const found = []
for (const collection of COLLECTIONS) {
  const dir = path.join(CONTENT, collection)
  if (!fs.existsSync(dir)) continue
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, 'index.mdx')
    if (!fs.existsSync(file)) continue
    const { data } = matter(fs.readFileSync(file, 'utf8'))
    if (data.draft === true) continue
    if (typeof data.summary === 'string' && /^\s*DRAFT\b/.test(data.summary)) {
      found.push(path.relative(ROOT, file))
    }
  }
}

if (found.length > 0) {
  console.warn(
    `⚠ ${found.length} published ${found.length === 1 ? 'entry has' : 'entries have'} a placeholder summary (starts with "DRAFT"):`
  )
  for (const f of found.sort()) console.warn(`    ${f}`)
  console.warn('  Not fatal — the build continues. See docs/authoring.md.')
}
