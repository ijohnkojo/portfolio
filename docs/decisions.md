# Decision Log

Append-only. Each entry records a choice that constrains later work, and the
reason — the reason is the part that gets forgotten and re-litigated.

Format: **D-NNN** · date · status · the decision · why · what it costs.

Statuses: `active` · `superseded by D-NNN` · `revisit when …`

---

## D-001 · 2026-08-12 · active
### The kernel is plain TypeScript with no React import

`kernel/*` uses `createStore` from `zustand/vanilla`, not `create` from
`zustand`. React bindings live separately in `hooks/kernel.ts`.

**Why.** The design doc (§2) asks for kernel state that is "serializable to JSON
on its own, independent of the rendering framework." Importing React's `create`
would make that aspirational rather than true. The concrete payoff arrived
immediately: all 48 kernel tests run in a bare node environment with no jsdom
and no component harness.

**Cost.** One extra indirection — components call `useStore(processStore, sel)`
rather than `useProcessStore(sel)`. About three lines in `hooks/kernel.ts`.

---

## D-002 · 2026-08-12 · active
### Drag/resize uses react-rnd with *controlled* props, committed only on stop

The design doc §6 said "react-rnd or interact.js (pick one)" and never picked.
Picked react-rnd. The plan then specified *uncontrolled* mode; the implemented
version passes `position` and `size` as controlled props but only ever writes
them in `onDragStop` / `onResizeStop`.

**Why.** Reading `react-draggable`'s source settled it —
`Draggable.js:862`:

```js
const draggable = !controlled || this.state.dragging;
transformOpts = { x: canDragX(this) && draggable ? this.state.x : validPosition.x, … }
```

While `dragging` is true it renders from its **own internal state and ignores
the prop entirely**, then snaps to props on stop. So controlled props that are
never written mid-gesture produce exactly the same zero-re-render behaviour as
uncontrolled mode — and additionally make maximize a prop change instead of a
`key`-based remount that would destroy the app's state inside the window.

This is the mechanism behind `docs/gotchas.md`'s central rule: live drag is
imperative and local, persisted geometry is state.

**Cost.** Depends on an internal behaviour of react-draggable, not a documented
API. If that changes on upgrade, `pnpm verify`'s drag assertion catches it —
that check exists for this reason. `wm/Window.tsx` is the only file importing
react-rnd, so replacing it stays a one-file change.

**Revisit when** react-rnd/react-draggable majors bump.

**Trigger fired 2026-08-12 — reviewed, decision held.** Phase 2 snapping and
tiling both landed. The controlled-props approach did not fight them: snapping
reads geometry on drag-stop like everything else, and the snap preview is
imperative DOM precisely so it stays outside React's commit cycle.
`verify-phase2` asserts zero commits during a drag *with the preview running*,
so the contract is now checked under the harder case.

---

## D-003 · 2026-08-12 · active
### `fs.write` targets a localStorage overlay behind a StorageAdapter

The design doc §5 flagged "decide early whether `fs.write` targets a static JSON
tree or a real database." Decided: the base tree ships with the build from
`/content` and is read-only; writes accumulate in an overlay of
`path -> content`; only the overlay persists. Both sit behind a
`StorageAdapter` interface.

**Why.** Persisting the whole tree would mean every content edit staled every
returning visitor's session. Persisting only the diff means the two evolve
independently. The adapter interface means swapping localStorage for a real
backend is one new implementation, not a rewrite of the write path — which is
what §5 was actually worried about.

**Cost.** An overlay entry whose parent directory no longer exists is silently
dropped on replay (tested). That is the right failure, but it means a write can
vanish if content is restructured underneath it.

---

## D-004 · 2026-08-12 · active
### Permissions are declared per-app and checked on every syscall

`createKernelAPI(manifest)` closes over the manifest; each method calls
`assertPermission` before acting and throws `PermissionDeniedError` otherwise.

**Why.** Design doc §4 argues against building a real permissions system with
no second user — and that stays true. What is built is the *boundary*, not the
policy: with the checks in place, a plugin system later doesn't mean reworking
every call site. The manifest's `permissions` array stops being a stub without
becoming a security feature it doesn't need to be.

**Cost.** Permissions are per-app, not per-pid, so an app holding
`window.manage` can move any window, not just its own. Noted inline in
`kernel/api.ts`.

**Revisit when** anything runs that isn't first-party code.

---

## D-005 · 2026-08-12 · active
### The registry holds one literal `dynamic(() => import('…'))` per app

**Why.** Next 16's bundled docs (`node_modules/next/dist/docs/`,
lazy-loading guide) are explicit: the import path "can't be a template string
nor a variable," or Next cannot match the bundle back to the `dynamic()` call.
So the obvious `import(\`@/apps/${appId}\`)` silently defeats code splitting
rather than failing loudly. A static map is the only shape that works.

**Cost.** Adding an app means editing `registry/index.tsx`. That is still "write
a component, register a manifest" and never a kernel change, which is the
property design doc §3 actually cares about.

---

## D-006 · 2026-08-12 · active
### Every window and taskbar entry subscribes only to its own process

`useProcess(pid)`, `useIsFocused(pid)`, `usePids()`. Focus is exposed as a
**boolean per window**, never as the focused pid.

**Why.** `docs/gotchas.md` names unscoped selectors as a top-tier risk: if each
window subscribes to the whole process table, every window re-renders whenever
any window moves. Subscribing to `focusedPid` itself has the same shape of bug
for focus changes — `useIsFocused` re-renders only the two windows whose focus
actually flipped.

This only works because every mutator in `kernel/process.ts` leaves untouched
process objects referentially identical. That invariant is directly tested
(`process.test.ts`, "preserves the identity of untouched processes").

**Cost.** Mutators must be written carefully — a lazy `{...s.processes}` rebuild
that recreates every entry would quietly undo it. Hence the test.

---

## D-007 · 2026-08-12 · active
### Render instrumentation is a commit log, not a titlebar counter

The plan called for a visible render counter in `wm/Window.tsx`. Implemented as
a `useEffect` with no dependency array logging `[wm] pid N commit #M`, dev-only.

**Why.** React 19's `react-hooks/refs` lint rule rejects both writing and
reading `ref.current` during render, correctly — it makes the component's output
depend on something React doesn't track. A commit-time log is also the better
instrument: it timestamps, so you can see *when* commits happen relative to a
gesture rather than watching a number settle.

**Cost.** Requires DevTools open to read. `pnpm verify` automates the assertion.

---

## D-008 · 2026-08-12 · superseded by D-021 and D-023
### Maximize ships; snapping and tiling do not

**Why.** D-002 made maximize nearly free. Snapping/tiling is a genuine WM
feature, and design doc §5 sets the rule: "no new WM feature until N apps exist
that actually need it." Two stub apps do not need tiling.

**Superseded the same day.** Snapping shipped in
[D-021](#d-021--2026-08-12--active) and tiling in
[D-023](#d-023--2026-08-12--active), once there were four apps and a real
layout to serve. Kept rather than deleted because the deferral is the point:
the rule held the feature back until something needed it, which is the §5 rule
working rather than failing.

---

## D-009 · 2026-08-12 · active
### Playwright is not a project dependency

`scripts/verify-wm.mjs` resolves Playwright from a local install,
`PLAYWRIGHT_PATH`, or the npx cache, and drives system Chrome.

**Why.** It is a verification tool, not a test suite — it asserts things about
real browser behaviour (drag commits, chunk loading) that only matter when
checking the WM by hand. Adding a heavyweight dependency plus browser downloads
to `package.json` for that is not worth it yet.

**Revisit when** there is CI, or enough app surface that E2E tests should run on
every change.

---

## D-010 · 2026-08-12 · active
### Content is read from disk and rendered with `next-mdx-remote/rsc`, not compiled by `@next/mdx`

`lib/content.ts` reads `content/<collection>/<slug>/index.mdx` with `node:fs`,
parses frontmatter with gray-matter, and the route renders `entry.body` through
`<MDXRemote>`.

**Why.** The conventional `@next/mdx` setup needs
`import('@/content/papers/' + slug)` in a dynamic route, and per
[D-005](#d-005--2026-08-12--active) Next cannot match an interpolated import
path back to a chunk. The alternatives were code-generating a literal-import
registry, or reading the file.

Reading wins because it produces the raw MDX source as a side effect — and the
VFS needs exactly that string for `cat`. **One read on disk feeds both the
crawlable route and the filesystem**, instead of two pipelines that can quietly
disagree about what a paper says. MDX rather than plain Markdown because
`MDXRemote` still takes a `components` map, so a writeup can embed a live React
demo; `components/mdx.tsx` is where those get registered.

**Cost.** MDX is compiled at render rather than build-time-bundled, so a syntax
error in a writeup surfaces when that route is generated rather than at compile.
Since every published entry is prerendered by `generateStaticParams`, that still
means `pnpm build` fails — just later in the build than it otherwise would.

---

## D-011 · 2026-08-12 · active
### The VFS tree is built on the server and passed to the client as a prop

`app/os/page.tsx` is a server component that calls `buildVFSTree()` and renders
`<OsShell tree={tree} />`.

**Why.** It works at all only because the kernel's node types are plain
serializable data ([D-001](#d-001--2026-08-12--active), design doc §2) — the
constraint paying for itself. The alternative, fetching content over HTTP after
boot, would make the filesystem asynchronously populated and every app would
have to handle an empty tree.

Drafts are included in the tree but excluded from routes: hidden from the web,
not from the OS, so work in progress stays openable in the shell.

`/apps` is *not* built server-side — app nodes come from the registry, which
holds React components and is therefore necessarily a client module. `OsShell`
registers them on mount via the `mknod` primitive added for this.

**Cost, and it is a real one.** `kernel.fs.read` is synchronous, so all content
must be in memory client-side — **every published entry's full text ships in the
RSC payload for `/os`.** At portfolio scale (tens of KB) that is fine. It stops
being fine at hundreds of entries, and the fix is `FileNode.src` plus an async
read path — a kernel change, so it is recorded in architecture.md § known gaps
now rather than discovered later.

**Revisit when** the payload for `/os` gets uncomfortable, or a writeup needs to
embed something large.

---

## D-012 · 2026-08-12 · active
### Entry assets are mirrored into `public/content/` by a prebuild script

Non-MDX files sitting in an entry directory become `FileNode`s with `src` set
rather than inline content. `scripts/sync-content-assets.mjs` copies them to
`public/content/`, wired to `predev` and `prebuild`.

**Why.** An asset should live next to the writeup that uses it — that is the
point of directory-per-entry. But Next only serves `public/`. Mirroring keeps
authoring in one place while letting the files be served statically, and keeps
binaries out of both the RSC payload and the VFS.

**Cost.** `public/content/` is generated and gitignored, so a fresh clone must
run `predev`/`prebuild` before assets resolve. The script wipes the directory
before copying, so deleting an asset also removes the served copy.

---

## D-013 · 2026-08-12 · active
### A minimized window is hidden, not unmounted

`wm/Window.tsx` used to `return null` for `state === 'minimized'`. It now renders
as normal with `display: none`.

**Why.** Unmounting destroys everything the app was holding. For the two
stateless stub apps that was invisible; for a terminal it means losing the
scrollback, the working directory, and the command you were halfway through
typing. This was recorded as a known gap when the window state machine was first
drawn, and the terminal is the app that made it real.

It has to go through the `style` prop rather than a class: react-rnd sets
`display: inline-block` as an *inline* style, and only `style` is merged after
its own defaults — a `hidden` class silently loses.

**Cost, which `docs/gotchas.md` anticipated** — "too many windows open with
complex DOM apps inside — each one is a live component tree, not a frozen
screenshot." Minimized windows now hold live React trees. `display: none` means
no paint, no layout, and no hit-testing, so the cost is memory rather than frame
time, and that is the right trade for anything with state worth keeping.

Anything measuring itself must handle being 0×0 while hidden — the terminal's
`ResizeObserver` skips `fit()` at zero size for exactly this reason.

**Revisit when** an app is expensive enough to want the old behaviour. The
escape hatch is a manifest flag, not a WM change.

---

## D-014 · 2026-08-12 · active
### `proc.list()` added to the syscall boundary

`ps` needs to enumerate processes, and the API had no read path for the process
table — only `spawn`, `kill`, and `focus`. Added `proc.list()` behind a new
`proc.list` permission, returning a snapshot ordered by pid.

**Why it is worth recording.** It is the first genuinely new *capability* the
boundary has grown since it was designed, and it arrived because an app needed
it rather than from guessing up front. That is the manifest/registry model
working the way design doc §3 intended: the kernel gained a read primitive, and
no existing app's permissions changed.

**Cost.** Another permission to reason about, and `list()` copies the process
array on every call — fine for `ps`, wrong if anything ever polls it in a
render loop.

---

## D-015 · 2026-08-12 · active
### `open` resolves mime → app from the manifests, injected into the shell

A manifest declares `handles: ['text/markdown', 'image/*', …]`.
`registry/handlers.ts` holds the matching rule (exact beats wildcard, whatever
the registration order), `registry/index.tsx` binds it to the real manifests,
and `Terminal.tsx` passes it into `ShellContext` as `resolveHandler`.

**Why injected rather than imported.** `commands.ts` must keep running in bare
node; importing the registry would drag `next/dynamic` into it. Injection keeps
the command layer pure and lets tests supply a stub. The *data* stays on the
manifests, so a new file type is a manifest edit, never a change to the shell.

Two rejected alternatives: hardcoding the map in `commands.ts` (puts app
knowledge in the shell), and a handler table in the kernel (real OS concept, but
kernel surface for a single consumer — design doc §5's rule is no machinery
until something needs it).

**Cost.** `open`'s behaviour depends on what the host injects, so the unit tests
verify wiring against a stub rather than the real registry. The end-to-end
suite covers the real manifests. If a second consumer appears — a file manager,
desktop icons — promote this to a kernel-level table.

---

## D-016 · 2026-08-12 · active
### The viewer renders markdown with `react-markdown`, not MDX

Design doc §6 sanctions either. Routes compile MDX at build time through
`next-mdx-remote/rsc`; the viewer renders at runtime in the browser, where an
MDX compiler is a ~200KB dependency for a capability no writeup uses yet.

**Cost, and it is a genuine trap.** If a writeup ever embeds a React component,
the crawlable route renders it and **the viewer shows the raw JSX as text**. The
two surfaces would disagree — the same drift D-010 was designed to prevent for
content, reappearing at the render layer. Both consume the same component map
from `components/mdx.tsx`, which confines the divergence to JSX embeds
specifically. Recorded in known gaps.

**Partly closed 2026-08-12.** The first real content carried `{/* … */}` note
blocks — MDX strips them, `react-markdown` had never heard of them and rendered
an author's working notes as visible body text. The viewer now strips them too.
The surfaces still differ on embedded *components*; they no longer differ on
comments.

**Revisit when** a writeup actually needs an embedded component. The escape
hatch is runtime MDX evaluation inside the viewer.

---

## D-017 · 2026-08-12 · active
### PDFs render through `<embed>`, not react-pdf

**Why.** The browser's own PDF viewer already does paging, zoom, search, text
selection, and print. react-pdf is roughly a megabyte to reimplement that
worse. Design doc §6 offered both.

**Cost.** No control over the chrome, and rendering differs between browsers.

---

## D-018 · 2026-08-12 · active
### `dark:` responds to a `.dark` ancestor as well as the system preference

`globals.css` defines a custom `dark` variant covering both; `OsShell` carries
the class.

**Why.** The site is theme-aware and the OS is always dark. Without this, the
prose components shared between them (`components/mdx.tsx`) resolve their
*light* colours — dark text — on the viewer's near-black surface whenever the
visitor's system is in light mode. Unreadable, and invisible to anyone
developing in dark mode.

`verify-viewer.mjs` runs in `colorScheme: 'light'` for exactly this reason, and
resolves the computed colour through a canvas because Tailwind v4 emits `lab()`.

**Cost.** Two ways to be in dark mode. Anything that later wants an explicit
light-mode toggle has to reckon with both.

---

## D-019 · 2026-08-12 · active
### Persistence is wired: the write overlay and the window session, debounced

`startAutosave` subscribes to both stores and saves through the
`StorageAdapter` on a 400ms debounce. `OsShell` loads before starting it, so
hydrating doesn't immediately rewrite what it just read.

**What persists:** the write overlay ([D-003](#d-003--2026-08-12--active)) and
the session — processes, focus, and the pid/z-index counters.

**What does not: app-internal state.** A restored terminal comes back empty at
`/`. Persisting it needs a `serialize` hook on the app contract, which is a
Phase 3 shape. Recorded as a gap rather than built.

**Why debounced.** A drag commits geometry on mouse-up, closing several windows
fires several updates, and each save is a `JSON.stringify` over the whole
session. But a debounce means in-flight work is lost when the tab closes —
which is exactly when it most needs saving — so both the autosave and the
terminal's history writer flush on `pagehide` and on `visibilitychange` to
hidden. `pagehide` rather than `beforeunload` because it fires in cases
`beforeunload` does not, notably on mobile.

**Three failure paths, all degrading rather than breaking:** a process whose
`appId` is no longer registered is dropped on hydrate and the rest of the
session kept (focus moves to the topmost survivor); a corrupt or newer-schema
blob already returns null from `migrate` and boots fresh; and a session that is
somehow unusable is recoverable from inside the OS via **`reset`**, which clears
storage and reloads. An escape hatch that needs devtools is not an escape hatch.

**Cost.** Restoring windows means a bad session can persist across reloads.
`reset` is the answer, and it is listed in `help` so it can be found.

---

## D-020 · 2026-08-12 · active
### Shell history is a file in the VFS, not a separate store

`/home/.history`, read on spawn and appended on commit through `fs.write`.

**Why.** It needs no new storage mechanism: the write overlay already persists,
so history rides machinery that exists. It is also more honest to the design —
`cat /home/.history` works, which is what a user of a UNIX-shaped system would
reach for, and it makes the shell's own state inspectable with the shell's own
tools.

`ls` now hides dot-prefixed entries unless given `-a`, as it would anywhere
else; otherwise `.history` would be in the way in `/home` constantly.

**Cost.** The terminal is the first app to hold `fs.write` — it can now modify
the filesystem, where before nothing could. Writes are batched at 250ms and
flushed on `pagehide`, because appending on every committed line would churn the
overlay and the session save behind it.

---

## D-021 · 2026-08-12 · active
### Snapping computes on drag-stop; the preview is imperative

Zones from the pointer position: left edge → left half, right → right half, top
→ maximize, with the top winning in the corners. Also
**Alt+Shift+Arrow** from the keyboard, Down to restore.

**Why imperative.** The preview updates on every mousemove. Rendering it from
React state would put a commit inside the drag loop — precisely what
[D-002](#d-002--2026-08-12--active) and `docs/gotchas.md` forbid. So it is one
overlay element positioned by direct DOM writes, and `verify-phase2` asserts
**zero commits while the preview is live**, alongside the existing drag check.

**Why Alt+Shift+Arrow.** Super is grabbed by Windows and GNOME, Cmd+Arrow
navigates in browsers, Ctrl+Alt+Arrow switches workspaces on GNOME. The
terminal's custom key handler returns false for this chord so it bubbles to the
WM instead of reaching the line editor.

`preSnap` on `Process` holds the pre-snap geometry, so restore works and
dragging a snapped window away recovers its old size at the new position.
Re-snapping keeps the *original* geometry, so left → right → restore lands where
the window started rather than on the left half.

**Cost.** `Process` gains a field that only the WM understands, and the snap
zones are fixed halves — no quarters, no custom grid.

---

## D-022 · 2026-08-12 · active
### Tab emits an effect; completion is a pure module with `listDir` injected

`lineEditor.ts` maps Tab to `{ type: 'complete' }` and gains `setLine` to apply
the answer. `Terminal.tsx` builds a context and calls `complete()` in
`apps/terminal/completion.ts`, which takes directory listing as a function.

**Why.** Completion needs the filesystem; the line editor deliberately knows
nothing about it. Handing it a kernel handle would end its life as a pure
keystroke machine and make its tests need a VFS. Doing the work in
`Terminal.tsx` would put real logic back in the device driver, which is exactly
what the shell/terminal split exists to prevent. An effect keeps both halves
what they are, and completion is tested in bare node against a stub.

There is no double-tap tracking. Extending to the longest common prefix and
listing only when that adds nothing produces bash's behaviour with no extra
state: the first Tab on an ambiguous prefix changes nothing, so the second
lists.

**Cost.** Completion treats quotes as ordinary characters, so a path containing
a space completes badly even though `tokenize` handles quotes correctly. In
known gaps.

**Extended 2026-08-12 by [D-029](#d-029--2026-08-12--active).** A command name
is now expected after each unquoted `|` as well as at the start of the line, so
Tab there offers commands rather than the contents of the cwd. It reuses
`lastUnquotedPipe` from `pipeline.ts` rather than growing a second scanner that
knows what a quote is — the completer still does not parse, it asks.

This is one of two instances of the same pattern — see
[architecture.md § when a layer needs something it is not allowed to have](architecture.md),
which states the rule and when to prefer an effect over an event.

---

## D-023 · 2026-08-12 · active
### Apps request window-manager actions over the event bus; the WM decides

`tile` calls `kernel.events.emit('wm:tile', { mode })`. `OsShell` subscribes and
calls `applyTiling`. The app cannot move a window and does not know how big the
desktop is.

**Why.** The layout needs desktop bounds from the DOM and the whole process
table, while `commands.ts` is pure and has to keep running in bare node. Having
`Terminal.tsx` import the window manager would invert the layering the design
rests on. Another injected function like `resolveHandler` would work, but grows
`ShellContext` for every WM capability any app might ever want.

The bus was put there for exactly this — design doc §2: "pub/sub so WM, shell,
and apps communicate without direct references." Until now it carried only
`fs:changed`. It also makes the command testable by asserting an event fired,
with no DOM in sight.

**Cost.** Fire-and-forget: the shell prints `tiling: grid` whether or not
anything is listening. A request/response shape on the bus would fix that and is
not worth building for one caller.

`commands.ts` imports `TILE_MODES`/`isTileMode` from `wm/tiling.ts` — shared
vocabulary and a predicate, both pure. The *action* still goes over the bus; the
import is so there is one list of layout names rather than two that drift.

**Events now on the bus:** `fs:changed` `{ path, appId }`, `wm:tile` `{ mode }`.

The sibling of [D-022](#d-022--2026-08-12--active): same problem, different
mechanism. The rule and the choice between them are written up in
[architecture.md § when a layer needs something it is not allowed to have](architecture.md).

---

## D-024 · 2026-08-12 · active
### Command documentation lives on the command; the table is a directory

`commands.ts` became `commands/` — `types.ts`, `walk.ts`, `fs.ts`, `proc.ts`,
`system.ts`, `index.ts` — and `Command` gained a required `description` plus
optional `examples`, which `man` prints.

**Why the split.** Twelve commands became twenty-four and the file would have
been ~700 lines. Grouping by what a command touches (filesystem, processes,
system) means the imports of each group state its dependencies: `fs.ts` needs
path helpers and the walk, `proc.ts` needs the process API, `system.ts` is the
only one that knows tiling exists. `shell.ts` and the tests import `./commands`
either way, so nothing outside the directory moved.

**Why documentation on the command.** `help` has always been generated from the
table rather than hand-maintained, for the obvious reason. `man` extends that to
the long form: usage, description, and examples sit next to the `run` that
implements them, so they cannot drift apart in a separate manual.

It is also enforceable, and enforced — a test asserts **every command in the
table has a description of real length and produces a manual page**. A new
command cannot ship undocumented without failing the suite.

**Cost.** `description` is required, so adding a command means writing prose. That
is the point, but it is friction.

---

## D-025 · 2026-08-12 · active
### `rm` and `mv` are deferred until the VFS can express a deletion

**The problem, not the decision.** The VFS has no delete — no `unlink`, no
`rmdir`. Worse, the persistence overlay is `path → content`, i.e. writes only, so
a deletion **cannot be represented**: on reload the base tree is rebuilt from
`/content` and the file returns.

Making delete stick needs a tombstone set in `PersistedState` alongside the
overlay, applied after the replay, plus a `SCHEMA_VERSION` bump and a migration
— which the seam already supports ([D-019](#d-019--2026-08-12--active)).

**Why not now.** It is a kernel change, a schema change, and a decision about
whether deleting build-time content should even be possible, riding along with
twelve read-only commands. Kept separate deliberately.

Everything shipped so far only ever *adds* to the filesystem, which is why the
overlay has been sufficient this long.

**Amended 2026-08-12 after review — the scope above is wrong, and larger than
the problem.** Tombstones are only needed to delete something that came from the
*base tree*. If deletion is restricted to files the user created, deleting is
just **removing the overlay entry**: the base tree is rebuilt from `/content` on
every load, so a file that only ever lived in the overlay never comes back. No
tombstone, no schema bump.

The resulting rule is principled rather than a limitation, and is
[D-003](#d-003--2026-08-12--active) extended: **you can delete what you created;
you cannot delete what shipped with the build.** `rm` on published content fails
with `read-only: part of the published content`, which is true and useful.

That leaves a kernel `unlink` primitive as the only real work — tens of lines
rather than a migration.

**Resolved by [D-027](#d-027--2026-08-12--active)**, built as re-scoped. `rm`,
`mkdir`, `touch`, `cp`, and `mv` all exist; no tombstones, no schema bump.

---

## D-026 · 2026-08-12 · active
### Posters go with talks, not with papers

Three collections: `projects`, `papers`, `presentations`. Posters live in
`presentations` alongside talks, rather than in `papers`.

**Why.** The split is by artifact, and the deciding factor is metadata shape:

| | Wants |
|---|---|
| paper | authors, journal or preprint, DOI/arXiv, abstract |
| poster | event, location, date, PDF |
| talk | event, location, date, slides |

A poster shares almost nothing structurally with a paper and almost everything
with a talk — what makes it findable is *where and when it was presented*.
Filing posters under `papers` would produce a collection where half the entries
have a DOI and half have a venue.

**No `conferences` collection.** Attendance is not an artifact; there is no page
to write, and `/conferences/<event>` saying "I attended" is worse than no page.
Presenting produces an entry, attending is a CV line.

`presentations` rather than `talks` because it stays accurate the first time a
poster goes in, and it matches the heading readers in this field already scan
for — *Publications / Presentations*.

**Cost.** A talk about a paper means two entries that cross-link rather than one
page covering both. That is the correct shape — the talk and the paper are
genuinely different artifacts — but it is more upkeep.

Optional `venue` and `location` frontmatter were added for this collection. They
cost nothing, since only `title`/`summary`/`date` are required and `stat`
surfaces every metadata field automatically.

---

## D-027 · 2026-08-12 · active
### `unlink` has three behaviours, and that is what removes the need for tombstones

`vfsStore.unlink(path)`:

| Target | Result |
|---|---|
| overlay-created | removed, along with every overlay entry beneath it |
| published, but edited | **reverts to the published version** — an undo, not a delete |
| published, untouched | `EROFS: … is published content` |

**Why.** [D-025](#d-025--2026-08-12--active) originally scoped deletion as
needing tombstones in `PersistedState` and a schema bump. That is only true if
you can delete *published* content. Restrict deletion to what the user created
and it collapses to removing the overlay entry, because the base tree is rebuilt
from `/content` on every load — a file that only ever lived in the overlay never
comes back.

The rule is [D-003](#d-003--2026-08-12--active) extended: **you can only remove
what you added.** The middle row matters as much as the others — refusing to
remove an edit would be correct but useless, whereas reverting it is an undo
people actually want.

Implemented with `baseRoot`, the tree as mounted, kept by `mount()`. Nearly
free: writes copy only the spine, so the original base root object is still
intact rather than being a second copy. A directory absent from `baseRoot`
cannot contain published content, so checking the directory alone is sufficient
for `rm -r`.

**`applyOverlay` now creates missing parents on replay.** A directory created in
the shell leaves no overlay entry of its own, so it has to be implied by the
files inside it. Two consequences, both accepted:

- an **empty** directory does not survive a reload
- a write whose parent was deleted is now **preserved** by recreating the path,
  where it used to be silently dropped — data preservation over tidiness, and a
  deliberate reversal of the previous behaviour

**Cost.** `mount()` now clears the overlay, since accumulated writes belong to
the tree they were made against. Anything that mounted expecting writes to
survive would break; nothing did.

---

## D-028 · 2026-08-12 · active
### `reset` is performed by the shell, not the app that asked for it

`reset` emits `os:reset`; `OsShell` stops the autosave, clears storage, and
reloads.

**Why — this was a live bug, not a preference.** `reset` used to clear storage
and reload from inside the terminal. But the autosave flushes on `pagehide`
([D-019](#d-019--2026-08-12--active)), so the reload immediately wrote the
session straight back after the clear. `reset` silently did nothing whenever a
save happened to be pending, which is most of the time.

Only the shell holds the autosave handle, so only the shell can stop it first.
This is [D-023](#d-023--2026-08-12--active) again: the app announces intent, the
component with the right context performs it.

Found by `verify-phase2`, not by reasoning — the check that reset boots to a
single window started reporting three.

---

## D-029 · 2026-08-12 · active
### Piping and redirection ship — exactly `|`, `>` and `>>`

Design doc §2 deferred them: *"Piping/redirection: skip for V1, real scope creep
magnet."* Implemented, and the deferral is recorded as expired rather than
overruled.

**Why the original reason no longer holds.** It was written when the shell had
around eight read-only commands and no writable filesystem — `>` had nowhere to
write and `|` had nothing worth chaining. There are now thirty-one commands,
several genuinely composable, and `fs.write` exists. `grep -i physics / | wc` is
a thing a person types. Same shape as [D-008](#d-008--2026-08-12--superseded-by-d-021-and-d-023):
a deferral that was right when made, revisited when its premise changed rather
than left standing because it was written down.

**§2 is still right about where the magnet is,** which is why the scope is three
operators and not "shell syntax". `<`, `2>`, `&&`, `||`, `$( )`, globs,
variables, job control and exit codes are all still out, and
`findUnsupportedOperator` reports them by name. Each would be its own decision.

**It cost almost nothing, and that is a payoff rather than luck.** Commands
already *return* `string[]` instead of printing, because they were written to be
testable in bare node. A pipeline is exactly that shape, so `stdin` is one
optional field on `ShellContext` and the executor is a loop. Most toy shells
have to be rewritten to add pipes.

**Three rules that are not obvious:**

- **A command reads stdin only when it was given no path.** No flag: the absence
  of an operand is the signal, as it is in bash. A command with no use for stdin
  never looks, and that is not an error.
- **Only the last stage's `cwd`, `clear` and `reset` count.** `cd /x | wc` is
  nonsense; the earlier stages are producing text. Every stage runs against the
  cwd the line started in.
- **A trailing newline terminates the last line rather than beginning an empty
  one.** Redirects write `\n`-terminated files, so without this `ls > f` then
  `cat f` shows a blank line that is not in the listing, and `wc f` counts one
  more line than `ls | wc`. `toLines` in `commands/types.ts` is the single place
  that decides it.

**No exit codes.** A stage that fails halts the pipeline and its message becomes
the whole output. `$?` would need a status on `CommandResult` and a variable
syntax to read it with — which is the magnet.

**Redirecting onto published content is allowed.** The write lands in the
overlay as an edit and `rm` reverts it, so [D-027](#d-027--2026-08-12--active)
already covers it and no new rule was needed.

**Cost.** Parsing is now a real parser — `pipeline.ts`, with its own tests —
where it used to be `tokenize` plus a rejection list. Two more commands (`sort`,
`uniq`) exist mainly to make pipelines worth having, which is a mild widening of
"a shell for browsing a portfolio." And every command that takes a path is now
two commands in one, so its `description` has to say what it does with stdin.

**Revisit when** something needs to know whether a command succeeded — that is
the first thing exit codes would buy, and the point at which the three rules
above stop being sufficient.
