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
  // Windows overlap, so clicking the titlebar can hit whatever is on top.
  // Raise via the taskbar first, but only if it isn't already focused — that
  // button toggles, and would minimize a focused terminal.
  const frame = page.locator('[data-app="terminal"]').first()
  if ((await frame.getAttribute('data-focused')) !== 'true') {
    await page.getByRole('button', { name: /^Terminal/ }).last().click()
    await page.waitForTimeout(150)
  }
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

await run('open /home/readme.md')

const viewer = page.locator('.window-titlebar', { hasText: 'readme.md' })
check('open spawns a viewer titled with the filename', (await viewer.count()) === 1)

// The point of the viewer: markdown as markup, not as text.
check('markdown renders as markup, not raw text', (await page.locator('h2').count()) >= 1)
check('GFM tables render in the viewer', (await page.locator('table').count()) >= 1)

const rawToggle = page.getByRole('button', { name: 'raw' }).first()
await rawToggle.click()
await page.waitForTimeout(250)
check(
  'raw shows the file as cat prints it, markup unrendered',
  (await page.locator('pre', { hasText: '# Getting around' }).count()) >= 1
)
await page.getByRole('button', { name: 'rendered' }).first().click()
await page.waitForTimeout(200)

/* --------------------------------------------- a second file, second copy */

await run('open /home/about.md')
await page.waitForTimeout(400)

const viewerTitles = await page.locator('.window-titlebar').allInnerTexts()
const openViewers = viewerTitles.filter((t) => t.includes('.md'))
check('a second file opens a second viewer', openViewers.length >= 2, `${openViewers.length} viewers`)

// Each instance reads its own args — nothing shared through module scope.
const frames = page.locator('.react-draggable')
const frameTexts = []
for (let i = 0; i < (await frames.count()); i++) {
  frameTexts.push(await frames.nth(i).innerText())
}
const viewerBodies = frameTexts.filter((t) => t.includes('.md'))
check(
  'the two viewers show different documents',
  viewerBodies.some((t) => t.includes('Getting around')) &&
    viewerBodies.some((t) => !t.includes('Getting around')),
  `${viewerBodies.length} viewer bodies inspected`
)

/* --------------------------------------------------- asset-backed by src */

// Asset-backed rendering activates once a writeup carries a non-text file.
const assetPath = process.env.ASSET_VFS_PATH
if (assetPath) {
  await run(`open ${assetPath}`)
  await page.waitForTimeout(700)
  check('an asset-backed file is fetched from src', (await page.locator('embed, img').count()) >= 1)
} else {
  console.log('SKIP  asset-backed rendering — no entry carries an asset yet.')
}

/* ------------------------------------------------------------------ PDF */

// Same: activates when a PDF lands in the content tree.
const pdfPath = process.env.PDF_VFS_PATH
if (pdfPath) {
  await run(`open ${pdfPath}`)
  await page.waitForTimeout(900)
  const embed = page.locator('embed[type="application/pdf"]')
  check('a PDF renders through <embed>', (await embed.count()) === 1)
  check('the embed points at the mirrored asset', Boolean(await embed.first().getAttribute('src')))
} else {
  console.log('SKIP  PDF rendering — no PDF in the content tree yet.')
}

/* --------------------------------------------------- readability in light */

// Resolve through a canvas: Tailwind v4 emits lab()/oklch(), so parsing the
// computed string directly would be guessing at the colour space.
const rgb = await page
  .locator('p')
  .filter({ hasText: 'This filesystem is real' })
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
