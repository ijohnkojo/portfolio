# Piping and Redirection

> **Status:** drafted 2026-08-12 · not started
>
> Written at the end of a session with the architecture fresh, so a later
> session can execute it without rediscovering anything. Read
> [../../AGENTS.md](../../AGENTS.md) and [../README.md](../README.md) first;
> everything below assumes them.

## Context

Design doc §2 says *"Piping/redirection: skip for V1, real scope creep
magnet."* That was right when written — there was no terminal, and later only
eight commands and no writable filesystem, so `>` had nowhere to write and `|`
had nothing worth chaining.

**That justification has expired.** There are twenty-nine commands, several
genuinely composable (`grep`, `find`, `wc`, `head`, `tail`, `tags`, `ps`), and
`fs.write` exists. `grep -i redis / | wc` is a thing a person would type.

§2 is still right about *where* the magnet is, though: `|` and `>` are bounded;
`&&`, `||`, `$( )`, globs, and variables are what follow. This plan implements
exactly `|`, `>`, and `>>` and nothing else.

Record the reversal as **D-029** — a deferral whose reason expired, like
[D-008](../decisions.md) before it. Patch design doc §2 to ▸ Decided.

---

## What already exists (do not rebuild)

| Thing | Where | Note |
|---|---|---|
| `runCommand(line, ctx)` | `apps/terminal/shell.ts` | returns `{ output: string[], cwd, clear, reset }` |
| `tokenize(line)` | same | quote-aware, returns `string[]` |
| `findUnquotedOperator(line)` | same | already tracks quote state — **reuse its loop shape for the parser** |
| `Command.run(ctx, args)` | `apps/terminal/commands/types.ts` | returns `CommandResult` |
| `ShellContext` | same | `{ kernel, cwd, pid, resolveHandler? }` |
| helpers | same | `fail`, `operands`, `takeFlag`, `takeNumberFlag`, `readOrFail`, `statOrFail` |
| command table | `commands/index.ts` | grouped into `fs.ts`, `proc.ts`, `system.ts`, `write.ts` |

**The architecture is already the right shape.** Commands *return* `string[]`
rather than printing, which is exactly what a pipeline needs. Most toy shells
print directly and have to be rewritten to add pipes; this one does not. That is
the single most important fact for whoever picks this up.

---

## Design

### 1. `apps/terminal/pipeline.ts` — pure, new

```ts
export interface Stage { tokens: string[] }
export interface Pipeline {
  stages: Stage[]
  redirect?: { path: string; append: boolean }
}
export function parsePipeline(line: string): Pipeline   // throws on syntax errors
```

Walk the line tracking quote state, exactly as `findUnquotedOperator` does.
Split on unquoted `|`. On unquoted `>` or `>>`, everything after is the redirect
target — one path, and it must be the last thing on the line.

Syntax errors to produce, each with a readable message:

- `ls |` → `syntax error: expected a command after '|'`
- `| ls` → `syntax error: unexpected '|'`
- `ls >` → `syntax error: expected a file after '>'`
- `ls > a b` → `syntax error: '>' takes one file`
- `>` appearing before a `|` → `syntax error: '>' must come last`

Operators still **not** supported — keep `findUnquotedOperator` for these and
keep its current error: `<`, `2>`, `&&`, `||`.

### 2. `stdin` on `ShellContext`

```ts
stdin?: string[]
```

A command reads it **only when it has no path operand**, which is how a real
shell behaves and avoids a flag. Commands that ignore stdin simply do not look
at it — no error, as in bash.

**Which commands change** (`apps/terminal/commands/fs.ts` unless noted):

| Command | Behaviour with stdin and no path |
|---|---|
| `cat` | echo stdin — this is literally what `cat` is |
| `grep` | filter stdin lines; output has no `path:line:` prefix, just the line |
| `wc` | count stdin |
| `head` / `tail` | slice stdin |

Everything else ignores it. Update each `usage` to show the path is optional,
and each `description` to mention stdin — the `man` test in
`commands/commands.test.ts` enforces that every command has a description, so a
changed command must keep one.

**Consider adding `sort` and `uniq`.** Piping without them is thin, and both are
~10 lines over stdin-or-a-path. Optional, but `grep … | sort | uniq` is the
shape people expect. Decide at build time, and note the choice.

### 3. Execution in `runCommand`

```
parse → for each stage: run with stdin = previous stage's output
      → if redirect: fs.write(path, output.join('\n') + '\n'), return no output
      → else: return the last stage's output
```

Details that matter:

- **`cwd`** — only a `cd` in the *last* stage should change it. `cd /x | wc` is
  nonsense; take `result.cwd` from the final stage only.
- **`clear` / `reset`** — honour them only from the last stage, same reasoning.
- **Errors** — a stage that throws `CommandError` halts the pipeline and its
  message becomes the whole output. Do **not** invent exit codes; `$?` is out of
  scope and nothing here needs it.
- **`>>`** — read the existing file (empty if missing) and concatenate.
- **Redirect onto published content is fine** — `fs.write` creates an overlay
  edit, and [D-027](../decisions.md)'s `rm` reverts it. No new rule needed.

### 4. `help` text

`commands/system.ts` currently prints *"No piping or redirection — see the
design doc."* Change it.

---

## Verification

**Unit — `apps/terminal/pipeline.test.ts`** (the parser is where the bugs are):

- one stage; two stages; three stages
- quoted operators stay literal: `echo "a | b"` is one stage, one argument
- `> file` and `>> file`, with and without a preceding pipe
- every syntax error above, by message
- a redirect target containing a quoted space

**Unit — `commands/commands.test.ts`**: each stdin-consuming command with stdin
and no path, with a path and stdin present (path wins), and with neither.

**Unit — `shell.test.ts`**: `cd` in a non-final stage does not change cwd; a
failing middle stage halts and reports; redirect writes the file; `>>` appends.

**E2E — `scripts/verify-terminal.mjs`**, two checks are enough:

- `grep -i physics / | wc` prints a count, not a list
- `ls /papers > /home/out.txt` then `cat /home/out.txt` shows the listing

**Regression:** all five suites and `pnpm build`. `verify-phase2` is the one to
watch — it exercises the shell heavily.

---

## Scope boundary

**Not in this plan, and each would be its own decision:** `<`, `2>`, `&&`,
`||`, `$( )`, globs, variables, job control, exit codes. If any of these start
looking necessary while building, stop — that is §2's magnet, and the answer is
a separate plan rather than a wider one.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-029, including *why the original deferral expired*
- `docs/personal-os-portfolio.md` — §2 piping bullet becomes ▸ Decided
- `docs/architecture.md` — the shell section; `pipeline.ts` joins the pure modules
- `docs/running.md` — the shell section, and the "no piping" line
- `docs/changelog.md`, and this file's status header
