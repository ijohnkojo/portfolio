# Phase 2 + Gap-List Defects

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned. One thing the plan missed: a debounced save loses in-flight
> work when the tab closes, which is exactly when it matters. Both the autosave
> and the history writer now flush on `pagehide`. Found by the E2E check, not by
> reasoning.
>
> Settled at approval:
>
> - **Windows are restored on reload.** Apps still come back empty — persisting
>   app-internal state needs a `serialize` hook on the app contract, which stays
>   a Phase 3 shape and a recorded gap.
> - **Snapping gets both triggers**, edge-drag and keyboard. The chord is
>   **Alt+Shift+Arrow**: Super is grabbed by Windows and GNOME, Cmd+Arrow
>   navigates in browsers, and Ctrl+Alt+Arrow switches workspaces on GNOME.
>   xterm must be told to let it bubble, which the same custom key handler that
>   fixes Ctrl+C-with-selection can do.
> - Keyboard restore implies knowing the pre-snap geometry, so `preSnap` becomes
>   an optional field on `Process` after all — which also makes dragging a
>   snapped window restore its old size. The plan's "not building unsnap" note
>   below is superseded.

## Context

Phase 1 is complete, so two things come due at once.

**Phase 2** (design doc §4): persistence, window snapping, command history. The
persistence *shape* has existed since the foundation slice — `snapshot`,
`hydrate`, `migrate`, `StorageAdapter`, all tested — and has never been wired to
anything. Snapping was deliberately deferred by [D-008](../decisions.md) under
§5's rule of "no new WM feature until N apps need it"; there are now four apps
and windows that want to sit side by side.

**The defects.** Three entries on the gap list are actual misbehaviour rather
than absence. The first is a real repaint bug in the flagship app.

Content and a game are explicitly out of scope — the writeups are being handled
separately, and the game comes later.

---

## Part 1 — Defects

### 1a. Editing a wrapped command line corrupts the display

`Terminal.tsx`'s `render()` repaints with `\r\x1b[2K`: return to the start of the
*current row*, clear *that row*. A line longer than the terminal width wraps, so
the continuation rows survive and the prompt duplicates on screen. Verified by
narrowing the window, typing past the right edge, and pressing Ctrl+A.

The fix is the standard readline dance, and it is fiddly enough to deserve
being pure and tested rather than eyeballed:

**`apps/terminal/render.ts`** — `renderSequence({ prompt, buffer, cursor, cols })`
returns the escape string. It must:

1. move up from the cursor's current row to the line's first row
2. `\r`, then `\x1b[0J` — erase to end of *display*, not end of row
3. write prompt + buffer
4. place the cursor by absolute row/column, since `\x1b[nD` will not wrap
   backwards across rows

The nasty case is a total width that is an exact multiple of `cols`, where
terminals disagree about whether the cursor has wrapped yet. Tested explicitly.

This keeps the existing shape: pure logic in a module, `Terminal.tsx` stays a
device driver.

### 1b. Ctrl+C cannot copy a selection

It always cancels the line. `attachCustomKeyEventHandler` returning `false`
leaves the event to the browser, so: if `term.hasSelection()` and the chord is
Ctrl/Cmd+C, defer. Otherwise the line editor keeps it.

### 1c. `open` focuses the first instance, not the most recent

`commands.ts` takes `find(...)` over `proc.list()`, which is pid order. Pick the
highest `zIndex` instead — the one the user last looked at.

---

## Part 2 — Persistence

The machinery exists and is tested. What is missing is the wiring, and the
wiring is where the judgement is.

**What persists:** the write overlay, and the window session (processes,
`focusedPid`, `nextPid`, `nextZIndex`).

**What does not:** app-internal state. A restored terminal comes back at `/`
with an empty screen. Persisting that would need a `serialize` hook on the app
contract, which is a Phase 3 shape — recorded as a gap, not built.

**Save:** subscribe to both stores, debounce ~400ms, write through
`createLocalStorageAdapter`. Debounce matters — a drag commits geometry on
mouse-up, and a burst of window operations must not mean a burst of
`JSON.stringify` over the whole tree.

**Load:** in `OsShell`, *after* the base tree is mounted, since the overlay
replays on top of it. If a saved session exists, hydrate and **do not** spawn
the default terminal — otherwise every reload adds a window.

**Three failure paths, all of which must degrade rather than break:**

- a persisted process whose `appId` is no longer registered → dropped on
  hydrate, with the rest of the session kept
- a corrupt or newer-schema blob → `migrate` already returns null; boot fresh
- a session that is somehow unusable → an escape hatch the user can reach
  without devtools

That last one needs a real answer, so: **a `reset` shell command** that clears
persisted state and reloads. Cheap, discoverable through `help`, and it means a
wedged session is recoverable from inside the OS.

---

## Part 3 — Persisted history

Design doc §4 lists this in Phase 2. The interesting question is *where* it
lives.

**Chosen: history is a file in the VFS**, at `/home/.history`. The terminal
reads it on spawn and appends on commit through `fs.write`.

*Why.* It needs no new storage mechanism at all — the write overlay already
persists, so history rides the machinery Part 2 wires up. It is also more
honest to the design: `cat /home/.history` works, which is exactly what a user
of a UNIX-shaped system would expect, and it makes the shell's state inspectable
with the shell's own tools.

It requires giving the terminal `fs.write`, which it has not needed until now.
Worth stating plainly: the terminal becomes the first app that can modify the
filesystem.

Writes are batched — appending on every keystroke-committed line would churn the
overlay and the debounced save behind it. Flush on a timer and on unmount.

---

## Part 4 — Window snapping

[D-008](../decisions.md) deferred this until apps needed it. Four apps now, and
a terminal beside a viewer is the obvious layout.

**Zones**, computed on drag *stop* from the pointer position: left edge → left
half, right edge → right half, top edge → maximize.

**The constraint that governs the design:** `docs/gotchas.md` and
[D-002](../decisions.md) require zero React commits during a drag. A snap
preview that renders through React state would violate exactly that.

So the preview is **imperative**: one overlay element, positioned by direct DOM
writes from `onDrag`, never touching a store or React state. `pnpm verify`'s
existing "zero commits during a 20-step drag" assertion is the check that this
stayed honest, and it already runs.

**Not building:** unsnapping restores the pre-snap size. Dragging a snapped
window moves it at its snapped size. Recorded as a limitation — the pre-snap
geometry would need somewhere to live, and that is a process-table field for a
feature nobody has asked for yet.

---

## Decisions to record

- **D-019** — what persists and what does not; debounce; the `reset` escape
  hatch; unknown-appId processes dropped on hydrate
- **D-020** — terminal history is a VFS file, not a separate store; the terminal
  gains `fs.write`
- **D-021** — snap zones computed on drag-stop with an imperative preview, to
  hold the drag contract

---

## Critical files

| File | Role |
|---|---|
| `apps/terminal/render.ts` | New. Pure escape-sequence builder — fixes 1a |
| `app/os/OsShell.tsx` | Hydrate on boot, subscribe and save |
| `kernel/persistence.ts` | Add the subscribe/debounce driver; shape unchanged |
| `wm/Window.tsx` | Snap zones on drag-stop; imperative preview |
| `apps/terminal/commands.ts` | `reset`; `open` picks the topmost instance |

---

## Verification

**Unit:**

- `renderSequence`: single row; a line wrapping two and three rows; cursor
  mid-line on a wrapped row; total width an exact multiple of `cols`; a cursor
  at position 0 and at the very end
- history file: append, dedupe, cap, and a malformed `/home/.history` ignored
  rather than throwing
- hydrate: drops a process whose `appId` is unregistered and keeps the rest
- `open` picks the highest-zIndex instance
- snap-zone geometry: a pure `zoneFor(point, bounds)` returning
  `left | right | top | null`

**End-to-end** (extend the existing suites rather than adding a fifth):

- **the repaint fix** — narrow the window, type past the right edge, Ctrl+A and
  type; the screen must contain exactly one prompt
- **persistence** — run commands, open a viewer, reload: the windows come back
  in the same positions, and `cat /home/.history` shows the earlier commands
- **`reset`** — clears, and the next reload boots fresh with one terminal
- **snapping** — drag to the left edge, release, and the window occupies the
  left half
- **the drag contract still holds** — `pnpm verify`'s zero-commit assertion,
  now with the snap preview running during the gesture

**Regression:** all four suites, plus `pnpm build`.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-019, D-020, D-021
- `docs/architecture.md` — persistence section moves from "shaped" to wired;
  snapping in the WM section; remove the three fixed defects from known gaps and
  add the two new limitations (no app-state persistence, no unsnap)
- `docs/personal-os-portfolio.md` — §4 Phase 2 progress; §5 persistence bullet
- `docs/running.md` — `reset`, snapping, and what survives a reload
- `docs/changelog.md`, and this file's status header
