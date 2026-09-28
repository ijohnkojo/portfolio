# OS backlog

The OS has been a separate project in `os/`, frozen, since 2026-09-27
([D-037](../decisions.md)). This list holds the work that would change its
behaviour: each item is deferred on purpose, not forgotten. Nothing here is
done on the site's branches; it waits for OS work to resume, when the direction
may change entirely.

Roughly in order of how much it matters now that the site links into the OS.

## Open

- **An exit back to the site.** Nothing under `os/` links to `/`. From the
  site's graph, booting the OS is a one-way door; only the browser's back button
  returns. The most visible gap once the graph links in.
- **`meta` should carry an entry's whole frontmatter.** Today
  `os/vfsTree.ts` copies six named fields into `meta`, so `stat` never shows
  `venue`, `location`, or the graph's `orgs` / `fields` / `tools` / `related`
  (`cat` shows them, because they are in the file). About three lines: spread
  the normalised frontmatter, then write the named fields over it. Pair it with
  a rule that frontmatter values stay flat — `stat` prints an object as
  `[object Object]`. Until then, `docs/authoring.md` says what is true.
- **`content/home/about.md` and `readme.md`** describe the OS *as the
  portfolio* ("This is a mock operating system, and it is the portfolio"). The
  About app and `cat /home/readme.md` show them. Stale since the reframe; they
  are the OS's own copy, so they change when the OS does.
- **What the OS is now.** Its name (`personal-os`, which also names its entry
  and the metadata title of `/os`), and what it is *for* once it is no longer
  the site's front door.
- **The known gaps carried from before the freeze** — see
  [architecture.md § known gaps](architecture.md#10-known-gaps): no phone mode,
  no accessibility work, no URL sync or back button, the whole tree in the
  `/os` payload ([D-011](../decisions.md)), and the smaller items listed there.

## How to pick this up

Read [architecture.md](architecture.md) and [design.md](design.md) as the
record of where the OS stood, then the D-entries they cite. The frozen banner
on each doc explains the path prefix. `lib/boundary.test.ts` states what the OS
may import from the site; widening that list is a decision, so give it a D-entry.
