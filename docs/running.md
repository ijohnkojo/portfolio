# Running and verifying

## Start it

```bash
pnpm dev
```

- **http://localhost:3000** — the site
- **http://localhost:3000/os** — the OS, a separate project frozen since
  2026-09-27 ([D-037](decisions.md)). How to drive it is in
  [os/running.md](os/running.md).

`predev` and `prebuild` mirror entry assets into `public/content/` first
([D-012](decisions.md)), so a fresh clone needs one of them before assets
resolve.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build — every published entry should appear as ● (SSG). Lists any published entry whose summary is still a `DRAFT` placeholder, without failing |
| `pnpm start` | serve the production build |
| `pnpm test` | unit tests for the site (`lib/`) and the OS (`os/`), all in bare node |
| `pnpm test:watch` | same, watching |
| `pnpm lint` | eslint |
| `pnpm check:diagrams` | parses every ```` ```mermaid ```` block in the repo's markdown |
| `pnpm verify:content` | content routes render with JS disabled, and the OS reads the same bytes — **needs `pnpm dev` running** |
| `pnpm verify:graph` | the home graph in a real browser: no-JS render, tracing that moves nothing, the keyboard walk, AA contrast in both themes, 24px targets, announcements, reduced motion, the timeline, and the phone layout's `<dialog>` — **needs `pnpm dev` running** |

The OS keeps five more browser checks of its own — `verify`,
`verify:terminal`, `verify:viewer`, `verify:desktop`, `verify:phase2` — listed
in [os/running.md](os/running.md#commands). They still run while it is frozen;
run them after any change that could reach `os/`, since that is how a frozen
project stays alive rather than rotting.

## Browser checks

The `verify*` scripts drive system Chrome through Playwright resolved from a
local install, `PLAYWRIGHT_PATH`, or the npx cache — Playwright is not a
project dependency ([D-009](decisions.md)). They default to port 3111:

```bash
pnpm dev -p 3111
```

```bash
pnpm verify:content
pnpm verify:graph
```

In a sandbox without system Chrome, point `CHROME_PATH` at another Chromium
(for example `/opt/pw-browsers/chromium`); `check:diagrams` also takes
`MERMAID_PATH`, a local `mermaid.min.js`, when the CDN is unreachable.

For the default port, set `BASE_URL=http://localhost:3000` (and
`OS_URL=http://localhost:3000/os` for `pnpm verify`). They must run against
`pnpm dev`, not `pnpm start` — some assertions read development-only logging.

## If the build fails on generated types

After routes move, a `.next/dev/types/` left by an earlier dev session still
names the old paths, and `pnpm build`'s type check fails on it with
`Cannot find module '…/app/(site)/…/page.js'`. It is generated — delete it, or
run `pnpm dev` once to regenerate it ([D-043](decisions.md)).

```bash
rm -rf .next/dev/types
```
