/**
 * Verifies the content pipeline's two consumers agree, and that the crawlable
 * half is genuinely crawlable.
 *
 * The load-bearing check is the last one: the same entry must be readable from
 * a route with JavaScript disabled *and* from the OS through kernel.fs.read.
 * One read on disk feeds both (docs/decisions.md D-010), so if they ever
 * disagree the pipeline has forked.
 *
 *   node scripts/verify-content.mjs
 */
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)) {
    try {
      return require(c)
    } catch {}
  }
  const found = execSync(
    'find "$HOME/.npm/_npx" -maxdepth 3 -type d -name playwright 2>/dev/null | head -1',
    { encoding: 'utf8', shell: '/bin/bash' }
  ).trim()
  if (found) return require(found)
  throw new Error('playwright not found — set PLAYWRIGHT_PATH')
}

const { chromium } = loadPlaywright()
const BASE = process.env.BASE_URL ?? 'http://localhost:3111'
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME })

/* ---------------------------------------------- crawlable with JS disabled */

const noJs = await browser.newContext({ javaScriptEnabled: false })
const page = await noJs.newPage()

await page.goto(`${BASE}/projects/project-one`, { waitUntil: 'domcontentloaded' })
const heading = await page.locator('h1').first().textContent()
check('entry page renders without JavaScript', heading?.trim() === 'Project One', `h1=${heading?.trim()}`)
check(
  'MDX body is in the server markup',
  await page.locator('text=elements the component map styles').first().isVisible()
)
check('GFM tables render', (await page.locator('table').count()) > 0)
check(
  'headings get anchor ids from rehype-slug',
  (await page.locator('h2#a-heading').count()) === 1
)

const desc = await page.locator('meta[name="description"]').getAttribute('content')
check('description meta is populated from frontmatter', Boolean(desc), desc ?? 'missing')

await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' })
check('listing page shows published entries', (await page.locator('a[href^="/projects/"]').count()) >= 2)

await page.goto(`${BASE}/papers`, { waitUntil: 'domcontentloaded' })
const draftLinks = await page.locator('a[href="/papers/paper-draft"]').count()
check('drafts are absent from listings', draftLinks === 0)

const draftRes = await page.goto(`${BASE}/papers/paper-draft`, { waitUntil: 'domcontentloaded' })
check('draft route 404s', draftRes.status() === 404, `status=${draftRes.status()}`)

const assetRes = await page.goto(`${BASE}/content/papers/paper-one/figure.txt`)
check('entry assets are served from /public', assetRes.status() === 200, `status=${assetRes.status()}`)

await noJs.close()

/* --------------------------------- the same content, read through the OS */

const withJs = await browser.newContext()
const os = await withJs.newPage()
await os.goto(`${BASE}/os`, { waitUntil: 'networkidle' })

// The kernel stores are module-scoped, not on `window`, so the VFS can only be
// observed through the UI — which is the better test anyway: it exercises the
// real path from app to syscall boundary to filesystem.
//
// The OS boots into a terminal now, so About is launched rather than assumed.
await os.getByRole('button', { name: 'About', exact: true }).click()
const aboutBody = os.locator('text=mechanism, not policy').first()
await aboutBody.waitFor({ state: 'visible', timeout: 10000 })
check('the OS reads /home/about.md through the syscall boundary', await aboutBody.isVisible())

await os.getByRole('button', { name: 'System Info' }).click()
await os.locator('text=vfs nodes').first().waitFor({ state: 'visible', timeout: 10000 })

const rows = await os.locator('table').first().innerText()
const projects = /\/projects\s+(\d+) entries/.exec(rows)
const papers = /\/papers\s+(\d+) entries/.exec(rows)
const apps = /\/apps\s+(\d+) registered/.exec(rows)

check('the OS sees both published projects', projects?.[1] === '2', `/projects = ${projects?.[1]}`)
check(
  'the OS sees drafts the web does not',
  papers?.[1] === '2',
  `/papers = ${papers?.[1]} (paper-one + paper-draft)`
)
// Derived, not hardcoded: the VFS must mirror the registry exactly, whatever
// is registered. A magic number here has gone stale on every app added so far.
const registered = await os.locator('[data-launcher]').count()
check(
  'app nodes under /apps mirror the registry',
  apps?.[1] === String(registered),
  `/apps = ${apps?.[1]}, registry = ${registered}`
)

await os.screenshot({ path: 'scripts/content-verify.png', fullPage: false })
await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
