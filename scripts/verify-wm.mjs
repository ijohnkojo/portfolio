/**
 * End-to-end verification of the window manager, driven against `next dev`.
 *
 * The load-bearing assertion is the drag one: Window logs a commit after every
 * React commit, so a smooth drag must produce zero commits between mousedown
 * and mouseup, and exactly one after. Anything else means geometry is being
 * written to the store mid-gesture.
 *
 *   node scripts/verify-wm.mjs
 */
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Playwright is not a project dependency — this is a verification tool, not a
 * test suite. Resolve it from wherever it happens to live: a local install, an
 * explicit PLAYWRIGHT_PATH, or the npx cache.
 */
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright'].filter(Boolean)
  for (const c of candidates) {
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
  throw new Error(
    'playwright not found — `npx playwright@latest --version` once, or set PLAYWRIGHT_PATH'
  )
}

const { chromium } = loadPlaywright()
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

const URL = process.env.OS_URL ?? 'http://localhost:3111/os'
const results = []

function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const commits = []
const chunkRequests = []
const pageErrors = []

page.on('console', (m) => {
  if (m.text().startsWith('[wm]')) commits.push({ at: Date.now(), text: m.text() })
})
page.on('request', (r) => {
  if (r.url().includes('/_next/static/')) chunkRequests.push(r.url())
})
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle' })

const titlebars = page.locator('.window-titlebar')
/** Mounted frames — since D-013, a minimized window is still one of these. */
const mounted = () => titlebars.count()
/** Frames actually on screen. */
const visible = () => page.locator('.window-titlebar:visible').count()

/* 1 — the OS boots into a shell */
await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })
check('boots into a terminal', (await page.locator('.xterm-screen').count()) === 1)
check('exactly one window open at boot', (await mounted()) === 1, `count=${await mounted()}`)

/* 2 — launching an app pulls its chunk only now */
const chunksBeforeSpawn = chunkRequests.length
// By data-launcher, not by name: the desktop now has an About icon too, and
// that attribute is on the taskbar buttons precisely to tell the roles apart.
await page.locator('[data-launcher="about"]').click()
const aboutBody = page.locator('text=mechanism, not policy').first()
await aboutBody.waitFor({ state: 'visible', timeout: 10000 })
const newChunks = chunkRequests.length - chunksBeforeSpawn

check('about chunk loads on spawn, not at page load', newChunks > 0, `${newChunks} new asset requests`)
check('about window reads its content via kernel.fs.read', await aboutBody.isVisible())
check('two windows open after spawn', (await mounted()) === 2)

/* 3 — the drag-performance contract. About is pid 2, the second frame. */
const about = titlebars.nth(1)
const box = await about.boundingBox()

commits.length = 0
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()

const duringDrag = []
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2 + i * 6)
  await page.waitForTimeout(8)
}
duringDrag.push(...commits)

await page.mouse.up()
await page.waitForTimeout(250)
const afterDrag = commits.length - duringDrag.length

check(
  'zero React commits during a 20-step drag',
  duringDrag.length === 0,
  `${duringDrag.length} commits while dragging`
)
check('drag commits exactly once on mouse-up', afterDrag === 1, `${afterDrag} commits after release`)

/* 4 — scoped selectors: moving window 2 must not re-render window 1 */
const otherWindowCommits = commits.filter((c) => c.text.includes('pid 1 '))
check(
  'dragging one window does not re-render the other',
  otherWindowCommits.length === 0,
  `pid 1 commits during pid 2 drag: ${otherWindowCommits.length}`
)

/* 5 — focus and z-index follow clicks, driven by kernel state */
const zOf = (i) =>
  titlebars.nth(i).evaluate((el) => getComputedStyle(el.closest('[style*="z-index"]')).zIndex)

await titlebars.first().click()
await page.waitForTimeout(120)
check(
  'clicking a window raises it above the other',
  Number(await zOf(0)) > Number(await zOf(1)),
  `focused z=${await zOf(0)}, other z=${await zOf(1)}`
)

/* 6 — minimize hides without unmounting (D-013), and the taskbar restores it */
// The previous check raised the terminal, so About's titlebar is covered —
// bring it forward from the taskbar rather than clicking through another window.
await page.getByRole('button', { name: /^About/ }).last().click()
await page.waitForTimeout(150)
await page.getByRole('button', { name: 'minimize' }).nth(1).click()
await page.waitForTimeout(200)

check('minimize hides the window', (await visible()) === 1, `${await visible()} visible`)
check(
  'minimize does NOT unmount the app (D-013)',
  (await mounted()) === 2,
  `${await mounted()} still mounted`
)

await page.getByRole('button', { name: /^About/ }).last().click()
await page.waitForTimeout(200)
check('taskbar restores a minimized window', (await visible()) === 2)

/* 7 — maximize keeps the app mounted rather than remounting it */
const commitsBeforeMax = commits.length
await page.getByRole('button', { name: 'maximize' }).nth(1).click()
await page.waitForTimeout(250)
const maximizedBox = await titlebars.nth(1).boundingBox()
check(
  'maximize fills the desktop',
  maximizedBox && maximizedBox.width > 1200,
  `titlebar width=${maximizedBox ? Math.round(maximizedBox.width) : 'null'}`
)
check(
  'maximize is a prop change, not an app remount',
  commits.length - commitsBeforeMax <= 3,
  `${commits.length - commitsBeforeMax} commits`
)
await page.getByRole('button', { name: 'restore' }).first().click()
await page.waitForTimeout(200)

/* 8 — a crashing app is contained by its window's error boundary */
await page.getByRole('button', { name: 'crash this app' }).click()
await page.waitForTimeout(300)
check('error boundary catches a thrown render', await page.locator('text=segmentation fault').first().isVisible())
check('the other window survives the crash', (await visible()) === 2)
check('the terminal keeps running through it', (await page.locator('.xterm-screen').count()) === 1)
check('taskbar survives the crash', await page.locator('text=personal-os').first().isVisible())

await page.getByRole('button', { name: 'restart' }).click()
await page.waitForTimeout(300)
check('crashed app restarts in place', await page.locator('text=mechanism, not policy').first().isVisible())

await page.screenshot({ path: 'scripts/os-verify.png' })

/* 9 — nothing blew up along the way */
const realErrors = pageErrors.filter((e) => !e.includes('unhandled read at'))
check('no uncaught page errors', realErrors.length === 0, realErrors.join('; '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
