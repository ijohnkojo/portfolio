# A Writable Filesystem

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned. Two things the plan did not anticipate: `mount()` had to
> start clearing the overlay (writes belong to the tree they were made against),
> and `reset` turned out to be broken — the autosave's pagehide flush wrote the
> session back immediately after the clear. Both recorded, the second as
> [D-028](../decisions.md).

## Context

The VFS only ever grows. There is no `unlink`, and `mkdir` exists on the store
but no command exposes it. That is why [D-025](../decisions.md) deferred `rm`,
and why the editor app has nowhere to save.

Scoped as *make the filesystem writable*, not "add mkdir" — `mkdir` alone is a
demo; create plus delete plus move is a capability, and it is what unblocks the
editor.

**Out of scope:** the editor app itself, and mobile mode.

---

## The trap this has to fix first

`mkdir` does not persist, and neither does anything put inside it:

```sh
mkdir /home/notes
touch /home/notes/a.md    # overlay gets "/home/notes/a.md" → ""
# reload → the file is gone, silently
```

The overlay is writes only. On reload the base tree is rebuilt, `/home/notes`
does not exist, `applyOverlay` calls `write()`, `setNode` throws `ENOTDIR`, and
the catch block drops the entry without a word.

**Fix: `applyOverlay` creates missing parents on replay** — `mkdir -p`
semantics. Directories become *implied by the files in them*, so no new
persisted state and no schema bump.

Two consequences, both acceptable and both to be documented:

- An **empty** directory cannot survive a reload — nothing in the overlay
  implies it.
- A write whose parent has since been deleted is now **preserved** by
  recreating the path, where it used to be silently dropped. Data preservation
  over tidiness; it also changes an existing test, deliberately.

---

## Kernel

Three additions, no schema change.

**`baseRoot`** — the tree as mounted, kept by `mount()`. Nearly free: writes
copy only the spine, so the original base root object is still intact and
uncopied. It lets the store answer "is this published content?"

**`unlink(path)`** — with three behaviours, which is the whole design:

| Target | Result |
|---|---|
| overlay-created | removed, and its overlay entries with it |
| published, but edited | **reverts to the published version** — undo, not delete |
| published, untouched | `EROFS: … is published content` |

That third rule is [D-003](../decisions.md) extended — you can only remove what
you added — and it is why this needs no tombstones. A directory absent from
`baseRoot` cannot contain published content, so the check on the directory
alone is sufficient for `rm -r`.

**`mkdir(path, recursive?)`** — parents on demand, used by `applyOverlay`.

`fs.mkdir` and `fs.unlink` join the syscall boundary under the existing
`fs.write` permission. The terminal already holds it.

---

## Commands

| Command | Notes |
|---|---|
| `mkdir [-p] <path…>` | `EEXIST` without `-p` |
| `touch <path…>` | creates empty; existing files are left alone (there is no mtime to bump) |
| `rm [-r] <path…>` | refuses a directory without `-r`; refuses published content always |
| `cp <src> <dst>` | read + write; `dst` as a directory means `dst/basename(src)` |
| `mv <src> <dst>` | `cp` then `unlink` |

Nineteen commands becomes twenty-four… twenty-nine. Each needs a `description`,
which the existing test enforces.

---

## Verification

**Unit** — the three `unlink` behaviours are the core:

- delete an overlay-created file; its overlay entry goes too
- delete an edited published file → reverts to the published content
- delete an untouched published file → `EROFS`, tree unchanged
- `rm -r` on an overlay directory removes descendants and their overlay entries
- `rm` a directory without `-r` errors; `rm /` errors
- `mkdir` without `-p` on a missing parent errors; with `-p` succeeds
- `touch` creates, and does not clobber existing content
- `cp` into a directory; `mv` removes the source; `mv` onto published fails
- `applyOverlay` recreates missing parents

**End-to-end** — the one that matters is the round trip:

- create a file in the shell, reload, **it is still there**
- delete it, reload, **still gone**
- `rm` a published entry → refused with a readable message
- edit a published file then `rm` it → back to the published text

**Regression:** all five suites, `pnpm build`.

---

## Docs

- `docs/decisions.md` — D-027 (unlink's three behaviours), and D-025 marked
  resolved
- `docs/architecture.md` — VFS section, known gaps
- `docs/running.md` — the new commands
- `docs/authoring.md` — a note that shell-created files are overlay-only and
  never become published content
- `docs/changelog.md`, and this status header
