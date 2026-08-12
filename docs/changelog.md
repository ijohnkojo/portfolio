# Changelog

Reverse-chronological. One entry per working session: what got built, what was
verified, and what was deliberately left out.

---

## 2026-08-12 — Foundation slice

Plan: [plans/2026-08-12-foundation-slice.md](plans/2026-08-12-foundation-slice.md)
· Commit `7d53389`

### Built

- **Scaffold.** Next 16.3.0 / React 19.2.8 / TypeScript 5.9 / Tailwind 4.3,
  App Router, no `src/` dir so `kernel/`, `wm/`, `apps/`, `registry/` sit at the
  root as design doc §8.3 lays out. Zustand 5.0.14, react-rnd 10.5.3,
  vitest 4.1.10.
- **Kernel** (`kernel/`) — VFS with pure path helpers and structural-sharing
  writes; process table with central focus/z-index; event bus whose `on()`
  returns its unsubscribe; the syscall boundary with per-manifest permission
  checks; persistence shape with `schemaVersion`, a migration seam, and a
  `StorageAdapter`.
- **React bindings** (`hooks/kernel.ts`) — scoped selectors, plus `useEvent`
  built on React 19's `useEffectEvent`.
- **Registry** (`registry/`) — `appId -> manifest`, one literal `dynamic()`
  import per app.
- **Window manager** (`wm/`) — draggable/resizable/maximizable window frames,
  per-app error boundary, taskbar with launcher and running-window list.
- **Two stub apps** — `about` (reads its content through the boundary, can crash
  on demand) and `sysinfo` (live kernel state).
- **`/os` entry point**, placeholder landing page, placeholder content tree at
  `/home`, `/projects`, `/papers`, `/apps`.

### Decided

Both of the design doc's open questions, plus seven more —
[decisions.md](decisions.md) D-001 … D-009. The two that shape everything after:

- **D-002** — react-rnd with controlled props written only on drag/resize stop.
  Settled by reading `react-draggable`'s source, which renders from internal
  state while dragging and ignores the prop. Same zero-re-render property as the
  planned uncontrolled mode, and maximize stops needing a remount that would
  destroy app state.
- **D-003** — `fs.write` targets a localStorage overlay behind a
  `StorageAdapter`; the base tree ships with the build and stays read-only.

### Verified

- **48 kernel unit tests**, node environment, ~300ms.
- **`scripts/verify-wm.mjs` — 17/17** driving real Chrome. The two that matter:
  **zero React commits across a 20-step drag, exactly one on mouse-up**, and
  **zero re-renders of window 1 while dragging window 2**.
- Build artifacts confirm neither app chunk is in the `/os` initial payload.
- Clean run: zero console errors, zero warnings.

### Left out, deliberately

Terminal/shell and the ~8 commands, file/PDF viewer, games, persistence wiring,
SSG content routes, accessibility, mobile mode, URL sync. Phase 1 continues.

### Notes

Next 16 ships agent-facing docs in `node_modules/next/dist/docs/` and warns its
APIs differ from model training data. Reading them changed the registry design:
dynamic `import()` paths must be literal strings or code splitting silently
fails ([D-005](decisions.md)).

---

## 2026-08-12 — Documentation pass

Commits `ae94983`, and this one.

### Built

- `docs/` reorganised: [README.md](README.md) (map + conventions),
  [architecture.md](architecture.md) (as-built), [decisions.md](decisions.md)
  (D-001…D-009), [running.md](running.md), this changelog, and
  [plans/](plans/) with the foundation-slice plan moved in from the scratch
  directory and given a status header.
- `docs/personal-os-portfolio.md` reconciled with the implementation — §3, §4,
  §5, §6, §8.1, §8.2, §8.3, §8.4 patched in place and marked ▸ Built / ▸ Decided
  rather than appended to.
- All diagrams converted from ASCII to mermaid, per project convention. Added
  three that only existed as prose before: the window state machine, the drag
  lifecycle, and the boot sequence.
- `scripts/check-diagrams.mjs` (`pnpm check:diagrams`) — parses every mermaid
  block in the repo. A broken diagram renders as an error box on GitHub instead
  of failing loudly, so this needed to be checkable.
- Conventions recorded in `AGENTS.md`, which `CLAUDE.md` imports, so they load
  into future sessions rather than depending on someone reading `docs/` first.

### Found while documenting

- **Minimizing a window unmounts its app.** `wm/Window.tsx:56` returns `null`
  for `state === 'minimized'`, so app-internal state is destroyed and rebuilt on
  restore. Harmless with two stateless stub apps, wrong the first time a game or
  a half-typed terminal command is minimized. Logged in
  [architecture.md § known gaps](architecture.md); not yet fixed.

---

## 2026-08-12 — Content pipeline + SSG routes

Plan: [plans/2026-08-12-content-pipeline.md](plans/2026-08-12-content-pipeline.md)

### Built

- **`lib/content.ts`** — the only module that knows the content layout. Reads
  `content/<collection>/<slug>/index.mdx` from disk, parses frontmatter with
  gray-matter, and produces both the entry list for the routes and the base VFS
  tree for the OS.
- **SSG routes** — `/projects/[slug]`, `/papers/[slug]`, plus collection
  listings and a real landing page, in an `app/(site)/` route group so `/os`
  stays outside the chrome. `generateStaticParams` prerenders every published
  entry; `generateMetadata` fills title/description/OpenGraph from frontmatter.
- **Typography** — `components/mdx.tsx`, hand-rolled rather than
  `@tailwindcss/typography`, light and dark. `components/entry.tsx` holds the
  article, listing card, and list.
- **`/os` now receives its VFS tree as a prop** built on the server, replacing
  the hardcoded `content/index.ts`.
- **`mknod`** added to the VFS store — the client needs it to register `/apps`
  nodes onto a server-built tree.
- **`scripts/sync-content-assets.mjs`** (`predev`/`prebuild`) mirrors non-MDX
  files from an entry directory into `public/content/`.
- **`scripts/verify-content.mjs`** (`pnpm verify:content`).

### Decided

[D-010](decisions.md) content read from disk + `next-mdx-remote/rsc` rather than
`@next/mdx`; [D-011](decisions.md) VFS tree as a server-built prop;
[D-012](decisions.md) entry assets mirrored into `/public`.

D-010 is the one that shaped everything: an interpolated `import()` in a dynamic
route can't be matched to a chunk (the same constraint as D-005), and reading
the file yields the raw source the VFS needs for `cat` as a side effect. **One
read on disk feeds both the crawlable route and the filesystem**, so the two
cannot drift apart.

### Verified

- **62 unit tests** (kernel + content loader).
- **`pnpm verify:content` — 13/13**, with JavaScript disabled: prose in the
  server markup, GFM tables, rehype-slug anchors, description meta from
  frontmatter, drafts absent from listings and 404 on their route, assets served.
- **`pnpm verify` still 17/17** — the tree-as-prop change didn't regress the WM.
- Build route table shows three `● (SSG)` entry pages and no draft.
- The intended asymmetry holds: the web sees one paper, the OS sees two.

### Notes

Drafts are deliberately asymmetric — hidden from the web, visible in the OS — so
work in progress stays openable in the shell without being crawled.

The cost of D-011 is now recorded in known gaps: `kernel.fs.read` is
synchronous, so every published entry's full text ships in the `/os` RSC
payload. Fine at this scale, wrong at hundreds of entries, and the fix is a
kernel change rather than a content one.

---

## 2026-08-12 — Terminal + shell

Plan: [plans/2026-08-12-terminal.md](plans/2026-08-12-terminal.md)

### Built

- **The shell, which does not know xterm exists.** `apps/terminal/shell.ts` and
  `lineEditor.ts` are plain TypeScript — no xterm, no React, no DOM. xterm is a
  *device* attached to the shell, the same mechanism/policy split the kernel
  uses one level up. The whole shell is therefore tested in bare node.
- **Ten commands** — `ls`, `cd`, `pwd`, `cat`, `open`, `ps`, `kill`, `echo`,
  `clear`, `help` — all thin wrappers over the syscall boundary, with errors in
  the shape a UNIX user expects. Path handling reuses `resolvePath`/`resolve`
  from the kernel rather than reimplementing it.
- **`Terminal.tsx`** — `@xterm/xterm` 6.0 + `FitAddon`, refit from a
  rAF-debounced `ResizeObserver` on its own container, so the terminal never
  subscribes to the process table and the WM stays unaware it exists.
- **Line editing** — arrows, Home/End, Ctrl+A/E/U/L/C/D, and in-session history.
- **The OS boots into a terminal** instead of About.

### Decided

- **[D-013](decisions.md)** — a minimized window is hidden with `display: none`,
  not unmounted. It has to go through the `style` prop: react-rnd sets
  `display: inline-block` *inline*, so a `hidden` class silently loses.
- **[D-014](decisions.md)** — `proc.list()` added to the syscall boundary. The
  first genuinely new capability the boundary has grown, and it came from an app
  needing it rather than from guessing up front.

### Verified

- **121 unit tests** (kernel, content loader, shell, line editor) — all node.
- **`pnpm verify:terminal` — 25/25**, real keystrokes in real Chrome. The one
  that matters: after minimize and restore, the **scrollback, the cwd, and a
  half-typed command line all survive**. That is D-013 paying for itself.
- **`pnpm verify` — 20/20** and **`pnpm verify:content` — 13/13** after
  updating both for the new boot app and the inverted minimize semantics.

### Notes

Both older E2E scripts failed on first run, and both were the scripts asserting
the *old* contract rather than regressions: the boot window changed, and D-013
deliberately inverted what minimize does. `verify-wm.mjs` now asserts the new
rule directly — minimized windows are **hidden but still mounted**.

Scope held: no piping or redirection (design doc §2), no persisted history, no
tab completion. `open` on a file is a deliberate dead end that names the missing
handler — the file viewer is next and slots into exactly that seam.

---

## 2026-08-12 — Gap audit

No code change. Audited what had actually been flagged versus what was recorded.

Tracking was mostly holding: 7 known gaps, 14 decisions, 5 "revisit when"
triggers, and both gaps that got fixed (SSG routes, minimize-unmounts) had been
removed from the list when they were.

Five things had been decided in-flight and never written down. Added to
[architecture.md § known gaps](architecture.md):

- **Editing a wrapped command line corrupts the display** — verified, not
  speculative. `render()` clears only the current row, so a line longer than the
  terminal width leaves its continuation rows behind and duplicates the prompt.
  The buffer stays correct; it is purely a repaint bug. This one was reasoned
  about while writing `Terminal.tsx` and then not recorded, which is precisely
  the failure these docs exist to prevent.
- Ctrl+C cannot copy a selection
- `open` focuses the first running instance rather than the most recent
- Placeholder slugs are not final, and changing one moves a published URL
- Manifests are centralized rather than one per app

The lesson worth keeping: a decision made silently while writing code is the one
that does not get recorded. "I considered it and it's fine" needs to end up in a
file, not just in the reasoning that produced the code.

---

## 2026-08-12 — File viewer · Phase 1 complete

Plan: [plans/2026-08-12-file-viewer.md](plans/2026-08-12-file-viewer.md)

### Built

- **`apps/viewer/Viewer.tsx`** — dispatches on mime: markdown through
  `react-markdown`, text/JSON as `<pre>`, PDFs through `<embed>`, images as
  `<img>`, anything else as a legible notice. Handles both VFS content sources —
  inline `content` synchronously, `src`-backed assets by fetching, with loading
  and error states. Raw/rendered toggle.
- **`open <file>` resolves mime → app from the manifests.** `handles` on the
  manifest, matching rule in `registry/handlers.ts`, injected into the shell as
  `resolveHandler` so `commands.ts` stays runnable in bare node.
- **First real use of `args`** — the path arrives in `args[0]`, which the process
  table has carried unused since the foundation slice.
- A real PDF fixture in `content/papers/paper-one/`, so the `<embed>` path has a
  valid document and the asset pipeline is exercised end to end.

### Decided

[D-015](decisions.md) mime→app injected rather than imported;
[D-016](decisions.md) `react-markdown` in the viewer, not MDX;
[D-017](decisions.md) `<embed>` for PDFs; [D-018](decisions.md) `dark:` responds
to a `.dark` ancestor as well as the media query.

D-018 was not in the plan and is the interesting one. The prose components are
shared between the theme-aware site and the always-dark OS, so in light mode the
viewer rendered **dark text on a near-black surface** — unreadable, and
invisible to anyone developing in dark mode. `verify-viewer.mjs` now runs in
`colorScheme: 'light'` specifically to catch it, and resolves the computed
colour through a canvas because Tailwind v4 emits `lab()`.

### Verified

- **130 unit tests**; **`pnpm verify:viewer` 11/11**; regressions all green
  (WM 20/20, content 13/13, terminal 25/25).

### Notes

A hardcoded count in `verify-content.mjs` went stale for the third consecutive
app. Replaced with a derived assertion — the `/apps` node count must equal the
number of registered launchers — so it now checks the property that actually
matters (the VFS mirrors the registry) instead of a number that has to be
maintained. Added `data-launcher` to the taskbar buttons to make that
selectable.

---

## 2026-08-12 — Phase 2 + the gap-list defects

Plan: [plans/2026-08-12-phase-2-and-defects.md](plans/2026-08-12-phase-2-and-defects.md)

### Defects fixed

- **The wrapped-line repaint bug.** `apps/terminal/render.ts` is now a pure
  module that walks up over a wrapped line, erases to end of *display*, and
  places the cursor absolutely. The old version cleared only the current row, so
  editing a line that wrapped duplicated the prompt on screen. Pure and tested
  because the cursor arithmetic — particularly deferred wrap at an exact row
  boundary — is not something to eyeball twice.
- **Ctrl+C now copies** when there is a selection, via
  `attachCustomKeyEventHandler`.
- **`open` focuses the topmost instance**, not the lowest pid.

### Phase 2

- **Persistence wired** ([D-019](decisions.md)) — `startAutosave` on a 400ms
  debounce, hydrate before it starts, unknown-app processes dropped, and a
  `reset` command as an escape hatch that doesn't require devtools.
- **Shell history is a file** ([D-020](decisions.md)) at `/home/.history`, so it
  rides the write overlay instead of adding a store, and `cat` reaches it. `ls`
  learned `-a`. The terminal is now the first app holding `fs.write`.
- **Window snapping** ([D-021](decisions.md)) — edge-drag and Alt+Shift+Arrow,
  with `preSnap` on `Process` so restore works and dragging away recovers the
  old size. The preview is imperative DOM, so it costs no React commits.

### Verified

**182 unit tests**; `verify:phase2` **17/17**; regressions all green — WM 20/20,
content 13/13, terminal 25/25, viewer 11/11.

### Found by the tests, not by reasoning

A debounced save loses in-flight work when the tab closes — which is exactly
when a session most needs to have been saved. History was debounced 1s and the
session another 400ms, so up to 1.4s could vanish on reload. Both now flush on
`pagehide` (and on `visibilitychange` to hidden), and the history debounce
dropped to 250ms.

The same check also had a wrong assertion: it looked for commands that were not
the most recent history entry, so a single up-arrow could never have shown them.
Both the bug and the bad assertion were real, and fixing only one would have
left a false pass.

### Notes

Windows now carry `data-app`, `data-pid`, and `data-focused`. Verification
scripts kept breaking on overlapping windows intercepting clicks — correct WM
behaviour, awkward tooling. Addressing a window by identity rather than by
z-order is more honest than adding another workaround.

D-008 deferred snapping at two stub apps; D-021 built it at four. The scope rule
in design doc §5 worked exactly as intended.

---

## 2026-08-12 — Tiling + tab completion · Phase 2 complete

Plan: [plans/2026-08-12-tiling-and-completion.md](plans/2026-08-12-tiling-and-completion.md)

### Built

- **Tab completion** ([D-022](decisions.md)) — command names in the first token,
  paths after. `apps/terminal/completion.ts` is pure with `listDir` injected;
  the line editor maps Tab to a `complete` effect rather than growing a
  filesystem. Extending to the longest common prefix and listing only when that
  adds nothing reproduces bash's two-tap behaviour with no extra state.
- **Tiling** ([D-023](decisions.md)) — `tile [grid|columns|rows|cascade]` plus
  Alt+Shift+T to cycle. Geometry is pure in `wm/tiling.ts`; whole-pixel division
  means tiles meet flush and the final grid row stretches rather than leaving a
  hole. Applied through `snap`, so **Alt+Shift+↓ pulls one window back out of a
  tiled layout** while the others stay.
- `wm/desktop.ts` — `desktopBounds`/`pointerOf` shared by snapping and tiling,
  so there is one answer to how big the desktop is.

### The design question both shared

Who is allowed to know what.

Completion needs the filesystem but the line editor must not have one; tiling
needs the DOM and the process table but the shell must stay pure. Rather than
widening either, **Tab emits an effect** and **`tile` emits an event**. The app
announces intent; something with the right context resolves it.

`wm:tile` is the first use of the event bus beyond `fs:changed`, and the one
design doc §2 actually put it there for: "pub/sub so WM, shell, and apps
communicate without direct references." The shell's `tile` command cannot move a
window and does not know how big the desktop is.

### Verified

**270 unit tests**; `verify:phase2` **25/25**, including Tab through real xterm
and three windows tiled without overlap; regressions green — WM 20/20, content
13/13, terminal 25/25, viewer 11/11.

### Notes

Two completion tests failed on first run and both were wrong assertions rather
than bugs: `/projects/` advances to `project-` because its two children share a
prefix, and `/home/` completes straight past the hidden `.history`. The code was
right in both cases.

**Design doc Phases 1 and 2 are now complete.** What remains on the list is a
game, and the gaps in [architecture.md](architecture.md) — all absences.

---

## 2026-08-12 — Write up the message-passing pattern

No code change. D-022 and D-023 each documented their own case, and the
changelog noted the two rhymed, but the *pattern* was nowhere: nothing said
"when a module needs a capability it should not have, pass a message," and
nothing explained how to choose between an effect and an event.

Which is the same failure the earlier gap audit found — something explained
clearly in conversation and never written into the repo, so the next person to
hit it re-derives or re-litigates it.

Now in [architecture.md § 1](architecture.md) with the effect/event comparison,
referenced from both decisions, and added to the invariants in `AGENTS.md` so it
loads into future sessions rather than waiting to be discovered.

---

## 2026-08-12 — Twelve more commands

Plan: [plans/2026-08-12-shell-commands.md](plans/2026-08-12-shell-commands.md)

The shell went from twelve commands to twenty-four. The motivating observation:
every content node already carried `{ title, summary, date, tags, draft, href }`
in `meta`, built from real frontmatter — and **nothing read any of it**. `ls`
showed filenames, `cat` dumped raw MDX. The metadata was in the filesystem,
unused.

### Discovery

`grep [-i] <pattern> [path]` · `find [pattern] [path]` · `stat <path…>` ·
`tags [tag]` · `tree [-a] [-L n] [path]`

`stat` is the one that pays off the observation: it prints the frontmatter, so a
writeup's title, date, and tags are readable without opening it. `tags` indexes
the same field across the whole tree. `grep` and `find` make the filesystem
searchable rather than merely walkable.

### Classics

`head` · `tail` · `wc` · `date` · `history` · `man` · `exit`

### Structure

`commands.ts` became `commands/` ([D-024](decisions.md)), grouped by what each
command touches, with a shared recursive `walk`. `Command` gained a **required**
`description` plus `examples`, which `man` prints — and a test asserts every
command has them, so one cannot ship undocumented.

### Deliberately not built

`rm` and `mv`, now [D-025](decisions.md). The VFS has no delete at all, and the
overlay is writes-only, so a deletion cannot even be represented — on reload the
base tree is rebuilt and the file returns. It needs a tombstone set and a schema
bump, which is its own decision rather than a rider on twelve read-only
commands. Everything shipped so far only ever *adds* to the filesystem, which is
why the overlay has been enough this long.

### Verified

**317 unit tests**; `verify:terminal` **33/33** with the new commands driven in
a real browser; regressions green — WM 20/20, content 13/13, viewer 11/11,
phase2 25/25.

### Notes

Two failures on first run, both mine rather than the code's. A grep scoping test
assumed `/home` contained no match for "kernel" — but the fixture's `.history`
literally contained `grep kernel`. And the minimize/restore check in
`verify-terminal` looked for a fixed string that the eight new commands had
pushed out of the visible viewport; it now compares against what was actually on
screen before minimizing, which is what it should have done all along.

`tree` also shipped drawing `├─` for last children and continuing the spine down
finished branches. Visible in a screenshot, fixed, and now tested.

---

## 2026-08-12 — Decision review

No code change. Audited all twenty-five decisions against reality — cost lines,
revisit triggers, and known gaps — and recorded the result in
[review.md](review.md).

### Two errors in the log

**D-008 was wrong and marked active.** It read "Maximize ships; snapping and
tiling do not" while D-021 and D-023 had already shipped both. Now marked
superseded, and kept rather than deleted, because the deferral is the point:
§5's scope rule held the feature back until four apps needed it.

**D-002's revisit trigger had fired unanswered.** "When Phase 2 snapping/tiling
lands" — both landed, nobody re-examined it. It held, but by luck rather than
process. Now answered in writing, and shipping a feature means checking triggers
is a convention in `docs/README.md` and `AGENTS.md`.

### Two re-scopings

**D-025 was over-scoped.** Deleting needs tombstones only for *base-tree* files.
Restrict deletion to files the user created and it collapses to removing the
overlay entry, since the base tree is rebuilt from `/content` every load. The
rule that falls out is better than the limitation it replaces — you can delete
what you created, not what shipped with the build, which is D-003 extended.

**Terminal `cwd` does not need the app-contract hook.** History already persists
by writing to the VFS; cwd can do the same, with no kernel or contract change.
That covers most of the half-restored feel without the Phase 3 shape.

### The finding worth keeping

Three known gaps — accessibility, mobile, URL sync — have no decision number.
Nobody ever chose against them for a reason; they are absences by default rather
than by choice, and all three are §5 gotchas where every other §5 item became a
decision. For an artifact whose job is being sent to people, mobile and
accessibility are plausibly worth more than any remaining feature.

---

## 2026-08-12 — Authoring guide and content-layout guards

Groundwork for real content replacing the placeholders.

### Built

- **[authoring.md](authoring.md)** — where content lives and why it has to,
  the frontmatter fields, what happens to an entry on both surfaces, how slugs
  map to URLs, drafts, assets, and the four steps to add a collection.
- **Four layout guards** in `lib/content.test.ts`. The important one catches a
  directory under `content/` that is not a declared collection: without it,
  creating `content/talks/` and forgetting to add it to `COLLECTIONS` would put
  those entries **in the OS with no web pages** — a silent half-state, and
  precisely the failure the content pipeline exists to prevent. Also: every
  collection has a directory, every entry directory has an `index.mdx`, and
  slugs are lowercase kebab-case.

### The question it settles

Whether to author in `content/` or inside the OS. It is not a preference: work
written in the OS lands in the localStorage overlay, so it would have no URL, no
meta tags, no server markup, and would vanish with site data. The VFS already
draws the line — base tree is published and read-only, overlay is scratch
([D-003](decisions.md)) — so an in-OS editor remains a reasonable thing to build
for notes, just not for anything that needs a URL.

---

## 2026-08-12 — Real content structure; placeholders removed

### Built

- **Six real entries**, all `draft: true` until the prose is written: `hq` and
  `hscp-mass-reconstruction` under papers; `treeviz`, `academic-explainer`, and
  `nanoglide` under projects; `codas-hep-2026-hardening-hq` under a new
  `presentations` collection. Frontmatter is complete, summaries drafted from
  the author's notes, bodies are section skeletons with working notes in MDX
  comments.
- **`presentations` collection** ([D-026](decisions.md)) — routes, listing, nav,
  landing-page section, and optional `venue`/`location` frontmatter.
- **`content/home/readme.md`** — a guide to the filesystem for anyone exploring
  with the shell. Real content, and a stable test fixture that no slug rename
  can break.
- All placeholder entries deleted.

### Fixed

- **The viewer rendered MDX comments as body text.** The first real content
  carried `{/* … */}` note blocks; MDX strips them, `react-markdown` did not.
  Working notes would have been visible in the OS. Partly closes
  [D-016](decisions.md) — the surfaces still differ on embedded components, no
  longer on comments.
- **`buildHomeDir` read every file as UTF-8**, so a PDF dropped in `/home` would
  have been inlined as mojibake. Text is inlined, everything else gets a `src`,
  matching how entry assets already worked.

### The recurring problem, fixed properly this time

Deleting the placeholders broke four unit tests and most of three E2E suites,
because they named specific writeups — `project-one`, `paper-one/figure.txt`.
That is the third time this class of brittleness has cost a debugging round.

The suites now assert on **properties rather than particular content**: every
entry has frontmatter and a stripped body, drafts are absent from listings and
present in the VFS, `ls` shows *some* directories. `verify-content` discovers a
published entry from the listing pages instead of naming one, and skips the
route-render checks with a printed message when everything is draft. The
viewer suite uses `/home/readme.md`, which no rename can move.

### Notes for the author

- **hq attribution needs checking.** Filtering the local repo by git identity,
  TLS, the executor, the client/worker split, per-client IDs, and shared-FS
  results are yours. Redis Streams/consumer groups, heartbeat telemetry, and
  subprocess-per-task are **not** visible as yours — flagged in that entry's
  notes. Attribution is the one portfolio error that actually costs something.
- `content/home/about.md` still describes the OS rather than the author. It is
  what the About app shows.
- Nothing is published, so five `verify-content` checks are skipped until the
  first entry flips to `draft: false`.

---

## 2026-08-12 — A writable filesystem

Plan: [plans/2026-08-12-writable-filesystem.md](plans/2026-08-12-writable-filesystem.md)

Scoped as *make the filesystem writable*, not "add mkdir" — `mkdir` alone is a
demo, and create-plus-delete-plus-move is what unblocks an editor app.

### Built

- **`unlink`** with three behaviours ([D-027](decisions.md)): removes what you
  created, **reverts** an edited published file rather than deleting it, and
  refuses an untouched one. That last rule is why this needed no tombstones and
  no schema bump — the base tree is rebuilt from `content/` on every load, so a
  file that only ever lived in the overlay never comes back.
- **`baseRoot`**, the tree as mounted, which is what lets the store answer "is
  this published?" Nearly free, because writes copy only the spine.
- **`applyOverlay` creates missing parents** on replay. A `mkdir` leaves no
  overlay entry of its own, so a shell-created directory has to be implied by
  the files inside it.
- **Five commands**: `mkdir [-p]`, `touch`, `rm [-r]`, `cp`, `mv`. Twenty-nine
  in total now.

### Two things the plan missed

**`mount()` had to start clearing the overlay.** Accumulated writes belong to
the tree they were made against; leaving them meant a "published" file could
look edited purely because an earlier test had written to it.

**`reset` was broken, and had been since D-019.** It cleared storage and
reloaded from inside the terminal — but the autosave flushes on `pagehide`, so
the reload wrote the session straight back after the clear. `reset` silently did
nothing whenever a save was pending, which is most of the time. Now the shell
performs it ([D-028](decisions.md)), stopping the autosave first. Same shape as
D-023: the app announces intent, the component with the right context acts.

Found by `verify-phase2` reporting three windows where it expected one — not by
reasoning about it.

### Verified

**357 unit tests**, including the three `unlink` behaviours and two persistence
round trips (created stays created, deleted stays deleted). `verify-phase2`
**29/29** with the round trip driven through a real reload; terminal 33/33,
content 7/7, viewer 8/8, WM 20/20.

---

## 2026-08-12 — Honest errors for unsupported operators

`tokenize` treated `|` and `>` as ordinary characters, so `ls | wc` parsed as
`ls` with arguments `['|', 'wc']` and reported
`ls: |: No such file or directory` — sending you to look for a file rather than
telling you what was actually wrong.

`findUnquotedOperator` now catches `|`, `>`, `>>`, `<`, `2>`, `&&`, and `||`
before dispatch, longest first so `>>` is not reported as `>`. Quoted operators
stay ordinary text, because `echo "a | b"` is a legitimate thing to type.

Not a step toward implementing them. Design doc §2 calls piping a scope-creep
magnet and is right about where the magnet is: `|` and `>` are bounded, but
`&&`, `$( )`, globs and variables are what follow. Worth noting the *original*
reason has expired though — it was written when nothing produced output worth
chaining, and there are now twenty-nine commands and a writable filesystem. If
it is ever built, the shape is already right: commands return `string[]` rather
than printing, which is exactly what a pipeline needs.

---

## 2026-08-12 — Pipes and redirection

Plan: [plans/2026-08-12-piping-and-redirection.md](plans/2026-08-12-piping-and-redirection.md)

Design doc §2 deferred these as a scope-creep magnet. Built, and recorded as a
deferral whose *reason* expired rather than a rule overruled ([D-029](decisions.md)):
it was written when there were eight read-only commands and no writable
filesystem, so `>` had nowhere to write and `|` had nothing worth chaining. §2 is
still right about where the magnet is, which is why the scope is three operators.

### Built

- **`pipeline.ts`**, a fourth pure module — `tokenize`, the split on `|`, `>`
  and `>>`, and `findUnsupportedOperator` for the ones still not implemented.
  The parser is where the bugs in this feature live, so it is a module with its
  own tests rather than a branch inside `runCommand`. Five syntax errors, each
  naming what is missing.
- **`stdin` on `ShellContext`**, read by `cat`, `grep`, `wc`, `head` and `tail`
  — **only when the command was given no path**. No flag: the absence of an
  operand is the signal, as in bash.
- **`sort` and `uniq`**, which the plan left optional. Taken: `sort | uniq` is
  the shape people expect, and piping without them is thin. Thirty-one commands.
- **Redirection**, `>` truncating and `>>` appending, resolved against the cwd.
  Onto published content it becomes an overlay edit that `rm` reverts, so
  [D-027](decisions.md) already covered it.
- **Tab completes a command after a `|`**, not a path. Not in the plan; a pipe
  is a command position and completing it against the cwd offered directories
  where no directory can go. It reuses `lastUnquotedPipe` rather than teaching
  the completer a second time what a quote is ([D-022](decisions.md), extended).

### What the plan did not anticipate

**A trailing newline was starting an empty line.** Found by the E2E check for
`>>`: `ls /papers > out.txt` then `tail -n 1 out.txt` printed a blank, because
`split('\n')` on `\n`-terminated content yields a final empty string. Cosmetic
until redirection existed — every redirect writes a terminated file, so `cat f`
disagreed with the pipeline that produced it and `wc f` counted one line more
than `ls | wc`. `toLines` in `commands/types.ts` is now the one place that
decides it: **a trailing newline terminates the last line rather than beginning
an empty one.**

Two doc bugs surfaced while reconciling: `architecture.md` claimed tab
completion was not implemented in the same section that describes how it works,
and `running.md` suggested typing `cd /papers && ls` — an operator this shell
rejects. Both fixed.

### Verified

**418 unit tests** (+56), including the parser's five syntax errors by message,
each stdin-consuming command with input, with a path, and with neither, and a
round trip asserting a file reads back as what was piped into it. All five
browser suites green: terminal **36/36** with three new checks, phase2 29/29,
WM 20/20, viewer 8/8, content 7/7. Build clean.

### Deliberately left out

`<`, `2>`, `&&`, `||`, `$( )`, globs, variables, job control, and **exit codes**.
A stage that fails halts the pipeline and its message becomes the whole output;
`$?` would need a status on `CommandResult` and a variable syntax to read it
with, which is the magnet §2 names. Each would be its own decision.

### Triggers checked

No `Revisit when` in [decisions.md](decisions.md) fired. The two that could
plausibly have: [D-011](decisions.md) (the `/os` payload) is untouched — this
adds no content — and [D-009](decisions.md) (Playwright not a dependency) still
has no CI behind it, though the terminal suite is now the one carrying the most
weight. [D-022](decisions.md) was *extended* rather than triggered: it has no
trigger, and its cost line (completion ignores quotes) is unchanged.

D-029 adds one: **revisit when something needs to know whether a command
succeeded** — the first thing exit codes would buy.
