# Architecture (as built)

What the code actually does, as of commit `7d53389`.

This is the companion to [personal-os-portfolio.md](personal-os-portfolio.md):
that file is the design and the intent, this one tracks the implementation and
is updated whenever the implementation moves. Where they disagree, this file is
right and the design doc needs a patch.

**Status:** foundation slice. Kernel, syscall boundary, registry, window
manager, two stub apps. No shell/terminal, no file viewer, no games, no SSG
content routes, persistence shaped but not wired.

---

## 1. Layer map

```
app/os/page.tsx           server component, metadata only
  └ app/os/OsShell.tsx    'use client' — seeds VFS, spawns first window
      ├ wm/WindowManager  subscribes to the pid list only
      │   └ wm/Window     one per pid; the only react-rnd consumer
      │       └ wm/AppErrorBoundary
      │           └ <app component from the registry>
      └ wm/Taskbar        launcher + one TaskbarItem per pid

registry/index.tsx        appId -> manifest, one literal dynamic() per app
hooks/kernel.ts           'use client' — React bindings, scoped selectors
kernel/*                  plain TS, no React import
content/index.ts          builds the base VFS tree
```

The dependency rule: **`kernel/` imports nothing from `apps/`, `wm/`,
`registry/`, or `hooks/`.** It does not know what an app is, only that something
asked to spawn a process or read a path.

---

## 2. Kernel

Three stores plus an API layer. All of `kernel/` is plain TypeScript using
`zustand/vanilla` — see [D-001](decisions.md).

### `kernel/vfs.ts`

```ts
type VFSNode = DirNode | FileNode | AppNode

DirNode   { type: 'dir',  name, children: Record<string, VFSNode>, meta? }
FileNode  { type: 'file', name, mime, content?: string, src?: string, meta? }
AppNode   { type: 'app',  name, appId, meta? }
```

`src` lets a large asset (a PDF) live in `/public` and stay out of the
serialized tree. `AppNode` makes launchables visible to the filesystem, so a
future shell gets `ls /apps` and `open /apps/about` without new machinery.

Pure path helpers, deliberately separate from the store so the shell can use
them and so they test without React: `normalize`, `join`, `resolvePath`,
`dirname`, `basename`, `resolve(root, path)`.

Two behaviours worth knowing:

- `normalize` treats `..` above the root as a no-op, as POSIX does, but
  preserves leading `..` on relative paths (which have no known root).
- `resolve` returns `null` rather than a node when the walk would descend
  *through* a file — `/notes.md/child` is not a path.

Writes copy only the spine of the tree (`setNode`), so untouched subtrees keep
their object identity. That is what makes selector-scoping possible at all.

### `kernel/process.ts`

```ts
Process {
  pid, appId, args, title,
  position: { x, y },
  size: { width, height },
  zIndex,
  state: 'normal' | 'minimized' | 'maximized'
}
```

Store also holds `focusedPid`, `nextPid`, `nextZIndex`. Focus and z-index are
owned centrally here, never per-window — design doc §2 warns that splitting them
is how z-index bugs appear.

**The load-bearing invariant:** every mutator leaves *untouched* process objects
referentially identical. `move`, `resize`, `focus`, and `setWindowState` rebuild
only the entry they change. Break this and every window re-renders on every
drag. Tested directly in `process.test.ts`.

Focus behaviour: `focus()` on a minimized window restores it; killing or
minimizing the focused window hands focus to the topmost survivor, not to
nothing; focusing the window already on top is a no-op that doesn't touch state.

### `kernel/events.ts`

`EventBus` over `Map<string, Set<handler>>`. `on()` returns its own unsubscribe
rather than exposing `off()` — `docs/gotchas.md` names uncleaned listeners as
the leak that kills a long-lived session, so the API hands you the cleanup you
need. `emit` iterates a copy, so a handler may unsubscribe mid-emit.

Currently emitted: `fs:changed` — `{ path, appId }`, on every `fs.write`.

### `kernel/api.ts` — the syscall boundary

`createKernelAPI(app: AppIdentity)` returns a handle closed over that app's
manifest. Every method calls `assertPermission` first.

```ts
fs.read(path)            → string | null   // file contents, not the node
fs.write(path, data)     → void            // also emits fs:changed
fs.list(path)            → VFSNode[]
fs.stat(path)            → VFSNode | null  // metadata: mime, src, appId

proc.spawn(appId, args?, title?) → number
proc.kill(pid)           → void
proc.focus(pid)          → void

window.move(pid, pos)              → void
window.resize(pid, dims, pos?)     → void   // pos when a top/left handle moved the origin
window.setState(pid, windowState)  → void

events.emit(name, payload)  → void
events.on(name, handler)    → Unsubscribe
```

Permissions: `fs.read` `fs.write` `proc.spawn` `proc.kill` `proc.focus`
`window.manage` `events.emit` `events.listen`.

`systemAPI` is a handle with all permissions, used by the WM and taskbar — they
are policy layers of the system, not apps running on top of it, but they still
go through the boundary rather than touching stores.

Deviations from the doc's §3 sketch, all additive:

| Doc §3 | As built | Why |
|---|---|---|
| `fs.read(path)` returns a node | returns file text; `fs.stat` returns the node | §8.2 uses `fs.read('/…/README.md')` as content |
| `proc.spawn(appId, args)` | `+ title?` | so the launcher can label an instance without the kernel knowing app names |
| `window: { resize, move }` | `+ setState` | minimize/maximize needed a path through the boundary |
| manifest holds `permissions` | split: kernel sees `AppIdentity { id, permissions }`, registry adds `name/icon/component` | keeps React types out of `kernel/` |

### `kernel/persistence.ts`

`SCHEMA_VERSION = 1`, a `migrations` map keyed by the version being migrated
*from*, and `migrate(raw)` that returns `null` — never throws — for junk, a
missing migration step, or a blob written by a newer build. Null means "start
fresh"; a returning visitor should never see a crash.

`snapshot()` / `hydrate()` move state in and out of `PersistedState`:

```ts
{ schemaVersion, overlay: Record<path, content>, session: { processes, focusedPid, nextPid, nextZIndex } }
```

The base tree is **not** in the blob — see [D-003](decisions.md).
`createLocalStorageAdapter` and `createMemoryAdapter` implement `StorageAdapter`.

**Not wired.** Nothing auto-saves yet. Phase 2.

---

## 3. Render topology

Who re-renders when, which is the whole performance story:

| Event | Re-renders |
|---|---|
| Window dragged (during) | **nothing** — react-draggable's internal state only |
| Window dragged (on release) | that one `Window` |
| Window resized (on release) | that one `Window` |
| Focus changes | the two `Window`s + two `TaskbarItem`s whose focus flipped |
| Window opens / closes | `WindowManager`, `Taskbar`, and the new/removed `Window` |
| Window minimized / maximized | that `Window` + its `TaskbarItem` |
| File written | only components subscribed to that path |

`WindowManager` subscribes to `usePids()` (shallow-compared array), so it holds
still through every drag, resize, and focus change. See [D-006](decisions.md).

---

## 4. App contract

An app is a default-exported component receiving:

```ts
{ pid: number, args: string[], kernel: KernelAPI }
```

The `kernel` handle is built from its manifest, so its permissions are baked in
and cannot be widened at the call site. Apps import nothing from `kernel/`
except types.

Adding one:

1. `apps/<name>/<Name>.tsx`, default export, typed `AppProps`
2. add a manifest to `registry/index.tsx` with a **literal** `dynamic()` import
   ([D-005](decisions.md))
3. optionally an `AppNode` in `content/index.ts` so it appears under `/apps`

No kernel change. That is the property design doc §3 is protecting.

Current apps, both deliberately thin:

- **`about`** — `['fs.read']`. Reads `/home/about.md` through the boundary
  rather than importing it, so the app→VFS path is proven. Has a "crash this
  app" button that throws during render, to demonstrate containment.
- **`sysinfo`** — `['fs.read', 'events.listen']`. Live kernel state; also exists
  so per-app code splitting is observable in the network tab.

---

## 5. Boot sequence

1. `/os` renders `OsShell` (client).
2. At **module scope**, `vfsStore.mount(buildContentTree())` — so the VFS is
   populated before first render and no window flashes an empty filesystem.
3. An effect spawns the `about` window, guarded by a module flag so React's
   development double-invoke doesn't open two.
4. `WindowManager` sees the new pid, mounts a `Window`.
5. `Window` resolves the manifest, builds a scoped `kernelAPI`, and renders the
   lazily-loaded component inside an error boundary.
6. The app calls `kernel.fs.read(…)`.

---

## 6. Known gaps

- **No SSG content routes.** `/projects/[slug]` and `/papers/[slug]` don't
  exist; `app/page.tsx` is a placeholder. Design doc §5 calls this the genre's
  most common failure — it is the top of the queue.
- **Persistence not wired** (§ above).
- **Permissions are per-app, not per-pid** — [D-004](decisions.md).
- **No accessibility work.** Design doc §5 asks for ARIA roles, per-window focus
  traps, and keyboard equivalents. Windows are divs; only the buttons are
  reachable by keyboard. Nothing here blocks it, but nothing implements it.
- **No mobile mode.** Design doc §5 wants a genuinely different full-screen
  single-app mode, not a responsive squeeze. Not started.
- **No URL sync.** Window/path state isn't reflected in the URL, so the back
  button does nothing. §5 warns this is hard to retrofit.
