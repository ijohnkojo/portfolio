# Tiling + Tab Completion

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned. One refactor along the way: `desktopBounds`/`pointerOf` moved
> into `wm/desktop.ts`, because snapping and tiling both need to know how big the
> desktop is and two answers could disagree.

## Context

The last two Phase 2 items from design doc §4. Both are small features with one
genuine design question each, and in both cases the question is *who is allowed
to know what*.

---

## Part 1 — Tab completion

### What it completes

- **First token** → command names from the table.
- **Any other token** → paths, resolved against the terminal's cwd.

Behaviour follows bash closely enough not to surprise: a unique candidate is
completed outright (directories gain a trailing `/`, so you can keep going);
several candidates extend to their longest common prefix; and when that adds
nothing, the candidates are printed.

That last rule replaces double-tap tracking. Pressing Tab twice on an ambiguous
prefix lists, because the first press changes nothing — same outcome, no extra
state.

### The design question: completion needs the filesystem, the line editor must not

`lineEditor.ts` is a pure state machine over keystrokes and knows nothing about
the VFS. Completion needs to list directories. Three ways that could go:

**Rejected — give the line editor a kernel handle.** It stops being a pure
keystroke machine and its tests need a filesystem.

**Rejected — do completion in `Terminal.tsx`.** Puts real logic back in the
device driver, which is precisely what the shell/terminal split exists to avoid.

**Chosen — Tab emits an effect; a separate pure module resolves it.** The line
editor gains one key and one effect, `{ type: 'complete' }`. The host builds a
context and calls `complete()` in **`apps/terminal/completion.ts`** — pure, with
directory listing passed *in* as a function. So completion is tested in bare
node against a stub `listDir`, and the line editor stays what it is.

`lineEditor` also gains `setLine(state, buffer, cursor)` so the host can apply
the result without reaching into the state shape.

**Not doing:** completion inside quoted tokens. `tokenize` handles quotes but
the completer will treat a quote as an ordinary character; a path with a space
completes badly. Recorded as a gap rather than half-solved.

---

## Part 2 — Tiling

Snapping ([D-021](../decisions.md)) moves *one* window to a zone. Tiling
arranges *all* of them. Four layouts:

| Mode | Result |
|---|---|
| `grid` | `ceil(sqrt(n))` columns; the last row stretches to fill |
| `columns` | n full-height columns |
| `rows` | n full-width rows |
| `cascade` | back to overlapping, offset like a fresh spawn |

`cascade` is the way out, so tiling is never a one-way door.

Geometry is pure — **`wm/tiling.ts`**, `tileLayout(count, bounds, mode)` →
`Geometry[]` — and applied through the existing `window.snap`, which means each
window records its pre-tile geometry and **Alt+Shift+Down restores one
individually**. Reusing `preSnap` rather than adding a parallel field.

Minimized windows are skipped: they are not on screen, and tiling around them
would leave holes.

### The design question: how does a shell command reach the window manager?

`tile` is a shell command. The layout needs desktop bounds, which live in the
DOM, and the process table. `commands.ts` is pure and must stay runnable in
bare node.

**Rejected — `Terminal.tsx` imports the WM.** An app reaching directly into the
window manager inverts the layering the whole design rests on.

**Rejected — another injected function**, like `resolveHandler`. It would work,
but it grows `ShellContext` for every WM capability an app might ever want.

**Chosen — the app announces intent on the event bus.** `tile` calls
`kernel.events.emit('wm:tile', { mode })`. The WM subscribes and decides what to
do about it. The app cannot move windows; it can only ask.

This is the first real use of the event bus beyond `fs:changed`, and it is what
design doc §2 put it there for: "pub/sub so WM, shell, and apps communicate
without direct references." It also means the shell's tile command is testable
by asserting an event fired, with no DOM anywhere.

The terminal gains `events.emit`. Keyboard **Alt+Shift+T** cycles grid → columns
→ rows → cascade through the same path.

---

## Decisions to record

- **D-022** — Tab emits an effect the host resolves; completion is a pure module
  with `listDir` injected
- **D-023** — apps request window-manager actions over the event bus rather than
  reaching into the WM; the WM decides

---

## Build steps

1. `apps/terminal/completion.ts` + tests — pure, against a stub `listDir`.
2. `apps/terminal/lineEditor.ts` — `Tab` → `{ type: 'complete' }`; add
   `setLine`.
3. `apps/terminal/Terminal.tsx` — resolve the effect: build the context from
   `kernel.fs.list` and the command table, apply the result, print candidates
   when nothing was added.
4. `wm/tiling.ts` + tests — pure layout maths.
5. `wm/WindowManager.tsx` (or `OsShell`) — subscribe to `wm:tile`, apply through
   `window.snap`, skipping minimized windows.
6. `apps/terminal/commands.ts` — `tile [grid|columns|rows|cascade]`, emitting the
   event; default `grid`; unknown mode is an error naming the valid ones.
7. `registry/index.tsx` — terminal gains `events.emit`.
8. `OsShell` — Alt+Shift+T cycles the modes.

---

## Verification

**Unit:**

- completion: command names from an empty and a partial first token; a path in
  the second token; unique match completes and appends `/` for a directory;
  several matches extend to the common prefix and return candidates; no match
  leaves the line untouched; completing mid-line splices rather than truncating;
  an absolute path, a relative path, and `..`
- `tileLayout`: 1, 2, 3, 4, 5 and 9 windows in each mode; tiles never overlap and
  together cover the bounds; `cascade` offsets without stacking exactly
- `tile` command: emits `wm:tile` with the parsed mode, defaults to grid, errors
  on an unknown mode

**End-to-end** (extend `verify-phase2`):

- type `ls /pro` + Tab → completes to `/projects/`
- type `op` + Tab → completes to `open`
- an ambiguous prefix lists candidates
- `tile` with three windows open → none overlap, all inside the desktop
- Alt+Shift+Down after tiling restores one window to its pre-tile size
- `tile cascade` puts them back

**Regression:** all five suites, `pnpm test`, `pnpm build`.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-022, D-023
- `docs/architecture.md` — completion and tiling in the shell/WM sections; the
  event bus section gains its second real event; quoted-path completion to gaps
- `docs/personal-os-portfolio.md` — §4 Phase 2 complete
- `docs/running.md` — Tab, `tile`, Alt+Shift+T
- `docs/changelog.md`, and this file's status header
