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

**Revisit when** Phase 2 snapping/tiling lands, or react-rnd/react-draggable
majors bump.

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

## D-008 · 2026-08-12 · active
### Maximize ships; snapping and tiling do not

**Why.** D-002 made maximize nearly free. Snapping/tiling is a genuine WM
feature, and design doc §5 sets the rule: "no new WM feature until N apps exist
that actually need it." Two stub apps do not need tiling.

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
