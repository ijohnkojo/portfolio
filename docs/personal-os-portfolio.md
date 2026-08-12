# Personal OS Portfolio — Design Doc

A web-based mock operating system serving as a personal portfolio product. Modeled philosophically after Slackware/classic UNIX: mechanism over policy, small composable pieces, nothing automated behind your back.

---

## 1. Design Philosophy

The core idea borrowed from UNIX (and specifically Plan 9 / X11): **mechanism, not policy**.

- The **kernel** provides primitives only — a virtual filesystem, a process/window table, an event bus. It stays deliberately dumb about how things look or behave.
- Everything else — the window manager, the terminal's command set, individual apps — is **policy**, bolted on top, swappable.
- This split is what makes "limited to what I have there and what I allow" actually true: the kernel only knows about objects you've registered, nothing more.

Secondary influence: the **desktop/window metaphor** (icons, draggable windows, taskbar) comes from Xerox PARC / early Mac — a separate lineage from UNIX, layered on top as one possible "policy" implementation.

Reference implementations worth dissecting (not necessarily reusing): **daedalOS** (React, real VFS, WM, terminal), **Puter.com**, **os.js.org**.

---

## 2. Layer Breakdown

### Kernel layer (state, not rendering)
A JS/TS object graph, not a component. Three things live here:

- **VFS** — tree of nodes: `{ type: 'dir' | 'file' | 'app', path, meta, content }`. Papers and projects are nodes; `cd /projects/hq` walks this tree.
- **Process table** — flat map of open windows: `{ id, appId, position, size, zIndex, state: 'normal'|'minimized'|'maximized', focused }`.
- **Event bus** — pub/sub so WM, shell, and apps communicate without direct references.

Kernel state should be serializable to JSON on its own, independent of the rendering framework.

### Shell / terminal
- **xterm.js** handles emulation (cursor, scrollback, ANSI) — don't hand-roll this.
- A small command dispatcher on top: tokenize input → look up in a command table (`ls`, `cd`, `cat`, `open`, `help`, ~8 commands to start) → call function → read/write kernel state.
- Piping/redirection: skip for V1, real scope creep magnet.

### Window manager
- Renders the process table; doesn't own state.
- Drag/resize via **react-rnd** or **interact.js** — pick one.
- Focus management (click-to-front, last-focused tracking) must live centrally in the kernel, not per-window local state, or z-index bugs appear fast.

### Apps
- Self-contained components, each given a window "slot."
- Read/write only through the kernel's API — never reach into another app's state directly.
- Wrap each in an error boundary so one broken app doesn't crash the session.

---

## 3. The Syscall Boundary (core architectural decision)

Since the OS is the product — not just a portfolio wrapper — apps must never touch kernel state directly. They talk through a fixed API:

```ts
// kernel exposes this to every app instance
const kernelAPI = {
  fs:     { read(path), write(path, data), list(path) },
  proc:   { spawn(appId, args), kill(pid), focus(pid) },
  window: { resize(pid, dims), move(pid, pos) },
  events: { emit(name, payload), on(name, cb) }
}
```

Every app declares a manifest:

```ts
{
  id: 'terminal',
  name: 'Terminal',
  icon: '/icons/term.svg',
  component: TerminalApp,
  permissions: ['fs.read', 'fs.write']
}
```

A central **app registry** maps `appId -> manifest`. Adding a new app later becomes "write component, register manifest" — never a kernel change. This is the actual product architecture decision; everything else is detail.

---

## 4. Phased Build

**Phase 1 (ship this)**
VFS, process table, WM, shell with ~8 commands, 2–3 real apps (terminal, file/PDF viewer, one game), your content loaded as VFS nodes.

**Phase 2**
Persistence (localStorage, versioned schema), more apps, window snapping/tiling, command history/autocomplete.

**Phase 3 (only if actually wanted)**
Accounts/auth for cross-device persistence, a plugin system for redeploy-free app additions, a real backend VFS instead of a static JSON tree.

Don't build Phase 3 primitives now. A permissions system with no second user is complexity with no payoff yet — the manifest's `permissions` array is stub enough to avoid painting into a corner.

---

## 5. Gotchas

- **SEO/crawlability** — papers/projects need real server-rendered routes (Next.js SSG) independent of the client-rendered OS shell. The OS is a client for browsing content that has real URLs, not the only way in. Most common failure mode in this genre.
- **Mobile** — a draggable-overlapping-windows metaphor is desktop-first by nature. Build a genuinely different mobile mode (full-screen single-app), not a responsive squeeze.
- **Accessibility** — div-based windows break screen readers/keyboard nav by default. Needs ARIA roles, focus traps per window, keyboard equivalents for open/close/switch.
- **Scope creep** — "OS as product" is unbounded. Set a rule: no new WM feature until N apps exist that actually need it.
- **Schema-version state from day one** — VFS and process-table shape will change as you extend this over years. A `schemaVersion` field plus a small migration function prevents breaking every returning user's session.
- **Persistence backend** — decide early whether `fs.write` targets a static JSON tree or a real database, even if you don't build the database yet. This affects how swappable the write path is later.
- **Performance debt compounds** — keep apps lazy-loaded through the registry; don't let "just one more app" get bundled into the main chunk because it was faster to wire up.
- **Back button / deep linking** — sync window/path state to the URL (`#/projects/hq`) or browser history will feel broken in a way that's hard to retrofit.
- **Sandboxing theater** — since it's all your own code, isolation is about crash containment (error boundaries), not security. Don't burn time on iframe sandboxing you don't need.

---

## 6. Stack for V1

**Framework/rendering**
- Next.js (React) — SSG for content routes (SEO), CSR for the OS shell
- TypeScript — non-negotiable; kernel/API boundary work gets messy fast in plain JS
- Tailwind CSS — fast iteration on window chrome, taskbar, icons

**State/kernel**
- Zustand — process table, VFS, focus state
- Plain JS/TS objects for the VFS tree itself (serializable, framework-agnostic)

**Terminal/shell**
- xterm.js — terminal emulation
- Custom command parser/dispatcher (plain TS)

**Windowing**
- react-rnd or interact.js (pick one) — drag/resize
- CSS for z-index/focus styling, driven by kernel state

**Content**
- MDX or plain Markdown — papers/project writeups as VFS file nodes (`react-markdown` or `next-mdx-remote`)
- PDFs as static assets — `react-pdf` or `<embed>`

**Persistence (Phase 2, decide now)**
- localStorage to start, versioned schema (`schemaVersion` key)

**Deployment**
- Vercel — trivial with Next.js, free tier sufficient for V1

Avoid adding a state machine library (XState) or a game engine until an app actually needs it — canvas + `requestAnimationFrame` covers most simple games.

---

## 7. UNIX / Slackware Resources

- **The Art of Unix Programming** (Eric S. Raymond, free online) — the actual "mechanism not policy," small-tools, everything-is-a-file philosophy, from someone who lived it. Read chs. 1–2 and the "Unix Philosophy" section.
- **Slackware's philosophy page** (slackware.com) — short; explains the refusal of dependency-resolving package managers and automated config. Useful for keeping the kernel intentionally "dumb."
- **UNIX: A History and a Memoir** (Brian Kernighan) — optional; the *why* behind the design choices, from an original author of the tools.

Everything in this doc — VFS as the spine, small composable shell commands, WM as policy bolted onto mechanism — is ESR's argument, implemented in TypeScript instead of C.

---

## 8. Architecture

### 8.1 System diagram

```
┌───────────────────────────────────────────────────────────────┐
│                         BROWSER (client)                      │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐     │
│   │                    WINDOW MANAGER                    │     │
│   │   renders process table → draggable/resizable        │     │
│   │   windows, taskbar, focus ring                       │     │
│   └───────────────────────┬───────────────────────────────┘   │
│                            │ reads/dispatches via kernelAPI    │
│   ┌────────────────────────▼───────────────────────────────┐  │
│   │                     APP REGISTRY                       │  │
│   │   appId -> manifest { component, icon, permissions }   │  │
│   └───────┬───────────────┬───────────────┬────────────────┘  │
│           │               │               │                   │
│      ┌────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐             │
│      │ Terminal│    │ PDF/File  │   │  Game(s)  │  ...more    │
│      │  (app)  │    │  Viewer   │   │   (app)   │  apps later │
│      └────┬────┘    └─────┬─────┘   └─────┬─────┘             │
│           │               │               │                   │
│           └───────────────┼───────────────┘                   │
│                            │ ONLY via kernelAPI (syscall       │
│                            │ boundary — no direct state access)│
│   ┌────────────────────────▼───────────────────────────────┐  │
│   │                        KERNEL                          │  │
│   │  ┌────────────┐  ┌───────────────┐  ┌───────────────┐  │  │
│   │  │    VFS     │  │ Process Table │  │  Event Bus     │  │  │
│   │  │ (Zustand)  │  │  (Zustand)    │  │  (pub/sub)     │  │  │
│   │  └────────────┘  └───────────────┘  └───────────────┘  │  │
│   └───────────────────────┬──────────────────────────────┘   │
│                            │ persist/hydrate (versioned)      │
│                    ┌───────▼────────┐                         │
│                    │  localStorage  │  (Phase 2)               │
│                    └────────────────┘                         │
└───────────────────────────────────────────────────────────────┘
                             ▲
                             │ SSG-rendered, crawlable
                    ┌────────┴─────────┐
                    │   Next.js routes │
                    │  /projects/hq    │
                    │  /papers/hscp    │
                    │  (real URLs, SEO)│
                    └──────────────────┘
```

### 8.2 App launch sequence

1. User runs `open hq` in terminal, or double-clicks an icon in the WM.
2. Command/click resolves `appId` → looks up manifest in **App Registry**.
3. Registry lazy-loads the app's component bundle (code-split).
4. `proc.spawn(appId, args)` called on **kernelAPI** → kernel adds an entry to the **process table**.
5. **Window Manager** reacts to the new process-table entry → mounts a window frame, renders the app component inside it, wrapped in an error boundary.
6. App component receives a scoped `kernelAPI` handle (filtered by its declared `permissions`) for all further reads/writes — e.g., `fs.read('/projects/hq/README.md')`.
7. On close: `proc.kill(pid)` → process table entry removed → WM unmounts the window.

### 8.3 Folder structure (Next.js + TS)

```
/app                      → Next.js routes (SSR/SSG content pages)
  /projects/[slug]/page.tsx
  /papers/[slug]/page.tsx
  /os/page.tsx             → the OS shell entry point (CSR)

/kernel
  vfs.ts                   → VFS store (Zustand) + node types
  process.ts                → process table store (Zustand)
  events.ts                  → event bus
  api.ts                      → kernelAPI implementation (syscall boundary)
  persistence.ts               → save/load, schemaVersion + migrations

/apps
  /terminal
    Terminal.tsx
    commands.ts             → command table + dispatcher
    manifest.ts
  /file-viewer
    FileViewer.tsx
    manifest.ts
  /games/<game-name>
    Game.tsx
    manifest.ts

/registry
  index.ts                  → appId -> manifest map, lazy imports

/wm
  WindowManager.tsx
  Window.tsx                → single window frame (drag/resize/focus)
  Taskbar.tsx

/content                    → MDX/Markdown source for papers/projects
  hq.mdx
  hscp-mass-reconstruction.mdx

/public/icons
```

### 8.4 State ownership summary

| Concern              | Owner            | Notes                                   |
|-----------------------|------------------|------------------------------------------|
| File/content tree      | Kernel (VFS)     | Source of truth for `ls`/`cd`/`open`     |
| Open windows/processes  | Kernel (proc table) | WM only renders it, never mutates directly |
| Window position/size     | Kernel (proc table) | Updated via `window.resize/move`        |
| App-internal state (e.g. game score) | App component | Local to the app, not kernel-visible |
| Cross-app notifications   | Event bus        | e.g., "file saved" → file-viewer refresh |
| Session persistence         | `persistence.ts` | Serializes VFS + proc table, versioned  |

This keeps the syscall boundary honest: the kernel never needs to know what a "game" is, only that something asked to spawn a process and read/write files.
