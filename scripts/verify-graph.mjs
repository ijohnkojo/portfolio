/**
 * Verifies the home page's knowledge graph in a real browser: that it works
 * without JavaScript, traces and selects without moving anything, walks from
 * the keyboard, meets WCAG AA contrast and target size, respects reduced
 * motion, and has a phone layout whose inspector is a native <dialog>.
 *
 * The unit tests hold the graph's rules in bare node (lib/graph/*.test.ts);
 * this holds what only a browser can show. Nothing here names a node from the
 * content except by kind — the graph's contents are the author's to change.
 *
 *   pnpm dev -p 3111   (in another terminal)
 *   node scripts/verify-graph.mjs
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
  throw new Error('playwright not found — `npx playwright@latest --version` once, or set PLAYWRIGHT_PATH')
}

const { chromium } = loadPlaywright()
const BASE = process.env.BASE_URL ?? 'http://localhost:3111'
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const GROUP = '[aria-label="Knowledge graph"]'
const CONTROLS = `${GROUP} > button, ${GROUP} > a`
const INSPECTOR = '[data-graph-inspector]'
const CLEAR = `${INSPECTOR} [aria-label="Clear selection"]`

/** Each node control's accessible name ends with its kind: "TreeViz, Project, 2025". */
const byKind = (page, kind) => page.locator(CONTROLS).filter({ has: page.locator(`.sr-only:text-matches(", ${kind}")`) })

async function opacities(page) {
  return page.$$eval(CONTROLS, (els) => els.map((el) => Number(getComputedStyle(el).opacity)))
}

async function boxes(page) {
  return page.$$eval(CONTROLS, (els) =>
    els.map((el) => {
      // Labels change weight when selected, so compare where each node is, not its width.
      const r = el.firstElementChild?.getBoundingClientRect() ?? el.getBoundingClientRect()
      return `${Math.round(r.x)},${Math.round(r.y)}`
    })
  )
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

/**
 * The graph replays by itself on a first visit (D-051). Every check below that
 * wants the graph at rest runs as a returning visitor, by setting the flag the
 * page stores — `REPLAYED_KEY` in components/graph/KnowledgeGraph.tsx — before
 * it loads. The first visit gets checks of its own.
 */
const REPLAYED_KEY = 'home-graph:replayed'
async function returning(options) {
  const ctx = await browser.newContext(options)
  await ctx.addInitScript((key) => {
    try {
      localStorage.setItem(key, '1')
    } catch {}
  }, REPLAYED_KEY)
  return ctx
}

const browser = await chromium.launch({ executablePath: CHROME })

/* ----------------------------------------------------- without JavaScript */

{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const total = Number(/of (\d+) nodes/.exec(await page.locator('main').innerText())?.[1])
  const controls = await page.locator(CONTROLS).count()
  check('no JS: every node is a control in the server HTML', total > 0 && controls === total, `${controls} of ${total}`)
  check('no JS: the edges are drawn', (await page.locator(`svg line`).count()) > 0)
  check(
    'no JS: the listings link to the work',
    (await page.locator('main a[href^="/projects/"], main a[href^="/papers/"], main a[href^="/presentations/"]').count()) > 0
  )
  check('no JS: the timeline is disabled, not dead', await page.getByRole('slider', { name: 'Year' }).isDisabled())
  await ctx.close()
}

/* ------------------------------------------------------------- desktop */

const desktop = await returning({ viewport: { width: 1440, height: 1000 } })
const page = await desktop.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.mouse.move(2, 2)

check('at rest, nothing is faded', (await opacities(page)).every((o) => o > 0.99))

// The pulses (D-051): the centre's glow always, a ring on the selected node.
const pulse = await page.locator('.graph-pulse').evaluate((el) => {
  const cs = getComputedStyle(el)
  return `${cs.animationName} ${cs.animationDuration} ${cs.animationIterationCount}`
})
check('the centre’s glow pulses, every 2s, always', pulse === 'graph-pulse 2s infinite', pulse)
check('nothing pings while nothing is selected', (await page.locator('.graph-ping').count()) === 0)

const before = await boxes(page)
const project = byKind(page, 'Project').first()
await project.hover()
await page.waitForTimeout(250)
const traced = await opacities(page)
check(
  'hover traces: the node stays at full strength, unrelated nodes fade to 0.18',
  traced.some((o) => Math.abs(o - 0.18) < 0.01) && traced.filter((o) => o > 0.99).length >= 2,
  `${traced.filter((o) => o > 0.99).length} lit, ${traced.filter((o) => o < 0.2).length} faded`
)
check('hover moves nothing', JSON.stringify(await boxes(page)) === JSON.stringify(before))
await page.mouse.move(2, 2)

// Keyboard: one tab stop, arrows, Home, Enter, Escape.
await page.locator('body').click({ position: { x: 2, y: 2 } })
let inGraph = false
for (let i = 0; i < 30 && !inGraph; i++) {
  await page.keyboard.press('Tab')
  inGraph = await page.evaluate((g) => Boolean(document.activeElement?.closest(g)), GROUP)
}
const name = () => page.evaluate(() => document.activeElement?.textContent ?? '')
check('Tab enters the graph at the centre', inGraph && (await name()).includes('Michael'), await name())
await page.keyboard.press('ArrowUp')
check('↑ goes out to the inner ring', /Organization|Field/.test(await name()), await name())
await page.keyboard.press('ArrowRight')
check('→ moves round the ring', /Organization|Field/.test(await name()), await name())
await page.keyboard.press('Enter')
check('Enter selects', (await page.locator(CLEAR).count()) === 1)
const ping = await page.locator('.graph-ping').evaluate((el) => `${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration}`).catch(() => 'none')
check('the selected node pings on the same beat', (await page.locator('.graph-ping').count()) === 1 && ping === 'graph-ping 2s', ping)
await page.keyboard.press('Home')
check('Home returns to the centre', (await name()).includes('Michael'))
await page.keyboard.press('Escape')
check('Escape clears the selection', (await page.locator(CLEAR).count()) === 0)
await page.keyboard.press('Tab')
check(
  'the graph is one tab stop',
  !(await page.evaluate((g) => Boolean(document.activeElement?.closest(g)), GROUP))
)

// Selection is announced; blank space clears it.
await project.click()
await page.waitForTimeout(100)
const live = await page.locator(`${GROUP} ~ [aria-live="polite"], [aria-live="polite"]`).first().innerText()
check('a selection is announced to screen readers', live.startsWith('Selected '), live)
const g = await page.locator(GROUP).boundingBox()
await page.mouse.click(g.x + 4, g.y + g.height - 4)
check('a click on blank space clears the selection', (await page.locator(CLEAR).count()) === 0)

// Target size, WCAG 2.5.8: 24 × 24.
const small = await page.$$eval(CONTROLS, (els) =>
  els.map((el) => el.getBoundingClientRect()).filter((r) => r.width < 24 || r.height < 24).length
)
check('every node control is at least 24 × 24', small === 0, `${small} smaller`)

// Timeline: scrub, restore, replay.
const slider = page.getByRole('slider', { name: 'Year' })
const [min, max] = [await slider.getAttribute('min'), await slider.getAttribute('max')]
const all = await page.locator(CONTROLS).count()
await slider.fill(min)
const early = await page.locator(CONTROLS).count()
await slider.fill(max)
check('the timeline narrows the graph and restores it', early < all && (await page.locator(CONTROLS).count()) === all, `${early} → ${all}`)
await page.getByRole('button', { name: 'replay' }).click()
await page.waitForTimeout(300)
const during = await slider.inputValue()
await page.getByRole('button', { name: 'replay' }).waitFor({ timeout: 10000 })
check('Replay starts at the first year and ends on the last', during === min && (await slider.inputValue()) === max)

check('no horizontal overflow at 1440', (await overflow(page)) === 0)
await page.setViewportSize({ width: 1024, height: 900 })
check('no horizontal overflow at 1024', (await overflow(page)) === 0)
check('no page errors on desktop', errors.length === 0, errors.join(' | '))
await desktop.close()

/* ------------------------------------------------------------- first visit */

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  const slider = p.getByRole('slider', { name: 'Year' })
  const [min, max] = [await slider.getAttribute('min'), await slider.getAttribute('max')]
  const seen = new Set()
  for (let i = 0; i < 30 && !(seen.has(min) && (await slider.inputValue()) === max && seen.size > 1); i++) {
    seen.add(await slider.inputValue())
    await p.waitForTimeout(250)
  }
  check(
    'a first visit replays the timeline by itself, first year to last',
    seen.has(min) && (await slider.inputValue()) === max,
    [...seen].join(' → ')
  )
  const live = await p.locator('[aria-live="polite"]').first().innerText()
  check('the first visit’s replay is not read out over the page', live === '', JSON.stringify(live))
  await p.getByRole('button', { name: 'replay' }).waitFor({ timeout: 5000 })
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  check('a second visit opens on the whole graph, without replaying', (await slider.inputValue()) === max)
  await ctx.close()
}

/* ---------------------------------------------------------------- contrast */

/**
 * WCAG AA: 4.5:1 for text, 3:1 for large text (24px, or 18.66px bold). Every
 * visible text element in the header, main and footer, at rest, in both
 * schemes. Alpha and ancestor opacity are blended over the page background.
 * The centre's name, dark on the amber disc, is measured against the accent.
 */
for (const colorScheme of ['light', 'dark']) {
  const ctx = await returning({ viewport: { width: 1440, height: 1000 }, colorScheme })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.mouse.move(2, 2)
  const failures = await p.evaluate(() => {
    // Computed colours come back in whatever space the stylesheet used —
    // Tailwind v4 uses lab() — so let a canvas convert them to sRGB.
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const parse = (c) => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = c
      canvas.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
      return (x + 0.05) / (y + 0.05)
    }
    const root = getComputedStyle(document.documentElement)
    const page = parse(getComputedStyle(document.body).backgroundColor)
    const accent = parse(root.getPropertyValue('--accent').trim())
    const out = []
    const scope = document.querySelectorAll('header, main, footer')
    for (const region of scope) {
      const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const el = t.parentElement
        if (!el || !t.textContent.trim()) continue
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.display === 'none') continue
        if (el.closest('[disabled]')) continue
        let opacity = 1
        for (let a = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity)
        const [cr, cg, cb, ca = 1] = parse(cs.color)
        const onDisc = Boolean(el.closest('button.rounded-full'))
        const bg = onDisc ? accent : page
        const alpha = ca * opacity
        const fg = [cr, cg, cb].map((v, i) => v * alpha + bg[i] * (1 - alpha))
        const size = parseFloat(cs.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
        const need = large ? 3 : 4.5
        const got = ratio(fg, bg)
        if (got < need) out.push(`"${t.textContent.trim().slice(0, 24)}" ${got.toFixed(2)}:1`)
      }
    }
    return [...new Set(out)]
  })
  check(`text contrast meets AA at rest (${colorScheme})`, failures.length === 0, failures.slice(0, 6).join(', '))
  await ctx.close()
}

/* ----------------------------------------------------------- reduced motion */

{
  // A first visit, so the replay would start by itself if it were allowed to.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const slider = p.getByRole('slider', { name: 'Year' })
  check('reduced motion: the first visit does not replay by itself', (await slider.inputValue()) === (await slider.getAttribute('max')))
  check(
    'reduced motion: the centre’s glow holds still',
    (await p.locator('.graph-pulse').evaluate((el) => getComputedStyle(el).animationName)) === 'none'
  )
  await byKind(p, 'Project').first().click()
  check(
    'reduced motion: a selection does not ping',
    (await p.locator('.graph-ping').evaluate((el) => getComputedStyle(el).display)) === 'none'
  )
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'replay' }).click()
  await p.waitForTimeout(1200)
  const anim = await p.$$eval('.graph-enter', (els) => els.map((el) => getComputedStyle(el).animationName))
  // `transition-none` removes the property; the duration it leaves is moot.
  const transitions = await p.$$eval(CONTROLS, (els) => els.map((el) => getComputedStyle(el).transitionProperty))
  check(
    'reduced motion: nothing fades in, nothing transitions',
    anim.length > 0 && anim.every((a) => a === 'none') && transitions.every((d) => d === 'none'),
    `${anim.length} entering, animation ${[...new Set(anim)].join('/')}, transition ${[...new Set(transitions)].join('/')}`
  )
  await ctx.close()
}

/* ------------------------------------------------------------------ phone */

{
  const ctx = await returning({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  const phoneErrors = []
  p.on('pageerror', (e) => phoneErrors.push(String(e)))
  await p.goto(BASE, { waitUntil: 'networkidle' })

  const box = await p.locator(GROUP).locator('..').locator('..').boundingBox()
  check('phone: the drawing is square, cropped to the rings', Math.abs(box.width - box.height) < 2, `${Math.round(box.width)} × ${Math.round(box.height)}`)
  check('phone: no horizontal overflow', (await overflow(p)) === 0)

  const label = (loc) => loc.locator('span[aria-hidden="true"]').nth(1)
  const toolLabel = label(byKind(p, 'Tool').first())
  const innerLabel = label(byKind(p, 'Organization').first())
  check('phone: at rest, the inner ring is labelled and tools are not', (await innerLabel.isVisible()) && !(await toolLabel.isVisible()))

  const name = p.locator(`${GROUP} button.rounded-full span[aria-hidden="true"]`)
  const fits = await name.evaluate((el) => el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width)
  check('phone: the centre’s name fits its disc', fits)

  const node = byKind(p, 'Project').first()
  await node.tap()
  const dialog = p.locator('dialog[open]')
  await dialog.waitFor({ timeout: 3000 }).catch(() => {})
  check('phone: a tap opens the inspector as a modal <dialog>', (await dialog.count()) === 1 && (await dialog.locator('h2').count()) === 1)
  check('phone: the panel under the graph still shows the centre', (await p.locator(`${INSPECTOR} h2`).first().innerText()).includes('Michael'))
  check('phone: the dialog takes focus', await p.evaluate(() => Boolean(document.activeElement?.closest('dialog'))))
  await p.keyboard.press('Escape')
  check('phone: Escape closes the dialog and clears the selection', (await p.locator('dialog[open]').count()) === 0 && (await node.getAttribute('aria-pressed')) === 'false')

  await node.tap()
  await dialog.waitFor({ timeout: 3000 })
  await p.mouse.click(195, 20)
  await p.waitForTimeout(200)
  check('phone: a tap on the backdrop closes it', (await p.locator('dialog[open]').count()) === 0)
  check('no page errors on the phone', phoneErrors.length === 0, phoneErrors.join(' | '))
  await ctx.close()
}

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
