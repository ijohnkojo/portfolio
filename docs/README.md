# Docs

Living documentation for the personal-OS portfolio. Kept current as the project
develops — if the code and a doc disagree, the doc is a bug.

## Files

| File | What it is | When to read it |
|---|---|---|
| [personal-os-portfolio.md](personal-os-portfolio.md) | **The design doc.** Philosophy, layer breakdown, the syscall boundary, phased build, stack. Sections reconciled with the implementation are marked **▸ Built** / **▸ Decided**. | Understanding *what this is meant to be* |
| [architecture.md](architecture.md) | **As built.** What the code does right now — file map, kernel API surface, data shapes, render topology, known gaps. | Before changing anything |
| [decisions.md](decisions.md) | **Decision log.** D-001…, each with the reason and what it costs. Append-only. | Before re-litigating a choice |
| [gotchas.md](gotchas.md) | Performance constraints, mostly about the window manager. The source of the drag rule. | Before touching `wm/` |
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
- **Update docs in the same commit as the change**, not afterwards.

## Current state

Foundation slice shipped: kernel, syscall boundary, registry, window manager,
two stub apps. No shell/terminal, no file viewer, no games, no SSG content
routes, persistence shaped but not wired.

Next up, per [architecture.md § known gaps](architecture.md): the SSG content
routes — design doc §5 calls their absence the most common failure mode in this
genre.
