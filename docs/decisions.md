# Decision Log

Append-only. Each entry records a choice that constrains later work, and the
reason — the reason is the part that gets forgotten and re-litigated.

Format: **D-NNN** · date · status · the decision · why · what it costs.

Statuses: `active` · `superseded by D-NNN` · `revisit when …`

> **Paths before D-037 predate the move of the OS into `os/`** (2026-09-27).
> Where an entry says `kernel/`, `wm/`, `apps/`, `registry/` or `hooks/`, the
> code is now under `os/`; `app/os/OsShell.tsx` is `os/OsShell.tsx`; and
> `buildVFSTree` moved from `lib/content.ts` to `os/vfsTree.ts`. The entries
> themselves are left as written — this log is append-only. Link targets were
> updated so they still resolve; no wording was changed.

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
[architecture.md § when a layer needs something it is not allowed to have](os/architecture.md),
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
[architecture.md § when a layer needs something it is not allowed to have](os/architecture.md).

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

---

## D-030 · 2026-08-12 · active
### The desktop is a view of `/desktop`, a real directory in the VFS

Icons are the contents of `/desktop`. `cp x /desktop` puts one there, `ls
/desktop` lists them, `rm` takes one off. There is no icon registry.

**Why.** The alternative — a list of icons in component state or a separate
store — is a second source of truth that has to be kept in step with the
filesystem forever. Making the desktop a *view* means the shell and the desktop
are two windows onto one tree, which is the same mechanism/policy split the
kernel and the WM already use. It also means the desktop needed no new kernel
surface at all: `mkdir`, `list`, `write` and `unlink` already existed.

**Icon positions live in `/desktop/.positions`**, a dotfile riding the write
overlay — the third use of [D-020](#d-020--2026-08-12--active)'s trick, after
`/home/.history`. It persists for free, `cat /desktop/.positions` works, and a
corrupt file degrades to the default arrangement rather than breaking the
desktop. Dotfiles are hidden from the desktop exactly as `ls` hides them, which
is what lets the file live inside the directory it describes.

**Cost, and it is real.** `mknod` leaves no overlay entry, because the overlay
is `path → content` and an app node is not content. So the seeded application
shortcuts are re-created on every boot: `rm /desktop/terminal` works for the
session and the icon comes back on reload. Files you `cp` there are content and
persist normally.

The fix would be inventing a shortcut *file* format so launchers become
overlay-persistable — a new node shape in everything that walks the tree, to
make deleting a default icon stick. Not worth it. Same shape as "an empty
directory does not survive a reload" under
[D-027](#d-027--2026-08-12--active), and the same underlying cause.

**Revisit when** the desktop needs to hold something that is neither a file nor
an app node.

---

## D-031 · 2026-08-12 · active
### Icon drag obeys the window-drag rule: imperative during, committed on drop

During a drag the position is written straight to the element's `transform`. On
drop, one write to `/desktop/.positions`. There is no `setState` in
`onPointerMove`.

**Why.** This is [D-002](#d-002--2026-08-12--active) and `docs/gotchas.md`'s
central rule arriving on a second surface. Icons are cheaper than windows, but
the failure mode is identical and worse in aggregate: a `setState` per
pointermove commits every icon on the desktop, every frame, for the whole
gesture. The snap preview ([D-021](#d-021--2026-08-12--active)) writes the DOM
directly for exactly this reason, and this is the same technique a third time.

`wm/Desktop.tsx` carries the same dev-only commit counter `wm/Window.tsx` does
([D-007](#d-007--2026-08-12--active)), and **`verify-desktop.mjs` asserts zero
commits across fifteen pointer moves** — measured, not asserted in prose. The
drop itself commits, which is how you can tell the instrument works.

A 4px threshold separates a click from a drag, so selecting an icon does not
rewrite the positions file.

**Cost.** The gesture is invisible to React, so anything that wants to react to
an icon *while* it is moving — a drop target, a snap-to-grid preview — has to be
imperative too, or go through the same commit-on-end seam. That is the price the
rule has always carried, now paid in two places.

---

## D-032 · 2026-08-12 · amends D-015
### `resolveHandler` stays injected — the trigger was written from the wrong premise

[D-015](#d-015--2026-08-12--active) said: *"If a second consumer appears — a
file manager, desktop icons — promote this to a kernel-level table."* Both
appeared. **The answer is no.**

The reason `resolveHandler` is injected was never the number of consumers. It
was that `commands/` has to keep running in bare node, and importing
`registry/index.tsx` would drag `next/dynamic` into it. The desktop and the file
manager are browser components — they can import `findHandlerFor` directly and
nothing is compromised. A kernel-level table would put app knowledge in the
kernel to serve callers that never needed it, breaking invariant 1 to solve a
problem nobody has.

**What was real** is that "what does opening this node mean" was about to exist
in three places. That is now `registry/launch.ts` — pure, with the resolver
passed in, so every surface shares the resolution. It returns **null for a
directory on purpose**: the shell errors, the desktop opens Files, Files
descends. Three callers, one resolution, three honest opinions about folders.

**The lesson worth keeping:** a revisit trigger records the *symptom* someone
expected, not the reason. When one fires, re-derive the reason before acting on
the instruction — this one would have had us move code into the kernel to
satisfy a sentence.

---

## D-033 · 2026-08-12 · active
### The viewer stays the default for text; the editor is reached explicitly

`editor` declares **no `handles`**. The viewer keeps `text/markdown`,
`text/plain` and `application/json`, so `open notes.md` and double-clicking an
icon both still open the viewer. The editor is reached by intent: right-click →
Edit on the desktop and in Files, or the viewer's own **edit** button.

**Why not just give the editor the mimes.** `findHandlerFor` resolves two
*exact* claims on the same type by registration order — silently, and
differently depending on where in `registry/index.tsx` someone added a line. A
coin-flip decided by file order is the worst possible answer to "what opens
this?"

**Why not add a priority field.** That is machinery for one caller, which design
doc §5 rules out. And it would be solving the wrong problem: **open and edit are
different intents**, which every real desktop distinguishes. Modelling them as
one action that needs a tiebreak is the mistake.

**Enforced, not remembered.** `registry/handlers.test.ts` now asserts that no
two manifests claim the same exact mime, against the real registry — which
turned out to import cleanly in bare node, because `next/dynamic`'s inner
`import()` is lazy and never runs there. The guard was checked by temporarily
giving the editor `text/markdown` and watching it fail with
`editor and viewer both claim text/markdown`.

**Cost.** There is no "open with" and no way to change the default — an editable
file has one opener and one editor, both fixed. And the viewer needed
`proc.spawn` added to its manifest to hand a file over, so an app that used to
be purely `fs.read` can now start processes.

**Revisit when** a third app wants the same type, or when a file type exists
that should open in the editor *by default* — a `.txt` note, say. The answer
then is probably a per-type default the user can set, which is Settings' job.

---

## D-034 · 2026-08-13 · active
### Settings are a file every surface subscribes to — no event, no store

`/home/.settings` holds wallpaper, accent, icon size, and whether the desktop
shows dotfiles. `OsShell`, `Desktop` and `apps/settings` all read it with
`useFileText`. **Writing it is applying it.**

**This departs from the plan, which specified an `os:settings` event on the bus**
following [D-023](#d-023--2026-08-12--active). That was the wrong pattern here.
D-023 is for an app that wants something *done* it cannot do itself — `tile`
needs desktop bounds and the whole process table. Settings does not want
anything done; it wants a value known. That is shared state, not a request, and
the bus would be a second mechanism carrying what the filesystem already
carries.

**What subscribing buys, and it is the point:**

```
echo '{"wallpaper":"ink"}' > /home/.settings
```

changes the wallpaper. So does opening the file in the editor and saving, and so
does `rm /home/.settings` — which restores the defaults. The settings app is an
*editor for a file*, exactly as the terminal is an editor for `/home/.history`,
rather than a privileged pane that owns configuration.

It is the third use of [D-020](#d-020--2026-08-12--active)'s trick after history
and icon positions, and by now that is simply how this OS persists small things.

**The accent is published as a CSS custom property** on the OS root, so the
taskbar and the desktop icons use the colour without it being threaded through
as a prop. One assignment, two consumers, no plumbing.

**Parsing degrades field by field.** A settings file is a dotfile in a writable
filesystem; anything can `echo nonsense >` it and the editor can save it
half-written. One bad field falls back on its own, keeping the rest. A desktop
that will not paint is a far worse failure than a lost accent colour.

**Cost.** Every surface parses the JSON on each render rather than sharing one
parsed object — cheap at four fields, and it keeps the data flow one-directional.
And `OsShell` now re-renders when that file changes, where before it rendered
once; the change is rare and the subtree is small, but it is no longer a
render-once component.

---

## D-035 · 2026-08-13 · active
### `useCallback` came out of `wm/Desktop.tsx` rather than being worked around

Adding a second `useFileText` subscription made React Compiler's
`react-hooks/preserve-manual-memoization` rule refuse to compile the component:
it could not verify the manual dependency arrays. The fix was to **delete the
`useCallback`s**, not to satisfy the rule.

**Why that is right rather than expedient.** Nothing those callbacks were passed
to is `React.memo` — `DesktopIcon` is a plain function component, so it
re-renders with its parent regardless of prop identity. The memoization was
buying nothing at runtime and had never been measured. The lint rule surfaced
cargo-cult memoization, which is what it is for.

**The drag contract does not depend on it**, and that is the thing to check
before touching anything in this file: a gesture produces *no renders at all*
([D-031](#d-031--2026-08-12--active)), so callback identity cannot affect it.
`verify-desktop` still measures zero commits across fifteen pointer moves.

**Cost.** If `DesktopIcon` is ever wrapped in `React.memo`, these have to come
back — and then the memo and the callbacks have to be added together, or the
memo does nothing. Worth knowing that the two are a pair.

**Note:** React Compiler is *not* enabled in `next.config.ts`; the rule ships
with `eslint-config-next` regardless. If the compiler is ever turned on, it
memoizes this component itself and the deletion becomes a straight win.

---

## D-036 · 2026-09-15 · active
### The bio is a file, read by both surfaces — not a page with a copy in the shell

`content/home/whoami.md` is the only place the bio exists. The web route
`/about` reads it through `getHomeFile()`; the shell's `whoami` reads it through
`kernel.fs.read`. Neither owns it.

**Why this rather than a React page with prose in JSX.** The obvious
implementation is an `/about/page.tsx` containing the text, plus — if the OS
should also answer `whoami` — a second copy inside the shell. Two copies of a
bio drift the moment one is edited, and the drift is invisible: nothing fails,
the site simply starts disagreeing with itself about who wrote it.

This is [D-010](#d-010--2026-08-12--active)'s rule (one read on disk, two
surfaces) applied to a **singleton** rather than a collection. The differences
from an entry are all subtractions: no slug, no listing, no `draft` flag,
because there is nothing to choose between. `getHomeFile()` is correspondingly
smaller than `readEntry()` — no required-field validation, since there is no
frontmatter to get wrong.

**`whoami` gets a command; `now` does not.** Typing `whoami` into a terminal is
a reflex, so it is the one piece of prose here a visitor finds without being
told — that is what the command buys. `now.md` is reachable by `cat /home/now.md`
like any other file, and a `now` command would be a synonym for `cat` with a
path baked in. The rule: a command earns its place when it makes something
*discoverable*, not when it saves typing.

**Cost.** `content/home/` now has two kinds of file in it — `about.md`, which
the About app reads, and `whoami.md`/`now.md`, which the web also renders — with
nothing in the directory marking which is which. `buildHomeDir()` treats them
identically, correctly, but someone adding a third file will not know from the
filesystem whether the web is expected to serve it. If that set grows past
three, it wants either a convention or its own directory.

**Revisit when** a second singleton needs a web route, or when a `content/home`
file needs frontmatter — at that point `getHomeFile()` is doing enough of
`readEntry()`'s job to be worth merging with it.

---

## D-037 · 2026-09-27 · active
### The OS is a separate, frozen project in `os/`; the site never imports it

`kernel/`, `wm/`, `apps/`, `registry/`, `hooks/` and `OsShell.tsx` moved into
`os/`, and `buildVFSTree` moved from `lib/content.ts` to `os/vfsTree.ts`. The
dependency runs one way: the OS reads `content/` through `lib/content.ts`, and
nothing outside `os/` and `app/os/` imports the OS. `lib/boundary.test.ts`
asserts both directions — no site file imports `@/os`, and the OS reaches into
the site only through an allowlist (`lib/content`, `lib/memo`, and
`components/mdx` for the viewer's prose styling, per
[D-018](#d-018--2026-08-12--active)).

**Why.** The site is being rebuilt around a knowledge graph of the work, and
the OS stops being the site's framing and becomes one project in it — "some
web OS I built", reachable from its node and its project page. It is kept, not
removed, and frozen until OS work resumes, when it may change direction
entirely. Moving it into its own directory makes the top level describe the
site, and makes "frozen" enforceable rather than a promise: the site cannot
come to depend on something that may be rewritten.

It was cheap because the coupling already ran almost entirely the right way.
Before the move the site depended on the OS in exactly one line —
`lib/content.ts` importing `dir`/`file` from the kernel to build the VFS — and
that function belongs to the OS anyway. The move was paths only: 67 files,
import specifiers rewritten, no logic touched, and every one of the 465 tests
outside the content split and all 148 browser checks passing identically
before and after.

The OS's docs moved to `docs/os/` with a frozen banner. Its design doc was
**not** re-framed: it is the design record of a separate project, and
patching it to fit the site would erase what it was.

**Cost.** Paths in D-001 … D-036, in older plans, and in the frozen docs name
the pre-move locations; a note at the top of this log and a banner on each
frozen doc translate them. The registry's literal `dynamic()` imports now read
`@/os/apps/…` — still literal, so [D-005](#d-005--2026-08-12--active) holds.
The OS keeps its tests running while frozen, so a site change that breaks it
still fails `pnpm test`; that is intended, and is the price of keeping it
alive rather than archived.

**Revisit when** OS work resumes — the backlog is `docs/os/backlog.md` — or if
the OS ever needs something from the site beyond the allowlist.

---

## D-038 · 2026-09-27 · active
### Pipeline behaviour is tested on fixture content, not on whatever is published

Tests that check how the pipeline *behaves* — drafts are hidden from the web,
drafts stay in the VFS — run against `lib/__fixtures__/content/`, which holds
exactly one published entry and one draft. `loadFixtureContent()` gets them a
second, independent copy of `lib/content.ts` by importing it afresh with
`process.cwd()` pointed at `lib/__fixtures__/`. Tests about *real* content
(slugs are kebab-case, titles are colon-free, every directory is a declared
collection) still read `content/` through the ordinary import.

**Why.** Two draft tests read real content and required it to contain a draft.
When every entry was published on 2026-09-27 (`516e366`), they failed — not
because drafts had stopped working, but because there was nothing left to test
against. Publishing an entry is an editorial act; it should not be able to turn
the test suite red, and a test that passes or fails according to this week's
content checks the content, not the code. A test on the fixture's own shape
("one published, one draft") stops it from quietly drifting into testing
nothing.

**Why a fresh import rather than a directory parameter.** The first version
exported `createContentReader(dir)`. `pnpm build` then warned that dynamic
filesystem access made Turbopack **trace the whole project** — every source
file and `public/` — into the server output, because a directory passed as an
argument is invisible to its static analysis. `path.join(process.cwd(),
'content')` computed inside the module is what keeps tracing scoped to
`content/`. So the module keeps that shape, and the test seam lives in the
test instead.

**Cost.** `lib/content.ts` must keep computing its directory from
`process.cwd()` at import time, or the fixture copy silently reads real
content — the fixture-shape test is what would catch it. The fixture tree must
stay valid as the loader changes: a new required field means updating two
fixture files. And real content is no longer checked for draft behaviour, only
the fixture is; the loader is the same code either way, which is why that is
acceptable.

**Revisit when** a pipeline behaviour depends on something the fixture cannot
express — an asset, a presentation's venue, a `content/home` file.
