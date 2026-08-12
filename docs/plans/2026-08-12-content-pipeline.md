# Content Pipeline + SSG Routes

> **Status:** approved 2026-08-12 · shipped 2026-08-12
>
> Built as planned. Three decisions recorded: [D-010](../decisions.md) (read
> from disk + MDXRemote), D-011 (VFS tree as a server prop), D-012 (entry
> assets mirrored into /public). One small addition not in the plan: a `mknod`
> primitive on the VFS store, needed so the client can register `/apps` nodes
> onto a server-built tree.
>
> Two choices settled at approval: content routes get a **minimal typographic**
> treatment (readable prose layout, not OS chrome — the crawlable pages should
> read as documents, not as a screenshot of the OS), and placeholder entries use
> **generic slugs** (`project-one`, `paper-one`), so nothing implies real work
> exists yet. Slugs are therefore *not* final; renaming them later moves both a
> route and a VFS path, which the one-to-one mapping keeps mechanical.

## Context

The portfolio does not currently work as a portfolio. There is no URL for a
paper or a project — the OS shell is the only way in, which is exactly the
failure design doc §5 names as the most common in this genre: "papers/projects
need real server-rendered routes independent of the client-rendered OS shell."

There is a second, more immediate reason to do this before the terminal.
`content/index.ts` builds the VFS from hardcoded template strings today. The
real pipeline — MDX files, frontmatter, slugs, a tree built from disk — changes
*how VFS nodes are created*. The terminal (`ls`, `cd`, `cat`, `open`) and the
file viewer both read that tree. Building them first means writing them against
a placeholder shape and reworking them after; building content first means they
are written once, against the real one.

Prose stays placeholder. This session builds the pipeline, not the writeups.

**Out of scope:** terminal/shell, file viewer, games, persistence wiring, the
minimize-unmount fix (tracked in architecture.md § known gaps).

---

## Decisions to record

**D-010 — content is read from disk at build time and rendered with
`next-mdx-remote/rsc`, not compiled per-file by `@next/mdx`.**

The obvious `@next/mdx` setup needs `import('@/content/papers/' + slug)` in a
dynamic route, and per [D-005](../decisions.md) Next cannot match an
interpolated import path back to a chunk. The alternatives are code-generating a
literal-import registry, or reading the file.

Reading the file wins because it produces the raw MDX source as a side effect —
and the VFS needs exactly that string for `cat`. One read serves both the SSG
route and the filesystem, instead of two pipelines that can disagree.
`MDXRemote` still accepts a `components` map, so a writeup can embed a live
React demo, which is why MDX was chosen over plain Markdown.

**D-011 — the VFS tree is built on the server and handed to the client as a
prop.**

`app/os/page.tsx` becomes a server component that builds the tree from disk and
passes it into `OsShell`. This works only because the kernel's node types are
plain serializable data (design doc §2) — the constraint pays for itself here.

Consequence worth stating plainly: **every paper's full text ships to the client
in the RSC payload.** `kernel.fs.read` is synchronous, so content has to be in
memory for `cat` to work at all. At portfolio scale (tens of KB) this is fine.
It stops being fine at hundreds of files, and the fix then is `FileNode.src` +
an async read path — a kernel change, so it goes in known gaps now rather than
being discovered later.

---

## Content shape

Directory per entry, so a writeup can carry assets alongside it:

```
content/
  projects/
    hq/index.mdx
    treeviz/index.mdx
  papers/
    hscp-mass-reconstruction/index.mdx
```

Frontmatter, parsed with `gray-matter`:

```yaml
---
title: HSCP Mass Reconstruction
summary: One line, used on listing pages and in <meta description>.
date: 2026-08-12
tags: [physics, cms]
draft: false
---
```

The mapping is deliberately one-to-one so nothing needs a lookup table:

| Disk | Route | VFS |
|---|---|---|
| `content/projects/hq/index.mdx` | `/projects/hq` | `/projects/hq/index.mdx` |
| `content/papers/<slug>/index.mdx` | `/papers/<slug>` | `/papers/<slug>/index.mdx` |

`draft: true` excludes an entry from listings, routes, and `generateStaticParams`
— but it stays in the VFS, so the OS can still open work in progress.

---

## Build steps

### 1. Dependencies

```
pnpm add next-mdx-remote gray-matter remark-gfm rehype-slug
```

`next-mdx-remote@6` (has an `/rsc` export, `@mdx-js/mdx` 3, React 19 compatible),
`gray-matter@4`, `remark-gfm@4` for tables/strikethrough, `rehype-slug@6` for
heading anchors. No `@next/mdx`, no `pageExtensions` change — see D-010.

### 2. `lib/content.ts` — the single source of truth

Server-only (`import 'server-only'`), uses `node:fs`. Exports:

```ts
type Collection = 'projects' | 'papers'

interface Entry {
  collection: Collection
  slug: string
  title: string
  summary: string
  date: string
  tags: string[]
  draft: boolean
  body: string        // raw MDX, frontmatter stripped
  path: string        // VFS path, e.g. /papers/<slug>/index.mdx
}

listEntries(collection): Entry[]        // published only, newest first
getEntry(collection, slug): Entry | null
buildVFSTree(): DirNode                 // the whole tree, including drafts
```

`buildVFSTree` reuses the existing `dir`/`file`/`appNode` helpers from
`kernel/vfs.ts` — the node constructors already exist and shouldn't be
duplicated. It keeps the `/home`, `/apps` branches the current
`content/index.ts` produces and adds `/projects` and `/papers` from disk.
Non-MDX files in an entry directory become `FileNode`s with `src` pointing at
`/public`, so assets don't bloat the payload.

Reads are wrapped in React's `cache()` so the tree is built once per render pass
rather than once per route.

### 3. SSG routes

```
app/projects/[slug]/page.tsx
app/papers/[slug]/page.tsx
app/projects/page.tsx          → listing
app/papers/page.tsx            → listing
```

Each detail page:

- `generateStaticParams()` from `listEntries()` — this is what makes them static
- `generateMetadata()` — title, description from `summary`, OpenGraph
- renders `<MDXRemote source={entry.body} components={mdxComponents} options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }} />`
- `notFound()` for an unknown or draft slug
- a link into the OS at the matching VFS path

`app/mdx-components.tsx` holds the shared component map — styled `h1`/`p`/`pre`,
and the seam where a writeup's live demo components get registered later.

Content routes are plain server-rendered pages in the site's own chrome. They
are not the OS and should not pretend to be; the OS links to them and they link
back.

### 4. Rework `/os` to take the tree as a prop

- `app/os/page.tsx` — server component; calls `buildVFSTree()`, renders
  `<OsShell tree={tree} />`
- `app/os/OsShell.tsx` — accepts `tree`, mounts it through a module-guarded
  `ensureMounted(tree)` called during render, keeping the current property that
  the VFS is populated *before* first paint
- delete `content/index.ts`; its placeholder strings move to real `.mdx` files

### 5. Placeholder content

Generic slugs, real frontmatter: `projects/project-one`, `projects/project-two`,
`papers/paper-one`, plus `papers/paper-draft` with `draft: true` so the draft
path is exercised rather than assumed. One entry carries a non-MDX asset so the
`src` path is exercised too.

Bodies are written to demonstrate the renderer — headings, a list, a table, a
code block, inline code, a blockquote — rather than lorem, so the typographic
styling has something real to be checked against.

### 6. Landing page

Replace the placeholder [app/page.tsx](../../app/page.tsx) with real links: recent
projects and papers from `listEntries()`, and the "boot →" link to `/os`.

---

## Critical files

| File | Role |
|---|---|
| `lib/content.ts` | Disk → entries + VFS tree. The one place that knows the content layout |
| `app/projects/[slug]/page.tsx` | The SSG pattern; `papers` mirrors it exactly |
| `app/mdx-components.tsx` | Shared MDX component map |
| `app/os/page.tsx` + `OsShell.tsx` | Server-built tree crossing into the client |
| `kernel/vfs.ts` | Reuse `dir`/`file`/`appNode`; **no changes expected** |

---

## Verification

**Unit** (`pnpm test`) — extend to `lib/**/*.test.ts`:

- frontmatter parsed; a missing `title` fails loudly rather than rendering blank
- `draft: true` excluded from `listEntries` but present in `buildVFSTree`
- VFS paths match routes one-to-one for every entry
- an entry directory with a non-MDX asset yields a `FileNode` with `src` set

**Build** (`pnpm build`) — the real assertion is the route table:

- `/projects/hq`, `/papers/<slug>` listed as **○ (Static)**, one per published entry
- drafts absent
- `grep` the built HTML for body text: content must be in the *server-rendered*
  markup, since being crawlable is the entire point

**End-to-end** — extend `scripts/verify-wm.mjs` or add `scripts/verify-content.mjs`:

- `/projects/hq` renders prose with no JS enabled
- the OS at `/os` shows the same content under `/projects/hq/index.mdx` via `fs.read`
- both existing checks still pass — the tree-as-prop change must not break boot

**Regression** — `pnpm test`, `pnpm lint`, `pnpm verify` (17/17),
`pnpm check:diagrams` all still green.

---

## Docs to update in the same commit

- `docs/decisions.md` — D-010, D-011
- `docs/architecture.md` — content pipeline section; the `/os` boot sequence
  diagram changes (the tree now arrives as a prop); add the sync-`fs.read`
  payload limit to known gaps
- `docs/personal-os-portfolio.md` — §5 SEO/crawlability bullet ▸ Built; §6
  content stack; §8.3 layout
- `docs/changelog.md` — session entry
- this file — status header on ship
