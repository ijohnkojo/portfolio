# Authoring content

How to add a project or a paper, and what happens to it afterwards.

---

## Where content lives, and why it has to

**Published work goes in `content/` on disk, in git.** Not by preference — by
constraint.

The crawlable routes are prerendered at build time from disk. Anything written
*inside the OS* lands in the localStorage overlay: one browser, one machine. It
would have no URL, no `<meta>` tags, no server-rendered markup — invisible to
search engines and to anyone you send a link to, and gone the moment site data
is cleared. That is exactly the failure design doc §5 names as the most common
in this genre, and [D-010](decisions.md) exists to prevent it.

The VFS already draws this line ([D-003](decisions.md)):

| Tier | What | Lives in | Who sees it |
|---|---|---|---|
| **Base tree** | published work | `content/`, in git | everyone — crawlers, the web, the OS |
| **Overlay** | scratch, shell history | localStorage | only that browser |

So an in-OS editor would be a legitimate thing to build — for notes and as a
demonstration that the filesystem is genuinely real — but it is not the path for
a writeup that needs a URL.

The shell can now create, copy, move, and delete — but only within the overlay.
Published content is read-only there ([D-027](decisions.md)): `rm` on a writeup
is refused, and `rm` on one you have *edited* reverts it rather than deleting
it. Nothing you do in the OS can change what is in `content/`.

---

## Adding an entry

One directory per entry:

```
content/papers/hscp-mass-reconstruction/
  index.mdx        ← required: frontmatter + prose
  figure.png       ← optional: any assets, beside the writeup that uses them
  paper.pdf
```

`index.mdx` starts with frontmatter:

```yaml
---
title: HSCP Mass Reconstruction
summary: One sentence. Used on listing pages and as the meta description.
date: 2026-08-12
tags: [physics, cms]
draft: false
---
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | `<title>`, the listing heading, and `stat` in the shell |
| `summary` | yes | listing subtitle and `<meta name="description">` — write it for a stranger |
| `date` | yes | `YYYY-MM-DD`. Sorts the listings, newest first |
| `tags` | no | drives the `tags` command; lowercase |
| `draft` | no | `true` hides it from the web but keeps it in the OS |
| `venue` | no | for `presentations` — the event |
| `location` | no | for `presentations` — where it was |
| `orgs` | no | ids of organisations in `content/home/graph.json` — see [Joining the graph](#joining-the-graph) |
| `fields` | no | ids of fields of study, same file |
| `tools` | no | ids of tools and languages, same file |
| `related` | no | other entries, by slug — or `collection/slug` when a slug exists in two collections |

Any other field you add stays in the file, so `cat` in the OS shows it and it
costs nothing to add. It is **not** shown by `stat`, which prints only the named
fields above — making `stat` show every field is on the
[OS backlog](os/backlog.md).

`title`, `summary`, and `date` are enforced: a missing one **fails the build**
with the file path, rather than shipping a blank `<title>`.

**A summary starting with `DRAFT` is a placeholder**, and `pnpm build` lists
every published entry that still has one. It is a warning, not a failure — the
build continues — until launch.

**Keep a colon out of the `title`.** YAML would force you to quote it, and
`lib/content.test.ts` asserts that the raw file contains `title: <the title>`
verbatim — because `cat` and `stat` show the file on disk, and a quoted title
means the two surfaces no longer agree about what a writeup is called. An em
dash does the same work as a colon and needs no quoting.

Then write MDX — markdown, plus React components if you register them in
`components/mdx.tsx`. See the caveat at the bottom before you do.

---

## What happens to it

```mermaid
flowchart LR
    DISK[("content/papers/&lt;slug&gt;/index.mdx")] --> LOADER["lib/content.ts<br/>read once at build time"]
    LOADER --> ENTRIES["listEntries() · getEntry()"]
    LOADER --> TREE["os/vfsTree.ts<br/>buildVFSTree()"]
    ENTRIES --> ROUTES["/papers/&lt;slug&gt;<br/>prerendered, crawlable"]
    TREE --> VFS[("the VFS")]
    VFS --> OS["the OS: ls · cat · grep · stat · open"]
    DISK -. "non-MDX files" .-> PUBLIC[("public/content/")]
    PUBLIC --> ROUTES
    PUBLIC --> OS
```

One read on disk feeds both surfaces ([D-010](decisions.md)), which is why the
web page and the OS can never disagree about what a paper says.

**On the web** — `/papers/<slug>` is prerendered. The prose is in the server
markup, so it works with JavaScript disabled.

**In the OS** — the same file. `cat` prints it exactly as stored, frontmatter
and all. `stat` prints its title, summary, date, tags and draft flag. `grep` searches the text,
`tags` indexes the tags, `open` hands it to the viewer.

**Assets** — anything that is not `.mdx` or `.md` is mirrored into
`public/content/` by a prebuild step ([D-012](decisions.md)) and appears in the
VFS as a node carrying a `src` rather than inline bytes. That is how a PDF stays
out of the page payload.

---

## Joining the graph

The home page is a knowledge graph of the work, and an entry joins it by
naming what it connects to ([D-039](decisions.md)):

```yaml
orgs: [iris-hep]
fields: [physics, cs]
tools: [typescript, python, redis]
related: [hq-agc-demo-day]
```

Each id in `orgs`, `fields` and `tools` must exist in
`content/home/graph.json` with the matching `kind`; `related` names other
entries. Anything that does not resolve **fails `pnpm test` naming the file**,
and fails the build once the home page renders the graph. A reference to a
*draft* is fine — the edge simply is not drawn until the draft is published
([D-040](decisions.md)). Drafts are validated too, so a typo is caught while
you are still writing.

Only published entries are nodes. A tool that only drafts use is hidden.

### `content/home/graph.json`

Everything in the graph that is not an entry, plus the layout:

```json
{
  "nodes": [
    { "id": "iris-hep", "kind": "org", "label": "IRIS-HEP", "angle": 40, "href": "https://iris-hep.org" },
    { "id": "gettysburg", "kind": "org", "label": "Gettysburg College", "angle": 100, "since": 2024 },
    { "id": "python", "kind": "tool", "label": "Python", "angle": 75 }
  ],
  "links": [["fermilab", "cern-cms"]],
  "entries": {
    "papers/hq": { "angle": 20 },
    "projects/personal-os": { "angle": 170, "opens": { "href": "/os", "label": "Launch the OS" } }
  }
}
```

| Key | Meaning |
|---|---|
| `nodes[].id` | lowercase kebab-case, unique — what frontmatter refers to |
| `nodes[].kind` | `org` or `field` (inner ring), `tool` (outer ring) |
| `nodes[].label` | what the graph shows |
| `angle` | degrees **clockwise from 12 o'clock**, like a clock face. Optional — see below |
| `since` | the year a node joins the timeline, when no entry dates it well. Otherwise it joins with its earliest published entry |
| `href` | optional; a site path or an `https://` URL |
| `summary` | optional; the inspector's text for a non-entry node |
| `links` | edges between two non-entry nodes |
| `entries` | per entry, keyed `collection/slug`: an `angle`; a short `label` when the title is too long for the graph (the inspector still shows the full title); and `opens` — the node becomes a link to `href` instead of opening the inspector. Used once, for the OS |

Unknown keys fail too, so a misspelt `angel` is caught rather than ignored.

**Angles.** Rings do not move and nothing is simulated ([D-041](decisions.md)).
Set an angle by hand wherever you care where a node sits. A node without one is
placed at the average angle of what it connects to on the ring inside it, or in
the widest gap on its ring. `pnpm test` fails if two nodes on a ring end up
too close in any year of the timeline — the message names the ring, the year,
and every angle on it, and the fix is to hand-set one.

**Labels.** `pnpm test` also fails if a label would overlap another label or
another node's mark — checked at full size and at 80%, in every year. The
message names both nodes. The usual fixes are moving one of them a few degrees,
or giving a long entry a short `label`.

**Adding a new tool** is one line in `nodes`, then its id in an entry's
`tools`. A new entry needs no `graph.json` change at all unless the fallback
angle crowds a neighbour.

---

## Slugs

The directory name becomes three things:

```
content/papers/hscp-mass-reconstruction/index.mdx   ← directory
        /papers/hscp-mass-reconstruction            ← public URL
        /papers/hscp-mass-reconstruction/index.mdx  ← VFS path
```

The mapping is one-to-one with no lookup table, so **renaming an entry is
renaming its directory** — everything follows.

Cheap now. Once anything links to a URL, renaming means maintaining a redirect
forever, so settle slugs before publishing. Lowercase kebab-case, no dates (the
date is frontmatter), and chosen to still make sense in two years. A test
enforces the character set.

---

## Drafts

`draft: true` removes an entry from the listings, from `generateStaticParams`,
and from its route — which returns 404. It stays in the VFS, so you can read and
`grep` work in progress inside the OS without it being crawlable.

The asymmetry is deliberate and asserted by `pnpm verify:content`.

---

## Adding a collection

Collections are the top-level groupings — `projects`, `papers`, `presentations`.

The split is by *artifact*, not by venue ([D-026](decisions.md)): `papers` is
written research, `presentations` is anything delivered at an event, posters
included, because a poster's metadata looks like a talk's and nothing like a
paper's. Attending a conference without presenting does not earn an entry.

Adding a collection takes four steps:

1. `content/<name>/` with at least one entry
2. add `'<name>'` to `COLLECTIONS` in [lib/content.ts](../lib/content.ts)
3. copy `app/(site)/(reading)/papers/` to `app/(site)/(reading)/<name>/` — the
   listing page and the `[slug]` route, both of which are thin wrappers; change
   the collection string
4. add it to the nav in `app/(site)/layout.tsx`

Step 2 is easy to forget, so `pnpm test` fails if a directory under `content/`
is not a declared collection. Without that guard, forgetting it means the
entries appear **in the OS but have no web pages** — a silent half-state, and
the exact failure this pipeline exists to prevent.

---

## Two caveats

**Embedded React components render differently in the two surfaces.** The web
route compiles MDX properly; the OS viewer uses `react-markdown`
([D-016](decisions.md)) and would show raw JSX as text. Nothing uses this yet.
If you want a live demo inside a writeup, say so — the viewer needs handling
first.

MDX comments — `{/* … */}` — are safe: both surfaces strip them, so they are a
good place for working notes while a writeup is in progress. **An HTML comment
is not**, and neither is a stray `{` or `}` in prose or inside a comment: any
`{…}` is parsed as a JavaScript expression, and a malformed one fails the build
with `Could not parse expression with acorn` rather than pointing at the line.

**`content/home/`** is not a collection — it is loose content. Every text file
in it is also in the OS at `/home`, inlined so `cat` works; anything else gets
a `src` like an entry asset. Which surface reads what:

| File | The site | The OS |
|---|---|---|
| `whoami.md` | `/about` ([D-036](decisions.md)) | `whoami`, `cat` |
| `graph.json` | `/`, the graph ([D-039](decisions.md)) | `cat`, the viewer |
| `about.md` | — | the About app |
| `readme.md` | — | `cat` — a guide to the filesystem |
| `now.md` | — | `cat` |

A file the site reads is read by name, in exactly one place; adding a file here
does not put it on the web.

Markdown files under `content/home/` that have a web route are **compiled as
MDX**, so the comment rule above applies to them too — even though they are
`.md`. `graph.json` is parsed as JSON, and JSON has no comments: use the
`$comment` key.

---

## Checklist

```bash
pnpm test        # frontmatter, slugs, collection layout
pnpm build       # every published entry should appear as ● (SSG)
pnpm dev         # then check /papers/<slug> and `open` it in the OS
```
