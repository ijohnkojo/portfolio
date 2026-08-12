# Running and verifying

## Start it

```bash
pnpm dev
```

- **http://localhost:3000/os** — the OS shell
- **http://localhost:3000** — placeholder landing page with a "boot →" link

At boot you get an **About** window and a taskbar: the `personal-os` label,
launcher buttons for each registered app, then one button per running window.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm start` | serve the production build |
| `pnpm test` | 62 unit tests, kernel + content loader (node env, ~300ms) |
| `pnpm test:watch` | same, watching |
| `pnpm lint` | eslint |
| `pnpm verify` | drives the real app in Chrome — **needs `pnpm dev` running** |
| `pnpm check:diagrams` | parses every ```` ```mermaid ```` block in the repo's markdown |
| `pnpm verify:content` | content routes render with JS disabled — **needs `pnpm dev` running** |

`pnpm verify` defaults to `http://localhost:3111/os`. For the default dev port:

```bash
OS_URL=http://localhost:3000/os pnpm verify
BASE_URL=http://localhost:3000 pnpm verify:content
```

It must run against `pnpm dev`, not `pnpm start` — the commit logging it asserts
on is compiled out of production builds. It resolves Playwright from a local
install, `PLAYWRIGHT_PATH`, or the npx cache, and drives system Chrome
(`CHROME_PATH` to override). See [D-009](decisions.md).

## Driving it by hand

| Action | Expect |
|---|---|
| Drag a titlebar | Moves smoothly, stays inside the desktop |
| Drag an edge or corner | Resizes; min 240×160 |
| Click a launcher button | New window, own pid |
| Click between windows | Focused one brightens and comes to front |
| Double-click a titlebar | Maximize / restore |
| `–` `□` `✕` | Minimize, maximize, close |
| Click the focused window's own taskbar button | Minimizes it; click again to restore |
| **crash this app** in About | Red "segmentation fault" panel; the other window and taskbar keep working |
| **restart** in that panel | App comes back |

Launch **About** twice — each instance gets its own pid. The process table is
per-instance, not per-app.

## The check that actually matters

The drag-performance contract from [gotchas.md](gotchas.md): live drag is
imperative and local, persisted geometry is state.

Open DevTools → Console and drag a window:

- **while dragging** — console stays silent
- **on mouse-up** — exactly one `[wm] pid N commit #M`

If lines appear *during* the drag, something started writing geometry to the
store mid-gesture and the contract is broken. Then drag window 2 and confirm no
`pid 1` lines appear — that is the scoped selectors ([D-006](decisions.md))
doing their job.

`pnpm verify` asserts both automatically.

## Code splitting

DevTools → Network → JS. Hard-reload `/os`, then click a launcher button: a new
chunk request should fire **at that click**, not at page load. Apps are not in
the initial bundle ([D-005](decisions.md)).

To check it against a production build instead:

```bash
pnpm build
grep -c "vfs nodes" .next/server/app/os.html   # 0 — sysinfo is not in the payload
```

## Expected noise

In dev, Next shows an indicator bottom-left. After using the crash button it
reads "1 Issue" — that is the error boundary's own `console.error` reporting the
crash it caught, which is the intended behaviour. A clean run logs nothing.
