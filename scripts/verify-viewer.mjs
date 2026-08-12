/**
 * Verifies the file viewer and the mime→app resolution behind `open`.
 *
 * The interesting assertions are the two that only a browser can settle: that
 * the viewer renders *markdown as markup* rather than as text, and that two
 * viewers open at once show different files — which proves `args` is genuinely
 * per-instance and nothing is leaking through module scope.
 *
 *   node scripts/verify-viewer.mjs
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
const URL = process.env.OS_URL ?? 'http://localhost:3111/os'
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME })
// Light mode on purpose: the OS is always dark, so this is where shared prose
// components would render dark-on-dark if the `dark` class wiring regressed.
const page = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  colorScheme: 'light',
})
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })

async function focusTerminal() {
  await page.locator('.window-titlebar').first().click()
  await page.waitForTimeout(120)
  await page.locator('.xterm-screen').first().click()
  await page.waitForTimeout(80)
}

async function run(line) {
  await focusTerminal()
  await page.keyboard.type(line, { delay: 4 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
}

/* ------------------------------------------------ open a markdown writeup */

await run('open /papers/paper-one/index.mdx')

const viewer = page.locator('.window-titlebar', { hasText: 'index.mdx' })
check('open spawns a viewer titled with the filename', (await viewer.count()) === 1)

// The point of the viewer: markdown as markup, not as text.
const heading = page.locator('h2', { hasText: 'Abstract' })
check('markdown renders as markup, not raw text', (await heading.count()) >= 1)
check(
  'frontmatter is stripped from the rendered view',
  !(await page.locator('text=summary: Placeholder paper').count())
)

const rawToggle = page.getByRole('button', { name: 'raw' }).first()
await rawToggle.click()
await page.waitForTimeout(250)
check(
  'raw shows the file as cat prints it, frontmatter included',
  (await page.locator('text=title: Paper One').count()) >= 1
)
await page.getByRole('button', { name: 'rendered' }).first().click()
await page.waitForTimeout(200)

/* --------------------------------------------- a second file, second copy */

await run('open /projects/project-one/index.mdx')
await page.waitForTimeout(400)

const viewerTitles = await page.locator('.window-titlebar').allInnerTexts()
const openViewers = viewerTitles.filter((t) => t.includes('index.mdx'))
check('a second file opens a second viewer', openViewers.length === 2, `${openViewers.length} viewers`)

// Each instance reads its own args — nothing shared through module scope.
// paper-one's body has an "Abstract" heading; project-one's has "A heading".
const frames = page.locator('.react-draggable')
const frameTexts = []
for (let i = 0; i < (await frames.count()); i++) {
  frameTexts.push(await frames.nth(i).innerText())
}
const viewerBodies = frameTexts.filter((t) => t.includes('index.mdx'))
check(
  'the two viewers show different documents',
  viewerBodies.some((t) => t.includes('Abstract')) &&
    viewerBodies.some((t) => t.includes('A heading')),
  `${viewerBodies.length} viewer bodies inspected`
)

/* --------------------------------------------------- asset-backed by src */

await run('open /papers/paper-one/figure.txt')
await page.waitForTimeout(700)
check(
  'an asset-backed file is fetched from src and rendered',
  (await page.locator('text=Placeholder asset').count()) >= 1
)

/* ------------------------------------------------------------------ PDF */

await run('open /papers/paper-one/paper.pdf')
await page.waitForTimeout(900)
const embed = page.locator('embed[type="application/pdf"]')
check('a PDF renders through <embed>', (await embed.count()) === 1)
check(
  'the embed points at the mirrored asset',
  (await embed.first().getAttribute('src')) === '/content/papers/paper-one/paper.pdf'
)

/* --------------------------------------------------- readability in light */

// Resolve through a canvas: Tailwind v4 emits lab()/oklch(), so parsing the
// computed string directly would be guessing at the colour space.
const rgb = await page
  .locator('p')
  .filter({ hasText: 'Placeholder body' })
  .first()
  .evaluate((el) => {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = getComputedStyle(el).color
    ctx.fillRect(0, 0, 1, 1)
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
  })
  .catch(() => null)

const brightness = rgb ? (rgb[0] + rgb[1] + rgb[2]) / 3 : null
check(
  'prose stays readable on the dark surface in light mode',
  brightness !== null && brightness > 120,
  `rgb(${rgb}) brightness=${brightness?.toFixed(0)}`
)

await page.screenshot({ path: 'scripts/viewer-verify.png' })
check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
