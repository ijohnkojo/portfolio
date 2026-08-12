/**
 * Parses every ```mermaid block in the repo's markdown and reports the ones
 * that don't. A broken diagram renders as an error box on GitHub rather than
 * failing loudly, so it tends to survive until someone else reads the doc.
 *
 *   node scripts/check-diagrams.mjs
 *
 * Neither Playwright nor mermaid is a project dependency (see docs/decisions.md
 * D-009) — mermaid loads from a CDN into the page, Playwright is resolved from
 * wherever it happens to live. If neither is available the check skips rather
 * than failing, so it never blocks work offline.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['node_modules', '.next', '.git'])
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'

/* ------------------------------------------------------------------ collect */

const blocks = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(p)
      continue
    }
    if (!entry.name.endsWith('.md')) continue

    const src = fs.readFileSync(p, 'utf8')
    const re = /```mermaid\n([\s\S]*?)```/g
    let m
    while ((m = re.exec(src))) {
      blocks.push({
        file: path.relative(ROOT, p),
        line: src.slice(0, m.index).split('\n').length,
        code: m[1],
      })
    }
  }
})(ROOT)

if (blocks.length === 0) {
  console.log('no mermaid diagrams found')
  process.exit(0)
}

/* ------------------------------------------------------------------ resolve */

function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) {
    try {
      return require(c)
    } catch {}
  }
  try {
    const found = execSync(
      'find "$HOME/.npm/_npx" -maxdepth 3 -type d -name playwright 2>/dev/null | head -1',
      { encoding: 'utf8', shell: '/bin/bash' }
    ).trim()
    if (found) return require(found)
  } catch {}
  return null
}

const pw = loadPlaywright()
if (!pw) {
  console.log(
    `skipped — playwright not found (${blocks.length} diagrams unchecked).\n` +
      'Run `npx playwright@latest --version` once, or set PLAYWRIGHT_PATH.'
  )
  process.exit(0)
}

/* ----------------------------------------------------------------- validate */

const browser = await pw.chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
})
const page = await browser.newPage()
await page.setContent('<!doctype html><body></body>')

try {
  if (process.env.MERMAID_PATH) await page.addScriptTag({ path: process.env.MERMAID_PATH })
  else await page.addScriptTag({ url: MERMAID_CDN })
} catch {
  await browser.close()
  console.log(
    `skipped — could not load mermaid (${blocks.length} diagrams unchecked).\n` +
      'Needs network, or set MERMAID_PATH to a local mermaid.min.js.'
  )
  process.exit(0)
}

let failed = 0
for (const b of blocks) {
  const error = await page.evaluate(async (code) => {
    try {
      window.mermaid.initialize({ startOnLoad: false })
      await window.mermaid.parse(code)
      return null
    } catch (e) {
      return String(e?.message ?? e)
    }
  }, b.code)

  const kind = b.code.trim().split('\n')[0]
  if (error) {
    failed++
    console.log(`FAIL  ${b.file}:${b.line}  (${kind})`)
    console.log(`      ${error.split('\n').join('\n      ')}`)
  } else {
    console.log(`ok    ${b.file}:${b.line}  (${kind})`)
  }
}

await browser.close()
console.log(`\n${blocks.length - failed}/${blocks.length} diagrams parse`)
process.exit(failed === 0 ? 0 : 1)
