# Running and verifying

## Start it

```bash
pnpm dev
```

- **http://localhost:3000/os** — the OS shell
- **http://localhost:3000** — placeholder landing page with a "boot →" link

At boot you get a **Terminal** and a taskbar: the `personal-os` label, launcher
buttons for each registered app, then one button per running window.

## The shell

Type `help` for the list, `man <command>` for detail. Thirty-one commands.

**Reading the filesystem**

| Command | Does |
|---|---|
| `ls [-a] [path]` | list; `dir/` and `app*` markers carry the type |
| `cd [path]` · `pwd` | move around; bare `cd` goes to `/` |
| `cat [path…]` | print a file exactly as stored, frontmatter and all |
| `stat <path…>` | type, mime, size — **and the frontmatter**: title, date, tags |
| `tree [-a] [-L n] [path]` | the whole shape at once |
| `head` · `tail` · `wc` | first/last lines, and counts |
| `sort [-r]` · `uniq [-c]` | order lines, and collapse adjacent repeats |

**Finding things** — the reason this stopped being a toy

| Command | Does |
|---|---|
| `grep [-i] <pattern> [path]` | search file contents; prints `path:line: text` |
| `find [pattern] [path]` | match names anywhere beneath a directory |
| `tags [tag]` | every tag with a count, or the entries carrying one |

**Writing** — you can only remove what you created

| Command | Does |
|---|---|
| `mkdir [-p] <path…>` | create a directory |
| `touch <path…>` | create an empty file; existing files are untouched |
| `rm [-r] <path…>` | remove; **refuses published content**, reverts an edit to it |
| `cp <src> <dst>` | copy; a copy of published content is yours |
| `mv <src> <dst>` | move, which is copy + remove — so published files can't move |

Try `mkdir /home/notes`, `touch /home/notes/a.md`, reload — it's still there.
Then `rm /home/readme.md` and see it refused.

**Processes and windows**

| Command | Does |
|---|---|
| `open <path>` | launch an app, or hand a file to whatever handles its type |
| `ps` · `kill <pid>` · `exit` | the process table |
| `tile [grid\|columns\|rows\|cascade]` | arrange every window |

**Session**

| Command | Does |
|---|---|
| `history` | numbered, and it survives a reload |
| `date` · `echo` · `clear` | as expected |
| `man <command>` · `help` | documentation, generated from the commands themselves |
| `reset` | discard the saved session and reload |

Worth trying: `grep -i kernel /`, `tags`, `stat /papers/paper-one/index.mdx`,
`tree /`.

`ls -a` shows dotfiles, including `/home/.history` — where your command history
actually lives. `cat /home/.history` works, because it is a real file, which is
why `grep` reaches it too.

**Tab completes** — command names in the first word and after each `|`, paths
everywhere else. One match completes outright (directories gain a `/`), several
extend to their shared prefix, and pressing Tab again lists them.

Worth trying: `ls /apps`, then `open /apps/sysinfo` — spawning a window from the
shell. And `ls /papers` shows `paper-draft/`, which the web 404s: drafts are
hidden from crawlers, not from the OS.

`open` also works on files, handing each to whichever app declared its mime type:

    open /papers/paper-one/index.mdx    # rendered markdown, with a raw toggle
    open /papers/paper-one/paper.pdf    # the browser's PDF viewer, embedded
    open /papers/paper-one/figure.txt   # fetched from /public, not inlined

Each opens its own viewer instance titled with the filename, so several files
can be open at once.

Line editing: arrows, Home/End, Ctrl+A/E/U/L, Ctrl+C to abandon a line, Ctrl+D
on an empty line to exit. Up/down walk history, which **survives a reload**.
Ctrl+C copies when there's a selection.

## Pipes and redirection

`|`, `>` and `>>` work ([D-029](decisions.md)):

```
grep -i physics / | wc            count the matches instead of listing them
ls /papers > /home/out.txt        write the listing to a file
echo one more >> /home/out.txt    append to it
cat /home/.history | sort | uniq -c    which commands you type most
```

`cat`, `grep`, `wc`, `head`, `tail`, `sort` and `uniq` read the pipe when given
no path — a path always wins, so `echo x | wc /home/about.md` counts the file.
Anything else in a pipeline simply ignores what it was handed, as in bash.

Redirecting onto published content is allowed: the write becomes an edit in the
overlay, and `rm` reverts it.

Nothing else does. `<`, `2>`, `&&`, `||` unquoted say so by name rather than
looking for a file. Quoted operators are ordinary text: `echo "a | b"` works.

## The desktop

Icons sit under the windows, and they are **the contents of `/desktop`** — a
real directory ([D-030](decisions.md)), not a list the desktop keeps to itself:

```
cp /home/readme.md /desktop     an icon appears
ls /desktop                     the shell sees the same thing
rm /desktop/readme.md           it goes away
mkdir /desktop/scratch          a folder appears
```

| Gesture | Result |
|---|---|
| Click | Select. Click the background to deselect |
| Double-click, or Enter | Open — an app starts, a file goes to whatever handles its type, a folder opens in Files |
| Drag | Arrange. Where you drop it is where it stays, across reloads |

The arrangement is a file too: `cat /desktop/.positions`. Delete it and
everything falls back to the grid.

Terminal, About and System Info are seeded as shortcuts at boot. Removing one
holds for the session but comes back on reload — the shortcuts are not content,
so the overlay has nothing to persist. Files you copy there do persist.

## Files

The file manager — the same tree the shell walks, without typing. Launch it from
the taskbar or the desktop, or double-click any folder.

| Control | Does |
|---|---|
| `←` `→` `↑` | back, forward, up. Forward is dropped once you go somewhere new |
| breadcrumb | every ancestor is a click |
| double-click | descend into a folder, or open a file in its handler |
| `+` | new folder, named for you |
| `␡` | delete what is selected |

It gets no privileges the shell lacks: deleting published content is refused in
the same words `rm` uses, and for the same reason.

**Not built yet:** right-click menus, and the Editor and Settings apps. See
[plans/2026-08-12-desktop-and-apps.md](plans/2026-08-12-desktop-and-apps.md).

## Windows

| Action | Result |
|---|---|
| Drag to the left or right edge | Snap to that half |
| Drag to the top edge | Maximize |
| **Alt+Shift+←/→** | Snap the focused window |
| **Alt+Shift+↑** | Maximize |
| **Alt+Shift+↓** | Restore the pre-snap size |
| **Alt+Shift+T** | Cycle tiling: grid → columns → rows → cascade |

Dragging a snapped window away restores its old size where you drop it. Tiling
goes through the same mechanism, so **Alt+Shift+↓ pulls a single window back out
of a tiled layout** while the others stay put.

## What survives a reload

Open windows and their positions, and anything written to the filesystem —
which includes shell history. **App-internal state does not**: a restored
terminal comes back empty at `/`.

If a session ever gets into a state you don't want, `reset` clears it and boots
fresh.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm start` | serve the production build |
| `pnpm test` | 456 unit tests — kernel, content, shell, pipeline, editor, render, completion, tiling, desktop |
| `pnpm test:watch` | same, watching |
| `pnpm lint` | eslint |
| `pnpm verify` | drives the real app in Chrome — **needs `pnpm dev` running** |
| `pnpm check:diagrams` | parses every ```` ```mermaid ```` block in the repo's markdown |
| `pnpm verify:content` | content routes render with JS disabled — **needs `pnpm dev` running** |
| `pnpm verify:terminal` | drives the shell with real keystrokes — **needs `pnpm dev` running** |
| `pnpm verify:viewer` | opens files in the viewer — **needs `pnpm dev` running** |
| `pnpm verify:desktop` | icons, the icon-drag contract, and Files — **needs `pnpm dev` running** |
| `pnpm verify:phase2` | persistence, snapping, repaint fix — **needs `pnpm dev` running** |

`pnpm verify` defaults to `http://localhost:3111/os`. For the default dev port:

```bash
OS_URL=http://localhost:3000/os pnpm verify
BASE_URL=http://localhost:3000 pnpm verify:content
```

It must run against `pnpm dev`, not `pnpm start` — the commit logging it asserts
on is compiled out of production builds. It resolves Playwright from a local
install, `PLAYWRIGHT_PATH`, or the npx cache, and drives system Chrome
(`CHROME_PATH` to override). See [D-009](decisions.md).

## Driving it by hand

| Action | Expect |
|---|---|
| Drag a titlebar | Moves smoothly, stays inside the desktop |
| Drag an edge or corner | Resizes; min 240×160 |
| Click a launcher button | New window, own pid |
| Click between windows | Focused one brightens and comes to front |
| Double-click a titlebar | Maximize / restore |
| `–` `□` `✕` | Minimize, maximize, close |
| Click the focused window's own taskbar button | Minimizes it; click again to restore |
| **crash this app** in About | Red "segmentation fault" panel; the other window and taskbar keep working |
| **restart** in that panel | App comes back |

Launch **About** twice — each instance gets its own pid. The process table is
per-instance, not per-app.

## The check that actually matters

The drag-performance contract from [gotchas.md](gotchas.md): live drag is
imperative and local, persisted geometry is state.

Open DevTools → Console and drag a window:

- **while dragging** — console stays silent
- **on mouse-up** — exactly one `[wm] pid N commit #M`

If lines appear *during* the drag, something started writing geometry to the
store mid-gesture and the contract is broken. Then drag window 2 and confirm no
`pid 1` lines appear — that is the scoped selectors ([D-006](decisions.md))
doing their job.

`pnpm verify` asserts both automatically.

## Code splitting

DevTools → Network → JS. Hard-reload `/os`, then click a launcher button: a new
chunk request should fire **at that click**, not at page load. Apps are not in
the initial bundle ([D-005](decisions.md)).

To check it against a production build instead:

```bash
pnpm build
grep -c "vfs nodes" .next/server/app/os.html   # 0 — sysinfo is not in the payload
```

## Expected noise

In dev, Next shows an indicator bottom-left. After using the crash button it
reads "1 Issue" — that is the error boundary's own `console.error` reporting the
crash it caught, which is the intended behaviour. A clean run logs nothing.
