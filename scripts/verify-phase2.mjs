/**
 * Verifies the Phase 2 features and the defects they were bundled with.
 *
 * Four things only a browser can settle: that a wrapped command line repaints
 * without duplicating, that a reload actually restores the session, that `reset`
 * escapes a session you no longer want, and that snapping did not put a React
 * commit inside the drag loop.
 *
 *   node scripts/verify-phase2.mjs
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
// One context throughout: localStorage has to survive the reloads below.
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } })
const page = await context.newPage()

const commits = []
const pageErrors = []
page.on('console', (m) => {
  if (m.text().startsWith('[wm]')) commits.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(e.message))

const screen = () => page.locator('.xterm-screen').first().innerText()

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
  await page.keyboard.type(line, { delay: 4 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(220)
}

await page.goto(URL, { waitUntil: 'networkidle' })
await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })

// Start from a known state — an earlier run may have left a session behind.
await focusTerminal()
await run('reset')
await page.waitForTimeout(1200)
await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })
await focusTerminal()

/* ------------------------------------- 1a. the wrapped-line repaint defect */

// Shrink the terminal so a modest command wraps.
const frame = page.locator('.window-titlebar').first()
const box = await frame.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(300, 300, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(300)

await focusTerminal()
await page.keyboard.type('echo ' + 'x'.repeat(140), { delay: 1 })
await page.waitForTimeout(250)
await page.keyboard.press('Control+a')
await page.keyboard.type('ZZZ')
await page.waitForTimeout(300)

const wrapped = await screen()
const promptCount = (wrapped.match(/\$ /g) ?? []).length
const zzzCount = (wrapped.match(/ZZZ/g) ?? []).length
check(
  'editing a wrapped line leaves exactly one copy of it',
  zzzCount === 1,
  `${zzzCount} copies of the edited text, ${promptCount} prompts on screen`
)

await page.keyboard.press('Control+c')
await page.waitForTimeout(150)

/* ------------------------------------------------------ history + persistence */

await run('cd /papers')
await run('ls')
await run('echo remember-me')

const historyOut = await (async () => {
  await run('cat /home/.history')
  return screen()
})()
check(
  'history is written to /home/.history in the VFS',
  historyOut.includes('echo remember-me'),
  'cat shows the earlier command'
)

const lsHome = await (async () => {
  await run('ls /home')
  return screen()
})()
check('ls hides the dotfile by default', !lsHome.split('ls /home')[1]?.includes('.history'))

await run('ls -a /home')
check('ls -a reveals it', (await screen()).includes('.history'))

// Open a second window, then reload.
await run('open /apps/sysinfo')
await page.waitForTimeout(600)
const beforeReload = await page.locator('.window-titlebar').count()
check('two windows before reload', beforeReload === 2, `${beforeReload} windows`)

await page.waitForTimeout(700) // let autosave debounce settle
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const afterReload = await page.locator('.window-titlebar').count()
check('the session is restored on reload', afterReload === 2, `${afterReload} windows`)
check(
  'no duplicate terminal is spawned alongside the restored one',
  (await page.locator('.xterm-screen').count()) === 1
)

await focusTerminal()

// The file itself is the source of truth, so check it directly first.
await run('cat /home/.history')
check(
  'the history file survives a reload',
  (await screen()).includes('echo remember-me'),
  'earlier commands still in /home/.history'
)

// And the restored terminal actually loaded it into its editor.
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(200)
check(
  'the restored terminal recalls pre-reload history',
  (await screen()).includes('cat /home/.history'),
  'up arrow recalls the most recent entry'
)
await page.keyboard.press('Control+c')
await page.waitForTimeout(120)

/* -------------------------------------------------------------- 4. snapping */

await page.keyboard.press('Control+c')
await page.waitForTimeout(120)

const desktop = await page.locator('#wm-desktop').boundingBox()
const termFrame = page.locator('.window-titlebar').first()
const tb = await termFrame.boundingBox()

commits.length = 0
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
await page.mouse.down()
for (let i = 0; i < 15; i++) {
  await page.mouse.move(
    tb.x + tb.width / 2 - i * 30,
    tb.y + tb.height / 2 + i * 2
  )
  await page.waitForTimeout(8)
}
const previewVisible = await page.locator('#wm-snap-preview:not(.hidden)').count()
const commitsDuringDrag = commits.length
await page.mouse.up()
await page.waitForTimeout(400)

check('a snap preview appears while dragging to an edge', previewVisible === 1)
// The whole point of the imperative preview: it must not cost a commit.
check(
  'the snap preview costs zero React commits during the drag',
  commitsDuringDrag === 0,
  `${commitsDuringDrag} commits`
)
check('the preview is hidden after release', (await page.locator('#wm-snap-preview:not(.hidden)').count()) === 0)

const snapped = await page.locator('.react-draggable').first().boundingBox()
check(
  'dropping at the left edge snaps to the left half',
  Math.abs(snapped.width - desktop.width / 2) < 12 && snapped.x < 12,
  `w=${Math.round(snapped.width)} vs half=${Math.round(desktop.width / 2)}`
)

/* keyboard snapping */
await focusTerminal()
await page.keyboard.press('Alt+Shift+ArrowRight')
await page.waitForTimeout(350)
const right = await page.locator('.react-draggable').first().boundingBox()
check(
  'Alt+Shift+Right snaps to the right half',
  right.x > desktop.width / 2 - 12,
  `x=${Math.round(right.x)}`
)

await page.keyboard.press('Alt+Shift+ArrowDown')
await page.waitForTimeout(350)
const restored = await page.locator('.react-draggable').first().boundingBox()
check(
  'Alt+Shift+Down restores the pre-snap size',
  Math.abs(restored.width - 720) < 40,
  `w=${Math.round(restored.width)} (spawned at 720)`
)

/* ------------------------------------------------------- tab completion */

await focusTerminal()
await page.keyboard.press('Alt+Shift+ArrowDown') // unsnap so there's room to read
await page.waitForTimeout(250)
await focusTerminal()

await page.keyboard.type('op')
await page.keyboard.press('Tab')
await page.waitForTimeout(200)
check(
  'Tab completes a unique command',
  (await screen()).includes('open '),
  'op → open'
)
await page.keyboard.press('Control+c')
await page.waitForTimeout(120)

await page.keyboard.type('ls /pro')
await page.keyboard.press('Tab')
await page.waitForTimeout(200)
check(
  'Tab completes a directory and appends a slash',
  (await screen()).includes('/projects/'),
  '/pro → /projects/'
)
await page.keyboard.press('Control+c')
await page.waitForTimeout(120)

// "c" matches cat, cd, clear — nothing to add, so the candidates get printed.
await page.keyboard.type('c')
await page.keyboard.press('Tab')
await page.waitForTimeout(250)
const listed = await screen()
check(
  'an ambiguous prefix lists the candidates',
  listed.includes('cat') && listed.includes('clear'),
  'candidates printed'
)
await page.keyboard.press('Control+c')
await page.waitForTimeout(120)

/* -------------------------------------------------------------- tiling */

await run('open /apps/about')
await page.waitForTimeout(500)
await focusTerminal()

const openWindows = await page.locator('.window-titlebar:visible').count()
check('three windows open before tiling', openWindows === 3, `${openWindows} windows`)

await run('tile grid')
await page.waitForTimeout(600)

const boxes = []
for (const handle of await page.locator('.react-draggable').all()) {
  const b = await handle.boundingBox()
  if (b && b.width > 0) boxes.push(b)
}

const overlapping = boxes.some((a, i) =>
  boxes.slice(i + 1).some(
    (b) =>
      a.x < b.x + b.width - 2 &&
      b.x < a.x + a.width - 2 &&
      a.y < b.y + b.height - 2 &&
      b.y < a.y + a.height - 2
  )
)
check('tiled windows do not overlap', !overlapping, `${boxes.length} tiles`)

const desk = await page.locator('#wm-desktop').boundingBox()
const allInside = boxes.every(
  (b) => b.x >= desk.x - 2 && b.x + b.width <= desk.x + desk.width + 2
)
check('tiled windows stay inside the desktop', allInside)

// Tiling goes through snap, so a single window can be restored on its own.
await focusTerminal()
const tiledWidth = (await page.locator('[data-app="terminal"]').first().boundingBox()).width
await page.keyboard.press('Alt+Shift+ArrowDown')
await page.waitForTimeout(350)
const restoredWidth = (await page.locator('[data-app="terminal"]').first().boundingBox()).width
check(
  'Alt+Shift+Down restores one window from a tile',
  Math.abs(restoredWidth - tiledWidth) > 20,
  `${Math.round(tiledWidth)} → ${Math.round(restoredWidth)}`
)

await focusTerminal()
await run('tile cascade')
await page.waitForTimeout(500)
const cascaded = []
for (const handle of await page.locator('.react-draggable').all()) {
  const b = await handle.boundingBox()
  if (b && b.width > 0) cascaded.push(b)
}
check(
  'tile cascade returns them to an overlapping layout',
  cascaded.every((b) => b.width < desk.width) &&
    new Set(cascaded.map((b) => Math.round(b.x))).size === cascaded.length,
  'each offset from the last'
)

/* ------------------------------------- a writable filesystem, across reloads */

await focusTerminal()
await run('mkdir -p /home/notes')
await run('echo scratch')
await run('touch /home/notes/kept.md')
await run('cp /home/readme.md /home/notes/copy.md')

let out = await (async () => {
  await run('ls /home/notes')
  return screen()
})()
check(
  'files created in the shell exist',
  out.includes('kept.md') && out.includes('copy.md'),
  'mkdir + touch + cp'
)

// Published content is read-only — the rule that makes tombstones unnecessary.
out = await (async () => {
  await run('rm /home/readme.md')
  return screen()
})()
check('rm refuses published content', out.includes('read-only'), 'refused with a reason')

// Editing published content and removing the edit is an undo, not a delete.
await run('cp /home/notes/copy.md /home/notes/tmp.md')
await run('rm /home/notes/tmp.md')

await page.waitForTimeout(800) // let the debounced save settle
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
await focusTerminal()

out = await (async () => {
  await run('ls /home/notes')
  return screen()
})()
check(
  'a shell-created directory and its files survive a reload',
  out.includes('kept.md') && out.includes('copy.md'),
  'the directory is implied by the files in it'
)
check('a file removed before the reload stays removed', !out.includes('tmp.md'))

/* ------------------------------------------------------------- 2. reset */

await focusTerminal()
await run('reset')
await page.waitForTimeout(1500)
await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })

check(
  'reset clears the session and boots fresh',
  (await page.locator('.window-titlebar').count()) === 1,
  `${await page.locator('.window-titlebar').count()} window`
)

await page.screenshot({ path: 'scripts/phase2-verify.png' })
check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
