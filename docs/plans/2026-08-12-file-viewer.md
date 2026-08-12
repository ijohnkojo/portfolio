# File / PDF Viewer

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned, with two decisions the plan did not anticipate:
> [D-017](../decisions.md) (`<embed>` for PDFs, split out from D-016) and
> **D-018** — `dark:` had to become class-aware, because the prose components
> are shared with the theme-aware site and were rendering dark-on-dark inside
> the always-dark OS whenever the visitor's system was in light mode.
> `verify-viewer.mjs` now runs in light mode specifically to catch that.

## Context

Design doc §4 puts a file/PDF viewer in Phase 1, and it is the last piece of it.
The seam is already cut: `open` on a file currently prints

```
open: no application registered for text/markdown — try 'cat'
```

which is a placeholder waiting for exactly this app. Content is real MDX with
real mime types, and `paper-one` already carries an asset represented as a
`FileNode` with `src` — so both the inline and asset-backed paths have something
true to render.

This also makes the terminal's `open` do what design doc §8.2 always described:
resolve a node, find the app that handles it, spawn it with the path.

**Out of scope:** games, persistence wiring, editing (the viewer is read-only —
nothing has `fs.write` and there is no redirection to produce a write).

---

## The real design question: who maps mime to app?

`open` needs to turn `text/markdown` into `viewer`. Three places that could
live, and the choice matters more than the viewer itself.

**Rejected — hardcode it in `commands.ts`.** Puts app knowledge in the shell and
means every new file type edits the terminal.

**Rejected for now — a handler table in the kernel.** Defensible: "default
application" is a real OS concept. But it adds kernel surface for a single
consumer, and design doc §5's rule is no new machinery until something needs it.

**Chosen — `handles` on the manifest, resolved by the registry, injected into
the shell.** A manifest declares what it opens:

```ts
viewer: { id: 'viewer', handles: ['text/markdown', 'text/plain', 'application/pdf', 'image/*'], … }
```

`registry/index.tsx` exposes `findHandlerFor(mime)`, and `Terminal.tsx` passes it
into `ShellContext`. The mapping data sits next to the manifests where it
belongs, and `commands.ts` stays pure — tests inject a stub resolver, so the
command layer still runs in bare node with no `next/dynamic` anywhere near it.

If a second consumer appears (a file manager, desktop icons), promoting this to
a kernel-level table is the escape hatch. One consumer, so: injection.

---

## Decisions to record

**D-015 — the viewer renders markdown with `react-markdown`, not MDX.**

Design doc §6 sanctions either. The routes compile MDX through
`next-mdx-remote/rsc` at build time; the viewer needs to render *at runtime in
the browser*, where the MDX compiler is a ~200KB dependency for a feature no
writeup uses yet.

*Cost, and it is a genuine trap worth writing down:* if a writeup ever embeds a
React component, the crawlable route renders it and **the viewer shows the raw
JSX as text**. The two surfaces would disagree — the exact drift D-010 was
designed to prevent for content, reappearing at the render layer. Both consume
the same component map from `components/mdx.tsx`, which limits the divergence to
JSX embeds specifically. Recorded as a known gap; the escape hatch is runtime
MDX evaluation in the viewer.

**D-016 — PDFs use `<embed>`, not react-pdf.**

Design doc §6 offers both. `<embed src>` is zero dependency and delegates to the
browser's own viewer, which already handles paging, zoom, search, and print.
react-pdf is ~1MB to reimplement that worse.

*Cost:* no control over the chrome, and rendering varies by browser.

---

## The viewer

`apps/viewer/Viewer.tsx`, permissions `['fs.read']`, spawned with the path in
`args[0]` — the first real use of `args`, which has been carried through the
process table since the foundation slice and never exercised.

It dispatches on `stat(path).mime`:

| Mime | Rendering |
|---|---|
| `text/markdown` | `react-markdown` + `remark-gfm`, through the shared component map |
| `text/plain`, `application/json` | `<pre>`, monospace |
| `application/pdf` | `<embed src>` |
| `image/*` | `<img src>` |
| anything else | the mime and `src`, so the failure is legible |

**Two content sources**, because the VFS has both: `content` inline (everything
from `content/**/*.mdx`) or `src` pointing into `/public` (assets). Inline
renders directly; `src` is fetched for text types and handed straight to the
element for PDFs and images. The fetch path needs loading and error states — it
is the first async read in an app, and `kernel.fs.read` being synchronous is
precisely why (see D-011).

**A raw/rendered toggle.** Rendered by default; raw shows the file exactly as
`cat` prints it, frontmatter included. Cheap, and it makes the "one read feeds
both surfaces" property visible rather than merely claimed.

The window title is the filename, from `basename(path)`.

---

## Build steps

1. `pnpm add react-markdown` (`remark-gfm` is already in).
2. `registry/types.ts` — add optional `handles?: string[]` to `AppManifest`.
3. `registry/index.tsx` — `findHandlerFor(mime)`, matching exact strings and
   `type/*` wildcards, longest/most-specific match first. Register the viewer.
4. `apps/terminal/commands.ts` — `ShellContext` gains
   `resolveHandler?: (mime: string) => string | null`. `open` uses it for file
   nodes, spawning with `[path]` and the basename as title; the existing
   "no application registered" error stays as the fallback when nothing handles
   the mime.
5. `apps/terminal/Terminal.tsx` — pass `findHandlerFor` into the context.
6. `apps/viewer/Viewer.tsx` — the component above.
7. `content/papers/paper-one/` — add a real PDF so the `<embed>` path has
   something valid to load. Generated once with headless Chrome, committed as a
   fixture; it is mirrored into `/public` by the existing sync script.

---

## Critical files

| File | Role |
|---|---|
| `registry/index.tsx` | `findHandlerFor` — the mime→app mapping |
| `apps/terminal/commands.ts` | `open` becomes what §8.2 described |
| `apps/viewer/Viewer.tsx` | The viewer itself |
| `registry/types.ts` | `handles` on the manifest |

---

## Verification

**Unit** (`pnpm test`):

- `findHandlerFor`: exact match, `image/*` wildcard, unknown mime → null, and
  exact beating wildcard when both could apply
- `open` with a stub resolver: spawns the handler with `[path]` as args and the
  basename as title
- `open` with a resolver returning null: still prints the "no application
  registered" line, so removing the viewer degrades rather than breaks
- `open` on an app node still spawns/focuses as before — the existing tests must
  keep passing unchanged

**End-to-end** (`scripts/verify-viewer.mjs`):

- `open /papers/paper-one/index.mdx` from the terminal spawns a window titled
  `index.mdx` showing *rendered* markdown — a real `<h1>`, not `# Paper`
- the raw toggle shows the frontmatter that the rendered view hides
- `open /papers/paper-one/figure.txt` renders the asset by fetching `src`
- `open` on the PDF produces an `<embed>` pointing at the right `/content/…` URL
- two viewers open at once show different files — proves `args` is per-instance
  and nothing is leaking through module scope

**Regression:** `pnpm test`, `pnpm verify`, `pnpm verify:content`,
`pnpm verify:terminal` all still green. The terminal suite covers `open` and
will exercise the changed code path.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-015, D-016
- `docs/architecture.md` — the viewer and the handler-resolution path; remove
  "`open` on a file is a dead end" from known gaps; add the MDX/react-markdown
  divergence in its place
- `docs/personal-os-portfolio.md` — §4 Phase 1 complete; §6 content stack
- `docs/running.md` — the viewer in the walkthrough
- `docs/changelog.md`, and this file's status header
