/**
 * Drives the desktop in real Chrome.
 *
 * The pure modules cover layout, icon resolution and the positions file in bare
 * node. This covers what they cannot: that the icons are wired to the VFS in
 * both directions, that opening one spawns the right app, and above all that
 * **dragging an icon does not put a React commit inside the pointermove loop**
 * (docs/decisions.md D-031, which is D-002 extended to a second surface).
 *
 *   node scripts/verify-desktop.mjs
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
// One context throughout: the reload check needs localStorage to survive.
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } })
const page = await context.newPage()

const commits = []
const pageErrors = []
page.on('console', (m) => {
  if (m.text().startsWith('[desktop]')) commits.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.locator('[data-desktop-icon]').first().waitFor({ state: 'visible', timeout: 15000 })

const icon = (name) => page.locator(`[data-desktop-icon="${name}"]`)
const iconNames = () =>
  page.locator('[data-desktop-icon]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-desktop-icon'))
  )

/**
 * Get the windows out of the way.
 *
 * Opening an app from an icon puts a window over the icon that opened it, so
 * every later click would land on the app instead. Minimizing rather than
 * closing keeps the process table interesting for the focus checks.
 */
async function minimizeAll() {
  const bars = page.locator('.window-titlebar:visible')

  for (let open = await bars.count(); open > 0; ) {
    await bars.first().getByRole('button', { name: 'minimize' }).click()
    await page.waitForTimeout(120)

    const remaining = await bars.count()
    if (remaining >= open) break // no progress; better than looping forever
    open = remaining
  }
}

/** Type into the boot terminal, restoring it first if something minimized it. */
async function run(line) {
  const frame = page.locator('[data-app="terminal"]').first()
  if ((await frame.getAttribute('data-focused')) !== 'true') {
    await page.getByRole('button', { name: /^Terminal/ }).last().click()
    await page.waitForTimeout(200)
  }
  await page.locator('.xterm-screen').first().click()
  await page.keyboard.type(line, { delay: 4 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  return page.locator('.xterm-screen').first().innerText()
}

/* ------------------------------------------------------------ the surface */

const seeded = await iconNames()
check(
  'the seeded applications appear as icons',
  ['terminal', 'about', 'sysinfo'].every((id) => seeded.includes(id)),
  seeded.join(', ')
)

check(
  'an icon is labelled with its manifest name, not its lowercase node name',
  (await icon('sysinfo').innerText()).includes('System Info')
)

check(
  'dotfiles are hidden, as ls hides them',
  !(await iconNames()).includes('.positions')
)

/* -------------------------------------------- the desktop is a VFS directory */

check(
  '/desktop is a real directory the shell can see',
  (await run('ls /desktop')).includes('terminal*'),
  'ls /desktop lists the app nodes'
)

// The point of D-030: no icon registry to keep in sync, because there is only
// the filesystem.
await run('cp /home/readme.md /desktop')
await page.waitForTimeout(300)
check(
  'a file copied in from the shell becomes an icon',
  (await iconNames()).includes('readme.md'),
  'cp /home/readme.md /desktop'
)

/* ------------------------------------------------ D-031: the drag contract */

// Before anything is opened, so no window is sitting over the icons.
await minimizeAll()

await icon('about').click()
check('clicking an icon selects it', (await icon('about').getAttribute('data-selected')) === 'true')

const box = await icon('about').boundingBox()
const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
const to = { x: from.x + 360, y: from.y + 240 }

await page.mouse.move(from.x, from.y)
await page.mouse.down()
commits.length = 0

for (let i = 1; i <= 15; i++) {
  await page.mouse.move(
    from.x + ((to.x - from.x) * i) / 15,
    from.y + ((to.y - from.y) * i) / 15
  )
}
const duringDrag = commits.length

await page.mouse.up()
await page.waitForTimeout(300)

check(
  'dragging an icon commits nothing — position is imperative until the drop',
  duringDrag === 0,
  `${duringDrag} commits across 15 pointer moves`
)
check(
  'the drop does commit, so the move is real state',
  commits.length > 0,
  `${commits.length} after mouse-up`
)

const moved = await icon('about').evaluate((el) => ({ left: el.style.left, top: el.style.top }))
check(
  'the icon is where it was dropped',
  parseInt(moved.left, 10) > 200 && parseInt(moved.top, 10) > 100,
  `${moved.left} / ${moved.top}`
)

check(
  'positions are a real file, so cat reaches them',
  (await run('cat /desktop/.positions')).includes('about'),
  '/desktop/.positions'
)

/* ---------------------------------------------------------------- opening */

await minimizeAll()
const windowsBefore = await page.locator('.window-titlebar:visible').count()
await icon('sysinfo').dblclick()
await page.waitForTimeout(600)
const windowsAfter = await page.locator('.window-titlebar:visible').count()
check(
  'double-clicking an application icon spawns it',
  windowsAfter === windowsBefore + 1,
  `${windowsBefore} → ${windowsAfter} visible`
)

const totalAfterSpawn = await page.locator('.window-titlebar').count()
await minimizeAll()
await icon('sysinfo').dblclick()
await page.waitForTimeout(500)
check(
  'double-clicking it again focuses the running one rather than spawning a second',
  (await page.locator('.window-titlebar').count()) === totalAfterSpawn,
  'and restores it from minimized'
)

await minimizeAll()
const viewersBefore = await page.locator('[data-app="viewer"]').count()
await icon('readme.md').dblclick()
await page.waitForTimeout(700)
check(
  'double-clicking a file opens it in whatever declared its mime type',
  (await page.locator('[data-app="viewer"]').count()) === viewersBefore + 1,
  'markdown → viewer'
)

/* ------------------------------------------------------------------ Files */

await minimizeAll()
await run('mkdir /desktop/scratch')
await page.waitForTimeout(300)
await minimizeAll()

// The interaction the desktop had no answer for until Files existed.
await icon('scratch').dblclick()
await page.waitForTimeout(800)
const filesWindow = page.locator('[data-app="files"]').first()
check(
  'double-clicking a folder opens Files, pointed at it',
  (await filesWindow.count()) === 1 &&
    (await filesWindow.locator('nav').innerText()).includes('scratch'),
  'the desktop hands directories to Files'
)

const entries = () =>
  filesWindow.locator('[data-entry]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-entry'))
  )

await filesWindow.getByRole('button', { name: 'up' }).click()
await page.waitForTimeout(300)
await filesWindow.getByRole('button', { name: 'up' }).click()
await page.waitForTimeout(300)
check(
  'Files walks the same tree the shell does',
  (await entries()).includes('papers') && (await entries()).includes('home'),
  (await entries()).join(', ')
)

await filesWindow.locator('[data-entry="papers"]').dblclick()
await page.waitForTimeout(400)
const inPapers = await entries()
check('descending into a directory lists it', inPapers.length > 0, inPapers.join(', '))

await filesWindow.getByRole('button', { name: 'back' }).click()
await page.waitForTimeout(300)
check(
  'back returns to where it came from',
  (await filesWindow.locator('nav').innerText()).trim().endsWith('/'),
  'at the root again'
)

// The desktop and Files get no privileges the shell lacks (D-027).
await filesWindow.locator('[data-entry="home"]').dblclick()
await page.waitForTimeout(400)
await filesWindow.locator('[data-entry="readme.md"]').click()
await filesWindow.getByRole('button', { name: 'delete' }).click()
await page.waitForTimeout(300)
check(
  'deleting published content is refused, in the words rm uses',
  (await filesWindow.innerText()).includes('read-only, part of the published content')
)

const beforeFilesOpen = await page.locator('[data-app="viewer"]').count()
await filesWindow.locator('[data-entry="readme.md"]').dblclick()
await page.waitForTimeout(800)
check(
  'double-clicking a file in Files opens its handler',
  (await page.locator('[data-app="viewer"]').count()) === beforeFilesOpen + 1
)

/* ---------------------------------------------------------------- reload */

await page.reload({ waitUntil: 'networkidle' })
await page.locator('[data-desktop-icon]').first().waitFor({ state: 'visible', timeout: 15000 })
await page.waitForTimeout(600)

const after = await icon('about').evaluate((el) => ({ left: el.style.left, top: el.style.top }))
check(
  'the arrangement survives a reload',
  after.left === moved.left && after.top === moved.top,
  `${after.left} / ${after.top}`
)

check(
  'a file copied to the desktop survives too',
  (await iconNames()).includes('readme.md')
)

await page.screenshot({ path: 'scripts/desktop-verify.png' })

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
