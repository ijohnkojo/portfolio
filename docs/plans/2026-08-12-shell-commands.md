# Twelve More Commands

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned. `rm`/`mv` stayed out and became [D-025](../decisions.md),
> which records *why* the VFS cannot express a deletion rather than leaving it
> as an unexplained absence.
>
> Settled at approval: build Tier 1 (discovery) *and* Tier 2 (classics), and
> **`cat` keeps printing the file exactly as it is on disk**, frontmatter
> included — that is what `cat` means, and `stat` becomes the readable way to
> get at metadata. The viewer's raw/rendered toggle already set that precedent.

## Context

The shell has twelve commands and lets you *walk* a filesystem. It does not let
you *find* anything in one, which is most of what a portfolio is for.

The specific waste: every content node already carries
`{ title, summary, date, tags, draft, href }` in `meta`, built from real
frontmatter by `lib/content.ts` — and **no command reads any of it**. `ls` shows
filenames and `cat` dumps raw MDX. The metadata is in the filesystem, unused.

**Out of scope:** `rm` and `mv`. The VFS has no delete at all, and the overlay
persists `path → content`, so a deletion cannot be expressed as a write — on
reload the base tree is rebuilt from disk and the file returns. Making delete
stick needs tombstones in the persisted state and a schema bump. That is a
decision of its own, not a rider on this one. Also out: piping and redirection
(design doc §2), and `env`/`set`.

---

## The commands

### Discovery — the point of the exercise

| Command | Behaviour |
|---|---|
| `grep [-i] <pattern> [path]` | Search file contents recursively. Output `path:line: text` |
| `find [pattern] [path]` | Match node names, case-insensitive substring |
| `stat <path…>` | Type, mime, size, `src`, and every `meta` field |
| `tags [tag]` | All tags with counts, or the entries carrying one |
| `tree [-a] [-L n] [path]` | Recursive listing with box-drawing |

### Classics

| Command | Behaviour |
|---|---|
| `head [-n N] <path…>` | First N lines, default 10 |
| `tail [-n N] <path…>` | Last N lines, default 10 |
| `wc <path…>` | Lines, words, characters; a total row for several files |
| `date` | Current date and time |
| `history` | Numbered, read from `/home/.history` |
| `man <command>` | Usage, description, examples |
| `exit` | Close this terminal — what Ctrl+D already does |

---

## Two structural changes

**1. Split `commands.ts`.** It is ~300 lines and would roughly double. It
becomes a directory:

```
apps/terminal/commands/
  types.ts    ← Command, ShellContext, CommandResult, CommandError, fail, helpers
  walk.ts     ← the shared recursive tree walk
  fs.ts       ← ls cd pwd cat stat tree head tail wc find grep tags
  proc.ts     ← ps kill open exit
  system.ts   ← echo clear reset tile date history man help
  index.ts    ← assembles the table, re-exports the types
```

`shell.ts` and the tests import `./commands` either way, so nothing outside the
directory changes.

**2. `Command` gains `description?` and `examples?`.** `help` keeps printing
one-line summaries; `man` prints the long form. The data lives next to each
command rather than in a separate manual that drifts out of date — the same
reason `help` is generated from the table today.

**`walk.ts`** is shared by `grep`, `find`, `tags`, and `tree`: a generator over
`{ path, node }`, children sorted by name so output is deterministic and
testable. Asset-backed nodes (`src`, no `content`) are visited but skipped by
anything that reads text.

**Output caps.** `grep` stops at 200 matches and says so. A search that floods
2000 lines of scrollback is worse than one that admits it truncated.

---

## Verification

**Unit** — the whole point of the pure command layer; all in bare node:

- `grep`: matches across nested files; `path:line:` prefixing; `-i`; no matches;
  a pattern that is not valid regex is treated as a literal, not a crash;
  asset-backed nodes skipped; the 200-match cap
- `find`: substring and case-insensitivity; searching from a subpath; no matches
- `stat`: a plain file, an asset-backed file with `src`, a directory, an app
  node, and a content node showing title/date/tags
- `tags`: counts across the tree; `tags <one>` lists paths; an unknown tag
- `tree`: nesting and box-drawing; `-L` depth limit; `-a` for dotfiles
- `head`/`tail`: default 10, `-n`, a file shorter than N, several files with
  headers
- `wc`: counts and the total row
- `history`: numbering; an absent `/home/.history`
- `man`: known command, unknown command, and **every command in the table has a
  description** — a test, so a new command cannot ship undocumented
- `exit`: kills its own pid

**End-to-end** — extend `verify-terminal`: `grep` finds text in a real writeup,
`tags` lists the placeholder tags, `tree` renders, `man ls` prints usage.

**Regression:** all five suites plus `pnpm build`.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-024 for the `commands/` split and `man` data living on
  the command
- `docs/architecture.md` — the shell section and the new file layout; note that
  `rm` is blocked on a delete primitive
- `docs/running.md` — the full command table
- `docs/changelog.md`, and this file's status header
