# A Clickable Desktop, and Three Apps

> **Status:** drafted 2026-08-12 · **approved 2026-08-12**, in progress
>
> Apps chosen: Files, Editor, Settings — no game this round. Full desktop
> metaphor, minimal SVG icons.
>
> - [x] 1. Icons + `/desktop` + the surface
> - [x] 2. Drag to arrange
> - [x] 3. Context menus
> - [x] 4. Files
> - [x] 5. Editor
> - [x] 6. Settings — **complete**
>
> Read [../../AGENTS.md](../../AGENTS.md) and [../README.md](../README.md)
> first; everything below assumes them.
>
> **Deviations so far:**
>
> 1. **Step 4 was brought forward, ahead of step 3.** Steps 1–2 left one dead
>    interaction — double-clicking a folder did nothing — and Files is what
>    fills it. Shipping context menus first would have left the dead end in
>    place for longer, with no dependency either way.
> 2. **Files declares no `handles`.** The plan gave it `inode/directory`; no
>    node in this VFS carries that mime, and directories are resolved by caller
>    opinion rather than by mime, so the declaration would have been data
>    nothing reads.
> 3. **New folder names itself** rather than prompting. A `window.prompt` inside
>    an OS with its own windows would be a lie. On the desktop, creating
>    something drops straight into an inline rename instead.
> 4. **No Change Wallpaper item** in the background menu — it points at
>    Settings, which is step 6.
> 5. **Rename is disabled in Files**, offered only on the desktop. A list row
>    has no inline field yet, and a greyed item says so more honestly than a
>    missing one.
> 6. **Directories cannot be renamed anywhere.** Not called out in the plan, but
>    it falls out of `mv`: a rename is a copy plus a remove and the VFS copy path
>    handles one file. The desktop gets no capability the shell lacks.
> 7. **Settings use no event.** The plan specified `os:settings` on the bus per
>    D-023. Wrong pattern: D-023 is for an app that wants something *done* it
>    cannot do itself, and settings only wants a value *known*. Every surface
>    subscribes to `/home/.settings` instead, which is what makes
>    `echo '{"wallpaper":"ink"}' > /home/.settings` work from the shell.
>    Recorded as [D-034](../decisions.md).

## Context

The OS has four apps and no desktop. The taskbar launches things, windows
manage themselves, and the large dark rectangle in the middle does nothing —
`app/os/OsShell.tsx` renders `<div id={DESKTOP_ID}><WindowManager /></div>` and
that div has no children but windows.

Everything reachable today is reachable *only* by typing. That is a deliberate
strength of this project and also its narrowest point: a visitor who does not
open the terminal sees a wallpaper and two buttons.

This plan adds the surface that makes it clickable, and the three apps that give
it something to click.

**Design doc §5's rule applies and is satisfied**: *"no new WM feature until N
apps exist that actually need it."* A desktop with icons is a WM feature. Four
apps did not need it; seven do — and two of the three new ones (Files, Editor)
are the apps that make a filesystem worth pointing at.

**[D-015](../decisions.md)'s revisit trigger fires here** and is answered in
§0 below, because it names this exact situation.

---

## What already exists — do not rebuild

| Thing | Where | Note |
|---|---|---|
| The desktop surface | `wm/desktop.ts` | `DESKTOP_ID`, `desktopBounds()`, `pointerOf(event)` — the pointer helper is exactly what icon dragging needs |
| Drag that doesn't re-render | `wm/Window.tsx` | The pattern to copy, not the component. See [D-002](../decisions.md) |
| Imperative overlay during a gesture | `wm/snapPreview.ts` | Direct DOM writes outside React's commit cycle ([D-021](../decisions.md)) |
| mime → app | `registry/handlers.ts` | Pure, exact-beats-wildcard. Already tested |
| App nodes in the VFS | `OsShell.ensureMounted` | `mknod('/apps/<id>', appNode(...))` — the shape `/desktop` copies |
| Writable filesystem | `kernel/vfs.ts` | `write`, `mkdir`, `unlink`. You can only remove what you added ([D-027](../decisions.md)) |
| A dotfile that persists for free | `apps/terminal/history.ts` | `/home/.history` rides the write overlay ([D-020](../decisions.md)). **Two things in this plan copy it** |
| `fs:changed` on the bus | `kernel/api.ts` | `{ path, appId }`, emitted by every write |
| Scoped selectors | `hooks/kernel.ts` | `useProcess`, `useIsFocused`, `usePids` |
| An app that reads a path from `args[0]` | `apps/viewer/Viewer.tsx` | The model for Editor |

**`public/icons/` does not exist.** Every manifest already declares
`icon: '/icons/<id>.svg'` and no file is behind it — the field has been dead
data since the foundation slice. This plan makes it mean something.

---

## 0. Answering D-015's trigger first

> *"If a second consumer appears — a file manager, desktop icons — promote this
> to a kernel-level table."*

Both named consumers appear in this plan. **The answer is no, and the trigger
was written from the wrong premise.**

The reason `resolveHandler` is *injected* into the shell was never the number of
consumers — it was that `commands/` must keep running in bare node, and
importing `registry/index.tsx` would drag `next/dynamic` into it. The desktop
and Files are browser components. They can `import { findHandlerFor }` directly
and nothing is compromised.

A kernel-level table would put app knowledge in the kernel to serve consumers
that do not need it, and would violate invariant 1.

**What is real** is that "what does opening this node mean" is about to exist in
three places. That gets extracted:

```ts
// registry/launch.ts — pure, resolver passed in, no next/dynamic
export type Launch =
  | { kind: 'spawn'; appId: string; args: string[]; title: string }
  | { kind: 'unhandled'; mime: string }

export function launchFor(
  path: string,
  node: VFSNode,
  resolve: (mime: string) => string | null
): Launch | null   // null for a directory — each caller decides what that means
```

Directories return `null` on purpose: the terminal errors, Files navigates into
it, the desktop opens Files there. Same resolution, three different opinions
about folders, no shared code pretending otherwise.

**Amend D-015 in place** with the answer, as D-002's fired trigger was amended.

---

## 1. The desktop is a view of `/desktop`

The single decision this plan rests on. **`/desktop` is a real directory in the
VFS**, and the desktop surface renders its contents.

```
cp /home/readme.md /desktop     puts it on the desktop
ls /desktop                     lists what is there
rm /desktop/readme.md           takes it off
mkdir /desktop/scratch          a folder appears
```

No second source of truth, no icon registry, no sync. The shell and the desktop
are two views of one filesystem, which is the same mechanism/policy split the
kernel and the WM already use.

**Seeded at boot, idempotently**, exactly as `/apps` is:

```ts
vfsStore.getState().mkdir('/desktop')
for (const id of DESKTOP_APPS) {
  vfsStore.getState().mknod(`/desktop/${id}`, appNode(id, id))
}
```

**The limitation, accepted and documented:** `mknod` leaves no overlay entry, so
`rm /desktop/terminal` works for the session and the shortcut returns on reload.
Same shape as *"an empty directory does not survive a reload"* under
[D-027](../decisions.md), and the same cause — the overlay stores
`path → content` and an app node is not content. Files you `cp` there persist
normally, because those are content.

The alternative is inventing a shortcut *file* format so app launchers become
overlay-persistable. That is a new node type in everything that walks the tree,
to make "I deleted the Terminal icon" stick. Not worth it.

**Dotfiles are hidden**, as `ls` hides them — which is what lets the next
section put a file inside `/desktop` without it showing up as an icon.

### Icon positions: `/desktop/.positions`

Positions are presentation, not content, but they need to persist and the
project already has the right answer for that — [D-020](../decisions.md): a
dotfile in the VFS rides the write overlay and needs no new storage.

```json
{"terminal":{"x":24,"y":24},"readme.md":{"x":24,"y":128}}
```

Keyed by entry name. `cat /desktop/.positions` works, which is the same small
honesty that makes `cat /home/.history` work.

Anything without an entry is laid out into the first free grid slot, so a file
`cp`'d from the terminal appears somewhere sensible without the shell knowing
the desktop exists.

### Re-listing without thrashing

The desktop subscribes to `fs:changed` and re-lists — but **filtered on
`path.startsWith('/desktop')`**. The terminal flushes `/home/.history` every
250ms while you type; an unfiltered subscription would re-list the desktop on
every keystroke burst.

The desktop subscribes to **nothing in the process table**, so dragging a window
never re-renders an icon.

---

## 2. Interaction

| Gesture | Result |
|---|---|
| Click an icon | Select it. Click the background to deselect |
| Double-click an icon | Open it — `launchFor`, with directories opening Files |
| Drag an icon | Move it. Committed on drop, never during |
| Right-click an icon | Open · Edit · Rename · Delete |
| Right-click the background | New Folder · New File · Arrange Icons · Tile Windows · Change Wallpaper |
| `Enter` / `Delete` on a selection | Open / remove |
| `Escape` | Close the menu, clear the selection |

### Dragging obeys the window rule

**This is the one thing in this plan that can silently wreck the app.**
[gotchas.md](../os/gotchas.md) and [D-002](../decisions.md) say live drag is
imperative and local; persisted geometry is state. Icons are a second surface
for the same rule:

- during the drag, position is written **straight to the element's transform**,
  the way `snapPreview.ts` writes the snap overlay
- on drop, one write to `/desktop/.positions`
- **never** a `setState` in `onPointerMove`

`verify-desktop.mjs` asserts **zero React commits during an icon drag**, the way
`verify-phase2` does for windows. That check is the point, not a bonus.

### Rename and delete

Rename is inline — the label becomes an input on the second click or via the
menu. It is `cp` + `unlink` underneath, so [D-027](../decisions.md)'s rules
apply unchanged: **published content cannot be renamed or deleted from the
desktop either**, and the failure says so in the same words `rm` uses.

That is worth stating plainly: the desktop gets no privileges the shell lacks.

---

## 3. Three apps

### `files` — the file manager

Single pane, breadcrumb, list view. Back / forward / up / home, new folder,
delete, and double-click to descend or open.

- **Pure module** `apps/files/navigation.ts` — the history stack (`back`,
  `forward`, `go`, `up`) as `(state, action) => state`. Tests in bare node; the
  component holds no logic worth testing.
- Permissions: `fs.read`, `fs.write`, `proc.spawn`
- `handles`: **`inode/directory`** — a mime the VFS does not currently emit, so
  this claims nothing away from the viewer. Directories are resolved by caller
  opinion, not by mime (§0).

### `editor` — the text editor

The first app that **creates** content rather than reading it, which is what
[D-027](../decisions.md) built `unlink` and the write path for. review.md calls
it "the obvious next feature."

- Path in `args[0]`, like the viewer. Textarea, dirty indicator in the title,
  `Ctrl+S` to save, `fs.write` on save
- Refuses directories, app nodes, and asset-backed files (`src` set, no
  `content`) with the same message shape `cat` uses
- Saving over published content is **allowed** — it becomes an overlay edit and
  `rm` reverts it, exactly as `>` does since [D-029](../decisions.md). No new
  rule
- Permissions: `fs.read`, `fs.write`

**It declares no `handles`, deliberately.** The viewer already claims
`text/markdown`, `text/plain` and `application/json`; a second exact claim would
be resolved by registration order in `findHandlerFor` — silently, and
differently depending on where someone added a line. So:

> **The viewer stays the default for text. The editor is opened explicitly** —
> right-click → Edit on the desktop and in Files, and an **Edit** button in the
> viewer's own toolbar.

That is also the honest model: "open" and "edit" are different intents, and
every real desktop distinguishes them.

**Add a guard test** in `registry/handlers.test.ts`: no two manifests may claim
the same exact mime. It fails the day someone reintroduces the ambiguity, which
is the only way that rule stays true.

### `settings` — appearance

- Wallpaper (four generated gradients/solids — no images), accent colour, icon
  size, and a "show hidden files on the desktop" toggle
- Stored in **`/home/.settings`** as JSON. Third use of the D-020 pattern, and
  by now it is the established way this OS persists small things
- Applied by emitting **`os:settings`** on the bus; `OsShell` subscribes and
  sets CSS custom properties on the desktop element. The app does not reach into
  the WM — [D-023](../decisions.md)
- **Pure module** `apps/settings/settings.ts` — defaults, parse, serialize, and
  validation of an unknown/corrupt file (falls back to defaults rather than
  breaking the desktop)
- Permissions: `fs.read`, `fs.write`, `events.emit`

---

## 4. Icons

Twelve flat single-stroke SVGs in `public/icons/`, ~20 lines each,
`currentColor` so they inherit the palette and work if a light mode ever
happens:

```
terminal  viewer  about  sysinfo  files  editor  settings
folder  file  markdown  pdf  image
```

The last five are **type icons**, picked from a node's mime by a pure
`iconFor(node)` in `wm/desktopIcons.ts`. App icons come from the manifest's
existing `icon` field, which finally has files behind it.

**The taskbar starts rendering them too** — icon plus name in the launcher.
Small, and it is the same dead field coming alive in the one place that already
wanted it.

---

## 5. Order of work

Each step is shippable and leaves the tree green.

1. **Icons + `/desktop` + the surface** — SVGs, seeding, `desktopIcons.ts`,
   render, click-select, double-click to open via `launch.ts`. Taskbar icons.
2. **Drag to arrange** — imperative drag, `.positions`, the zero-commit check.
3. **Context menus** — icon and background, rename, delete, new folder/file.
4. **Files.**
5. **Editor**, plus the viewer's Edit button and the handler guard test.
6. **Settings**, plus wallpaper application in `OsShell`.

---

## Verification

**Unit — the pure modules, in bare node as everything else:**

| Module | Covers |
|---|---|
| `registry/launch.ts` | app node → spawn; file → handler; unhandled mime; directory → null |
| `wm/desktopIcons.ts` | listing hides dotfiles; `iconFor` per mime; positions parse/serialize; corrupt `.positions` falls back; free-slot layout does not overlap |
| `apps/files/navigation.ts` | back/forward/up/home; forward is dropped after a new navigation |
| `apps/settings/settings.ts` | defaults; round trip; unknown keys and corrupt JSON degrade to defaults |
| `registry/handlers.test.ts` | **no two manifests claim the same exact mime** |

**E2E — `scripts/verify-desktop.mjs`**, new:

- icons render for the seeded apps, and a `cp` from the terminal makes one appear
- double-click spawns a window; double-click a folder opens Files there
- **zero React commits while an icon is dragged** — the [D-002](../decisions.md)
  contract on its second surface
- a dragged icon is in the same place after a reload
- right-click → Delete removes a created file; right-click → Delete on published
  content **refuses, in the same words `rm` uses**
- Editor: open, type, `Ctrl+S`, reload, the text is still there
- Settings: change the wallpaper, reload, it held

**Regression:** all five existing suites plus `pnpm build`. `verify-phase2` is
the one to watch — it counts windows after a reset, and this adds a directory to
the boot sequence.

---

## Scope boundary

**Not in this plan.** Each would be its own decision:

- **Drag-and-drop *between* surfaces** — dragging a file from Files onto the
  desktop, or onto a window. A cross-window drag protocol is a genuine feature
  and the obvious next magnet
- **Rubber-band multi-select**, and multi-selection generally — one icon at a
  time
- **A clipboard** — no cut/copy/paste; `cp` and `mv` are in the shell
- **Trash and undo** — [D-027](../decisions.md)'s "you can only remove what you
  added" is the safety rail
- **Wallpaper images** — generated backgrounds only, so nothing new ships in the
  payload ([D-011](../decisions.md))
- **A game** — still the one unbuilt item on design doc §5's Phase 2 line
- **Mobile** — this makes the desktop *more* desktop-shaped, and does not
  address [review.md](../review.md)'s largest gap. Worth saying out loud

---

## Docs to update in the same commit

- `docs/decisions.md` — **D-030** the desktop is a view of `/desktop`, positions
  in a dotfile; **D-031** icon drag obeys the window-drag rule; **D-032** the
  viewer is the default for text and the editor is explicit. Plus the
  **D-015 amendment** answering its trigger
- `docs/personal-os-portfolio.md` — §2 *Apps* and §5's "no new WM feature until
  N apps need it", both **▸ Built**
- `docs/architecture.md` — a new § for the desktop, the app table (four → seven),
  known gaps (the `/desktop` app-node limitation; drag-and-drop absent), and the
  layer map
- `docs/running.md` — a *Desktop* section, and the new apps in the shell section
- `docs/authoring.md` — nothing, unless Files changes how content is reached
- `docs/changelog.md`, and this file's status header
