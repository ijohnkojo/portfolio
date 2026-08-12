# Personal OS Portfolio — Foundation Slice

> **Status:** approved 2026-08-12 · implemented 2026-08-12 · commit `7d53389`
>
> Shipped with two deviations from the plan as written, both found while
> building and both recorded in [../decisions.md](../decisions.md):
>
> - **D-002** — drag/resize ended up using *controlled* react-rnd props written
>   only on stop, not the uncontrolled mode planned below. Same zero-re-render
>   property, and maximize stops requiring an app-destroying remount.
> - **D-007** — the in-titlebar render counter became a commit log, because
>   React 19's lint rules reject ref access during render.
>
> The verification section at the bottom is now automated as
> `scripts/verify-wm.mjs` (`pnpm verify`).

## Context

`/home/bothsides/projects/portfolio` is greenfield: no code, no git, only `docs/` with a design doc and a performance-gotchas note. The design doc specifies a web-based mock OS as the portfolio product, built on a UNIX mechanism/policy split — a dumb kernel (VFS, process table, event bus) with everything else bolted on as swappable policy.

The doc names one decision as *the* architectural bet (§3): apps never touch kernel state, only a scoped `kernelAPI`. Every later app depends on that boundary being right. So this session builds the foundation — scaffold, kernel, syscall boundary, registry, and a minimal window manager proving one window works end to end — and deliberately stops before the terminal, file viewer, and games. Content is placeholder MDX; real papers/projects get swapped in later.

Two decisions the doc left open are resolved here (§ Decisions), because the WM and `fs.write` path both hard-depend on them.

**Out of scope this session:** xterm.js terminal and command dispatcher, PDF/file viewer, games, auto-persistence wiring, SSG content routes beyond a stub. Phase 1 continues in a later session.

---

## Decisions

**1. Drag/resize: `react-rnd`, used *uncontrolled*.** The doc says "pick one" (react-rnd vs interact.js) and never picks.

`react-rnd` in uncontrolled mode (`default={{x,y,width,height}}`, commit on `onDragStop`/`onResizeStop`) is exactly the pattern `docs/gotchas.md:14` prescribes — it applies `transform: translate()` internally during the gesture and never touches React state until the pointer lifts. Passing a controlled `position` prop would re-render per mousemove and reintroduce the #1 jank cause; the plan forbids it.

Kernel stays source of truth for *persisted* geometry (matching §8.4). Live drag is ephemeral and imperative. Escape hatch: if Phase 2 snapping/tiling fights react-rnd's internal state model, the `Window.tsx` frame is the only file that knows about the library — swapping to interact.js or hand-rolled pointer events is a one-file change.

**2. `fs.write` target: storage adapter interface, localStorage overlay behind it.** The doc (§5) says decide now even if unbuilt.

VFS reads come from a static tree built from `/content` at build time (read-only base). Writes go to an overlay keyed by path. Both sit behind a `StorageAdapter` interface, so swapping localStorage for a real backend later is one implementation, not a rewrite of the write path. The interface and the localStorage adapter get written this session; auto-persist wiring stays Phase 2.

**3. `schemaVersion` from day one** (§5) — stamped into the persisted shape with a `migrate()` seam, even though there is only version 1.

---

## Build steps

### 1. Scaffold

```
pnpm create next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"
pnpm add zustand react-rnd
pnpm add -D vitest @vitejs/plugin-react
git init
```

`--no-src-dir` so root-level `/kernel`, `/apps`, `/registry`, `/wm` match the doc's §8.3 layout. Add a `.gitignore` entry for `.next/` (create-next-app handles this) and make an initial commit.

Pin the majors that land: Next 16.3.0, React 19.2.8, Zustand 5.0.14, react-rnd 10.5.3.

### 2. Kernel — `/kernel` (pure TS, no React imports)

The whole point is that this layer is serializable and framework-agnostic (doc §2). Nothing here may import from `/apps`, `/wm`, or `/registry`.

**`vfs.ts`** — node types + Zustand store.

```ts
type VFSNode = DirNode | FileNode | AppNode;
// DirNode:  { type: 'dir',  name, children: Record<string, VFSNode>, meta? }
// FileNode: { type: 'file', name, mime, content?: string, src?: string, meta? }
// AppNode:  { type: 'app',  name, appId, meta? }
```

`src` on `FileNode` lets large assets (PDFs) live in `/public` and stay out of the serialized tree — worth having before a PDF viewer exists.

Path helpers as pure exported functions, separate from the store so they're unit-testable: `normalize`, `join`, `dirname`, `basename`, `resolve(tree, path)`. These back `ls`/`cd`/`open` later.

**`process.ts`** — process table store.

```ts
interface Process {
  pid: number; appId: string; args: string[]; title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  state: 'normal' | 'minimized' | 'maximized';
}
```

Store holds `processes: Record<number, Process>`, `focusedPid: number | null`, and a monotonic `nextZIndex`. **Focus and z-index live here, never in per-window local state** (doc §2 warns z-index bugs appear fast otherwise).

Critically, export a *scoped* selector hook — `useProcess(pid)` — and use it in `Window.tsx`. `docs/gotchas.md:10` names unscoped selectors as a top risk: if each window subscribes to the whole table, every window re-renders on any window's move.

**`events.ts`** — pub/sub over `Map<string, Set<Callback>>`. `on(name, cb)` **returns an unsubscribe function**; `docs/gotchas.md:11` names uncleaned listeners as a session-killing leak, so the API shape should make cleanup the default path rather than an extra call.

**`api.ts`** — the syscall boundary (doc §3). Export a factory, not a singleton:

```ts
createKernelAPI(manifest: AppManifest): KernelAPI
```

It closes over the manifest and returns `{ fs, proc, window, events }` with the exact signatures in doc §3. Each method checks `manifest.permissions` before acting — an app without `fs.write` calling `fs.write` throws. Real plumbing, stub policy: with one user there's nothing to defend against, but the boundary is honest and Phase 3 doesn't require reworking every call site (doc §4).

**`persistence.ts`** — `SCHEMA_VERSION = 1`, the `PersistedState` shape (VFS + process table), a `migrate(state, from)` seam, the `StorageAdapter` interface, and a `localStorageAdapter` implementation. Not wired to auto-save this session.

### 3. Registry — `/registry/index.ts`

`appId -> manifest` map using `React.lazy` / `next/dynamic` for the component field. Every app is code-split from the start — `docs/gotchas.md:5` and doc §5 both flag that letting one app into the main chunk is how performance debt compounds. Manifest shape per doc §3: `{ id, name, icon, component, permissions }`.

### 4. Window manager — `/wm`

- **`Window.tsx`** — one window frame. The *only* file that imports react-rnd. Uncontrolled per Decision 1; `onDragStop`/`onResizeStop` call `window.move`/`window.resize`. Subscribes via `useProcess(pid)`. Mousedown anywhere on the frame calls `proc.focus(pid)`. Wraps its app child in an **error boundary** (doc §2) so one broken app can't take the session down.
- **`WindowManager.tsx`** — maps the process table to `Window` components. Renders only; never mutates (doc §8.4).
- **`Taskbar.tsx`** — minimal: one button per process, click to focus/restore.

### 5. Stub app + entry point

- `/apps/about/` — trivial component reading a placeholder file through `fs.read`, so the syscall boundary is exercised for real rather than assumed. Manifest declares `['fs.read']` only, and the plan verifies a `fs.write` call from it throws.
- `/app/os/page.tsx` — CSR entry (`'use client'`), mounts `WindowManager` + `Taskbar`, seeds the VFS, spawns the stub app.
- `/content/` — 2–3 placeholder MDX files so the VFS tree renders something real. Structure them at `/projects/*` and `/papers/*` so the future SSG routes and the `cd` paths in doc §8.2 line up.

---

## Critical files

| File | Role |
|---|---|
| `kernel/api.ts` | The syscall boundary — the decision everything else depends on |
| `kernel/process.ts` | Process table + **scoped** `useProcess(pid)` selector |
| `kernel/vfs.ts` | Node types + pure path helpers |
| `kernel/events.ts` | Bus where `on()` returns unsubscribe |
| `wm/Window.tsx` | Sole react-rnd consumer; the drag-perf pattern lives or dies here |
| `registry/index.ts` | Lazy manifest map |

---

## Verification

**Kernel unit tests** (`pnpm vitest`) — the kernel is pure TS, so this is cheap and it's the layer everything else trusts:
- `resolve` on nested paths, `..`/`.` normalization, missing paths, and resolving *through* a file node (should fail, not silently return).
- `createKernelAPI` permission gate: an `['fs.read']` manifest throws on `fs.write`.
- `events.on()` returned unsubscribe actually removes the listener.

**Manual, `pnpm dev` → `/os`:**
1. Stub app window mounts, renders content fetched via `fs.read`.
2. Drag it — motion is smooth, and position persists after release.
3. **The load-bearing check:** put a render counter in `Window.tsx`. Dragging must produce ~1 commit on mouse-up, not one per mousemove. If the count climbs during the gesture, Decision 1 was violated somewhere.
4. Spawn a second window, drag it, and confirm the *first* window's counter does not move — proves the scoped selector works.
5. Click between windows: focus ring and z-index both follow, driven by kernel state.
6. Throw inside the stub app's render — the error boundary catches it, the other window and taskbar survive.
7. Confirm in the network tab that the app's chunk loads on spawn, not on initial page load.
