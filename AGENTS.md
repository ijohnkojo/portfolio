<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project

A portfolio site whose front page is a knowledge graph of the work, built from
`content/`. The repo also holds a web OS: a separate project in `os/`, served at
`/os` and reached from its node on the site. **The OS is frozen** since
2026-09-27 (D-037) — kept, tested, not changed.

Read [docs/README.md](docs/README.md) first — it maps the rest.

## Documentation is part of the work

Docs are updated **in the same commit** as the change, never afterwards.

- **Plans go in `docs/plans/`**, named `YYYY-MM-DD-short-slug.md`. Every plan,
  including ones drafted in plan mode — copy it into the repo rather than
  leaving it in a scratch directory. Give it a status header on approval and
  update it on ship, recording any deviations from what was planned.
- **Decisions that constrain later work get a `D-NNN` entry** in
  `docs/decisions.md`, with the reason and what it costs. Reference the ID from
  code comments instead of restating the rationale. One log for the whole repo.
- **`docs/design.md` is the site's design doc** — patch the relevant section
  when implementation settles one of its open questions, and mark it
  **▸ Built** / **▸ Decided**. Don't let it drift into describing a system that
  doesn't exist. The OS's own design doc, `docs/os/design.md`, is frozen.
- **`docs/architecture.md` is as-built** for the site — it must match the code.
  `docs/os/` documents the OS as it was frozen.
- **Diagrams are mermaid**, in ```` ```mermaid ```` fences — never ASCII art.
  `flowchart` for structure, `sequenceDiagram` for ordered interactions,
  `stateDiagram-v2` for lifecycles. File/directory trees stay plain code blocks.
  Run `pnpm check:diagrams` after editing one.
- Add a `docs/changelog.md` entry per working session.
- **When a feature ships, check whether it fired a `Revisit when` trigger** in
  `docs/decisions.md` and answer it in writing. `docs/review.md` is the periodic
  audit of decisions and gaps; re-run it rather than trusting it.

## Invariants

### The site

1. **Nothing outside `os/` and `app/os/` imports the OS.** The OS reads the
   site's content through `lib/content.ts`, never the other way round, and it
   may import from the site only what `lib/boundary.test.ts` allows. D-037.
2. **Logic lives in `lib/` as plain TypeScript and runs in bare node** — no
   DOM, no React. `components/` holds rendering. Pure logic that a client
   component needs must not import `lib/content.ts`, which reads the disk:
   `lib/graph/model.ts`, `layout.ts` and `interact.ts` are pure, `load.ts` is
   the one that reads, and `lib/graph/purity.test.ts` holds that line.

### The OS — frozen

While it is frozen, work on the site **does not change OS behaviour**: add it to
`docs/os/backlog.md` instead. When OS work resumes, these three are
load-bearing and easy to break silently:

3. **`os/kernel/` imports nothing from `os/apps/`, `os/wm/`, `os/registry/`, or
   `os/hooks/`, and never imports React.** It uses `zustand/vanilla`. React
   bindings belong in `os/hooks/kernel.ts`.
4. **Window geometry is written to the store only on gesture *end*.** Never in
   `onDrag`/`onResize`. And every process-table mutator must leave untouched
   process objects referentially identical. See `docs/os/gotchas.md` and
   D-002 / D-006.
5. **When a module needs a capability it is not allowed to have, pass a message
   — do not widen the module.** `lineEditor.ts` has no filesystem;
   `commands.ts` has no DOM and cannot reach the window manager. Tab returns a
   `complete` *effect* for the caller to resolve; `tile` emits a `wm:tile`
   *event* for the WM to act on. Effect when you need the answer back, event
   when you do not and the handler is distant. This is what keeps the OS's
   tests running in bare node — see
   [os/architecture.md § when a layer needs something it is not allowed to have](docs/os/architecture.md).

`pnpm test` runs both projects' unit tests and the boundary. The OS's browser
checks (`pnpm verify` and the other `verify:*` scripts, with `pnpm dev -p 3111`
running) assert invariants 3–5 behaviourally; see `docs/running.md`.
