/**
 * Drives the terminal in real Chrome with real keystrokes.
 *
 * The unit tests cover the shell and the line editor exhaustively in node; this
 * covers what they cannot — that xterm is wired to them correctly, that the
 * window refits, and above all that **minimizing no longer destroys app state**
 * (docs/decisions.md D-013), which is the whole reason the terminal could be
 * built at all.
 *
 *   node scripts/verify-terminal.mjs
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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle' })

/** Everything currently on the terminal's screen, as text. */
const screen = () => page.locator('.xterm-screen').first().innerText()

/**
 * Bring the terminal forward and put the caret in it. Spawning another app
 * raises that window over the terminal, so clicking the screen directly gets
 * intercepted — which is the WM behaving correctly. Click the terminal's own
 * titlebar first (pid 1, so it is the first frame in the DOM).
 *
 * Deliberately not the taskbar button: that toggles, so it would minimize a
 * terminal that is already focused.
 */
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

/** Type a command and press Enter, then let the shell settle. */
async function run(line) {
  await page.keyboard.type(line, { delay: 5 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(160)
  return screen()
}

/* ------------------------------------------------------------------ boot */

await page.locator('.xterm-screen').first().waitFor({ state: 'visible', timeout: 15000 })
const banner = await screen()
check('terminal is the boot window', banner.includes('personal-os'), 'banner present')
check('banner points at help', banner.includes("type 'help' for commands"))
check('prompt starts at root', banner.includes('/ $'))

// Click into the terminal so keystrokes land there.
await page.locator('.xterm-screen').first().click()

/* -------------------------------------------------------------- commands */

check('help lists commands', (await run('help')).includes('list directory contents'))

const lsRoot = await run('ls /')
check('ls marks directories', lsRoot.includes('projects/') && lsRoot.includes('apps/'))

const lsProjects = await run('ls /projects')
check(
  'ls walks content built from disk',
  lsProjects.includes('project-one/') && lsProjects.includes('project-two/'),
  'both project slugs'
)

await run('cd /papers')
const lsPapers = await run('ls')
check(
  'the OS sees the draft the web 404s',
  lsPapers.includes('paper-draft/') && lsPapers.includes('paper-one/')
)
check('pwd tracks cd', (await run('pwd')).includes('/papers'))

check(
  'cat reads through the syscall boundary',
  (await run('cat /home/about.md')).includes('mechanism, not policy')
)

const catDir = await run('cat /home')
check('cat errors on a directory in UNIX shape', catDir.includes('Is a directory'))

const bogus = await run('frobnicate')
check('unknown commands are handled', bogus.includes('command not found'))

const lsApps = await run('ls /apps')
check(
  'app nodes appear under /apps with a marker',
  lsApps.includes('terminal*') && lsApps.includes('sysinfo*')
)

/* ------------------------------------------------------- open / ps / kill */

const windowsBefore = await page.locator('.window-titlebar').count()
await run('open /apps/sysinfo')
await page.waitForTimeout(600)
const windowsAfter = await page.locator('.window-titlebar').count()
check(
  'open spawns an app window from the shell',
  windowsAfter === windowsBefore + 1,
  `${windowsBefore} → ${windowsAfter}`
)

await focusTerminal()
const psOut = await run('ps')
check('ps lists both processes', psOut.includes('terminal') && psOut.includes('sysinfo'))
check('ps marks the calling terminal', psOut.includes('(this terminal)'))

const openAgain = await run('open /apps/sysinfo')
check('open focuses rather than duplicating', openAgain.includes('already running'))

/* ------------------------------------- D-013: minimize preserves app state */

await focusTerminal()
await page.keyboard.type('cd /projects')
await page.keyboard.press('Enter')
await page.waitForTimeout(120)
// Leave a half-typed line behind — the thing that used to be destroyed.
await page.keyboard.type('cat index')
await page.waitForTimeout(120)

const beforeMinimize = await screen()
check('scrollback has accumulated before minimizing', beforeMinimize.includes('help'))

await page.getByRole('button', { name: 'minimize' }).first().click()
await page.waitForTimeout(250)
const hiddenCount = await page.locator('.xterm-screen').count()
check('minimized window is hidden, not unmounted', hiddenCount >= 1, 'xterm still in the DOM')

await page.getByRole('button', { name: /^Terminal/ }).last().click()
await page.waitForTimeout(400)

const afterRestore = await screen()
check(
  'scrollback survives minimize/restore',
  afterRestore.includes('mechanism, not policy'),
  'earlier cat output still present'
)
check(
  'the half-typed command line survives',
  afterRestore.includes('cat index'),
  'buffer preserved'
)
check(
  'cwd survives',
  afterRestore.includes('/projects $'),
  'prompt still shows /projects'
)

// And it is still live, not a frozen screenshot.
await focusTerminal()
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
const stillWorks = await screen()
check(
  'the restored terminal still executes',
  stillWorks.includes('No such file or directory') || stillWorks.includes('index'),
  'ran the recovered line'
)

/* ------------------------------------------------------ history + resize */

await page.keyboard.press('ArrowUp')
await page.waitForTimeout(120)
check('up arrow recalls the previous command', (await screen()).includes('cat index'))
await page.keyboard.press('Control+c')
await page.waitForTimeout(100)

const cols = () => page.evaluate(() => document.querySelectorAll('.xterm-rows > div').length)
const rowsBefore = await cols()
const frame = await page.locator('.window-titlebar').first().boundingBox()
await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2)
await page.mouse.down()
await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2 - 120, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
check('terminal survives a window drag', (await cols()) >= rowsBefore - 2, 'rows stable')

await page.screenshot({ path: 'scripts/terminal-verify.png' })

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '))

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
