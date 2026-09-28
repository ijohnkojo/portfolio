# Docs

Living documentation for the portfolio site — and, in [os/](os/), for the web
OS that lives in the same repo as a separate, frozen project. If the code and a
doc disagree, the doc is a bug.

## The site

| File | What it is | When to read it |
|---|---|---|
| [design.md](design.md) | **The design doc.** What the site is for, the knowledge graph, the data model. Sections reconciled with the implementation are marked **▸ Built** / **▸ Decided**. | Understanding *what this is meant to be* |
| [architecture.md](architecture.md) | **As built.** Structure, the site/OS boundary, the content pipeline, routes, known gaps. | Before changing anything |
| [decisions.md](decisions.md) | **Decision log** for the whole repo. D-001…, each with the reason and what it costs. Append-only. | Before re-litigating a choice |
| [review.md](review.md) | **Periodic audit** of the decisions and gaps. Re-run it rather than trusting it. | Deciding what to work on |
| [authoring.md](authoring.md) | **How to add a project or paper**: directory shape, frontmatter, slugs, drafts, assets, adding a collection. | Writing content |
| [running.md](running.md) | How to start it, test it, and verify it. | Getting it on screen |
| [changelog.md](changelog.md) | One entry per working session: built, decided, verified, deliberately left out. | Catching up |
| [plans/](plans/) | Implementation plans, dated. Each carries a status header. | Starting or resuming work |

## The OS — frozen since 2026-09-27

A separate project in [`os/`](../os/), reachable at `/os` and from its node on
the site ([D-037](decisions.md)). These docs describe it as it was when frozen,
and carry a banner saying so.

| File | What it is |
|---|---|
| [os/backlog.md](os/backlog.md) | **Start here when OS work resumes.** What was deferred, and why. |
| [os/design.md](os/design.md) | Its design doc — philosophy, layers, the syscall boundary. Written when the OS *was* the site. |
| [os/architecture.md](os/architecture.md) | As built at the freeze: kernel, window manager, shell, desktop, apps. |
| [os/gotchas.md](os/gotchas.md) | Performance constraints; the source of the drag rule. |
| [os/running.md](os/running.md) | Driving the shell, the desktop and the apps, and the OS's browser checks. |
| [os/walkthrough.md](os/walkthrough.md) | A guided tour for someone new to it. |

## Conventions

- **Plans live in `docs/plans/`**, named `YYYY-MM-DD-short-slug.md`. Every plan
  we make goes here — not in a scratch directory — so the reasoning stays with
  the repo. Each gets a status header when it's approved and again when it
  ships, noting any deviations.
- **Decisions get an ID.** When a choice constrains later work, add a `D-NNN`
  entry to [decisions.md](decisions.md) with the reason. Reference it from code
  comments and other docs rather than restating the rationale.
- **The design doc gets patched, not appended.** When implementation settles an
  open question in [design.md](design.md), edit that section and mark it
  **▸ Decided** with a link to the `D-NNN` entry — so the doc never drifts into
  describing a system that doesn't exist. The OS's design doc is frozen and is
  not patched until OS work resumes.
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

**The site is being rebuilt around a knowledge graph** —
[plans/2026-09-27-graph-home.md](plans/2026-09-27-graph-home.md). Phase 1 is
done: the OS moved into `os/` and became a frozen project with its own docs
(D-037), the content tests stopped depending on what is published (D-038), and
the OS got a project entry of its own, `projects/personal-os`. The graph itself
is Phases 2–5, not yet built.

**Content:** seven entries, all published since `516e366` — but every summary
still reads `DRAFT — replace this.` That is prose, not code, and it is the
largest gap between what is built and what a visitor sees.

[review.md](review.md) was last run on 2026-08-12 and predates the split; it
is stale. Re-run it.
