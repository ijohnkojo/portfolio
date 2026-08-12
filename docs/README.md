# Docs

Living documentation for the personal-OS portfolio. Kept current as the project
develops — if the code and a doc disagree, the doc is a bug.

## Files

| File | What it is | When to read it |
|---|---|---|
| [personal-os-portfolio.md](personal-os-portfolio.md) | **The design doc.** Philosophy, layer breakdown, the syscall boundary, phased build, stack. Sections reconciled with the implementation are marked **▸ Built** / **▸ Decided**. | Understanding *what this is meant to be* |
| [architecture.md](architecture.md) | **As built.** What the code does right now — file map, kernel API surface, data shapes, render topology, known gaps. | Before changing anything |
| [decisions.md](decisions.md) | **Decision log.** D-001…, each with the reason and what it costs. Append-only. | Before re-litigating a choice |
| [review.md](review.md) | **Periodic audit** of the decisions and gaps: what has gone stale, which costs are now live, what to do next. Re-run it rather than trusting it. | Deciding what to work on |
| [gotchas.md](gotchas.md) | Performance constraints, mostly about the window manager. The source of the drag rule. | Before touching `wm/` |
| [authoring.md](authoring.md) | **How to add a project or paper**: directory shape, frontmatter, slugs, drafts, assets, adding a collection. | Writing content |
| [running.md](running.md) | How to start it, drive it, and verify it. | Getting it on screen |
| [changelog.md](changelog.md) | One entry per working session: built, decided, verified, deliberately left out. | Catching up |
| [plans/](plans/) | Implementation plans, dated. Each carries a status header. | Starting or resuming work |

## Conventions

- **Plans live in `docs/plans/`**, named `YYYY-MM-DD-short-slug.md`. Every plan
  we make goes here — not in a scratch directory — so the reasoning stays with
  the repo. Each gets a status header when it's approved and again when it
  ships, noting any deviations.
- **Decisions get an ID.** When a choice constrains later work, add a `D-NNN`
  entry to [decisions.md](decisions.md) with the reason. Reference it from code
  comments and other docs rather than restating the rationale.
- **The design doc gets patched, not appended.** When implementation settles an
  open question in `personal-os-portfolio.md`, edit that section and mark it
  **▸ Decided** with a link to the `D-NNN` entry — so the doc never drifts into
  describing a system that doesn't exist.
- **Diagrams are mermaid**, in ```` ```mermaid ```` fences — never ASCII art.
  They render on GitHub and in most editors, and they stay editable. Pick the
  type that matches the thing: `flowchart` for structure, `sequenceDiagram` for
  ordered interactions, `stateDiagram-v2` for lifecycles. File and directory
  trees are the exception — those stay as plain code blocks, since mermaid makes
  them worse. Run `pnpm check:diagrams` after editing one: a diagram that fails
  to parse renders as an error box on GitHub instead of failing loudly.
- **Shipping a feature means checking whether it fired a `Revisit when`
  trigger** in [decisions.md](decisions.md), and answering it in writing.
  A trigger nobody notices firing does nothing — that has already happened once
  ([review.md](review.md)).
- **Update docs in the same commit as the change**, not afterwards.

## Current state

**Design doc Phases 1 and 2 are complete.** Kernel, syscall boundary, registry,
window manager with snapping and tiling, crawlable SSG content routes, a shell
with twenty-four commands, tab completion, persisted history, a file/PDF viewer, and
a session that survives a reload.

Not yet: a game. Content is real MDX with real frontmatter; the prose is being
written separately.

Next up, if you want it: [plans/2026-08-12-piping-and-redirection.md](plans/2026-08-12-piping-and-redirection.md)
— drafted and ready to execute, not started.

Remaining work is triaged in [review.md](review.md) — all absences now rather
than defects. The nearest items are the placeholder slugs (which become
permanent URLs the moment anything links in), no mobile mode, and no
accessibility work.
