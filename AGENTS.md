<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project

A portfolio built as a mock operating system. UNIX split: the kernel provides
mechanism (VFS, process table, event bus), everything else is swappable policy.

Read [docs/README.md](docs/README.md) first — it maps the rest.

## Documentation is part of the work

Docs are updated **in the same commit** as the change, never afterwards.

- **Plans go in `docs/plans/`**, named `YYYY-MM-DD-short-slug.md`. Every plan,
  including ones drafted in plan mode — copy it into the repo rather than
  leaving it in a scratch directory. Give it a status header on approval and
  update it on ship, recording any deviations from what was planned.
- **Decisions that constrain later work get a `D-NNN` entry** in
  `docs/decisions.md`, with the reason and what it costs. Reference the ID from
  code comments instead of restating the rationale.
- **`docs/personal-os-portfolio.md` is the design doc** — patch the relevant
  section when implementation settles one of its open questions, and mark it
  **▸ Built** / **▸ Decided**. Don't let it drift into describing a system that
  doesn't exist.
- **`docs/architecture.md` is as-built** — it must match the code.
- **Diagrams are mermaid**, in ```` ```mermaid ```` fences — never ASCII art.
  `flowchart` for structure, `sequenceDiagram` for ordered interactions,
  `stateDiagram-v2` for lifecycles. File/directory trees stay plain code blocks.
  Run `pnpm check:diagrams` after editing one.
- Add a `docs/changelog.md` entry per working session.
- **When a feature ships, check whether it fired a `Revisit when` trigger** in
  `docs/decisions.md` and answer it in writing. `docs/review.md` is the periodic
  audit of decisions and gaps; re-run it rather than trusting it.

## Invariants

Three things are load-bearing and easy to break silently:

1. **`kernel/` imports nothing from `apps/`, `wm/`, `registry/`, or `hooks/`,
   and never imports React.** It uses `zustand/vanilla`. React bindings belong
   in `hooks/kernel.ts`.
2. **Window geometry is written to the store only on gesture *end*.** Never in
   `onDrag`/`onResize`. And every process-table mutator must leave untouched
   process objects referentially identical. See `docs/gotchas.md` and D-002 /
   D-006.
3. **When a module needs a capability it is not allowed to have, pass a message
   — do not widen the module.** `lineEditor.ts` has no filesystem;
   `commands.ts` has no DOM and cannot reach the window manager. Tab returns a
   `complete` *effect* for the caller to resolve; `tile` emits a `wm:tile`
   *event* for the WM to act on. Effect when you need the answer back, event
   when you do not and the handler is distant. This is what keeps 418 tests
   running in bare node — see
   [architecture.md § when a layer needs something it is not allowed to have](docs/architecture.md).

`pnpm verify` (with `pnpm dev` running) asserts both behaviourally. `pnpm test`
covers the kernel.
