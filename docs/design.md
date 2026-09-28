# Site Design Doc

The portfolio site: a knowledge graph of the work as the front page, with
server-rendered pages behind every node.

> **This file is the design and the intent.** For what the code does now, see
> [architecture.md](architecture.md); for why specific choices were made,
> [decisions.md](decisions.md). Sections marked **▸ Built** or **▸ Decided**
> have been reconciled with the implementation; unmarked sections are still
> intent. The working plan is
> [plans/2026-09-27-graph-home.md](plans/2026-09-27-graph-home.md).
>
> The OS that was this site's framing until 2026-09-27 has its own design doc,
> frozen: [os/design.md](os/design.md).

---

## 1. What the site is

A visitor should be able to answer "who is this, and what have they done" in
ten seconds, without clicking anything, and then follow any thread they like.
Minimal and interactive, not a wall of prose.

- **The front page is a graph.** Me at the centre; the organisations and fields
  of the work around me; the work itself — projects, papers, talks — around
  those; and the tools and languages on the outside. The shape shows what
  connects to what before anyone reads a word.
- **Every node leads to a real page.** The graph is a way in, not the content.
  Writeups live at crawlable, server-rendered URLs, and the listings under the
  graph reach all of them with JavaScript off.
- **Content stays the source of truth** ([D-010](decisions.md)). The graph is
  derived from `content/`, not maintained beside it.

## 2. The site and the OS — ▸ Built

The web OS is one of the projects, reached from its node like any other and
booted by clicking it. It lives in `os/` as a separate project, frozen while the
site is rebuilt; the site never imports it ([D-037](decisions.md)). Work that
would change the OS waits in [os/backlog.md](os/backlog.md).

## 3. The graph — ▸ Built

As built in [architecture.md § The home graph](architecture.md#the-home-graph);
the phone layout is Phase 5 of the [plan](plans/2026-09-27-graph-home.md).

- **The centre is the one spot of colour** — a large amber disc with the first
  name inside it and a soft glow; everything else is neutral, and shape carries
  kind. The rings place the nodes but are not drawn. **▸ Decided**
  ([D-045](decisions.md)).
- **Rings at fixed, hand-set angles** — no force simulation, so the layout reads
  as designed and nothing moves when the pointer does. **▸ Decided**
  ([D-041](decisions.md)): angles live in `graph.json`, a deterministic fallback
  places anything unset, and a test keeps every ring legible in every year. Inner ring: organisations
  (IRIS-HEP, CERN/CMS, Fermilab/US-CMS, Gettysburg College) and fields (physics,
  computer science; more as work arrives). Middle ring: published entries. Outer
  ring: tools and languages.
- **Hover traces.** A node, its direct neighbours and the edges to them stay at
  full strength; everything else fades to about a fifth. Keyboard focus traces
  the same way.
- **Click inspects.** The node stays selected and an inspector opens: summary,
  tags, a link to its page, and its connections as buttons, so the panel is a
  second way to walk the graph. The inspector's ×, `Escape`, or a click on any
  blank space lets go of it. **▸ Built** The OS node is the one exception — clicking it
  boots the OS, and its mark and arrow say so before anyone clicks
  (**▸ Decided**, [D-044](decisions.md)).
- **A timeline grows the graph year by year**, defaulting to the whole of it:
  a slider over the years and a Replay that walks them, with what each year
  adds fading in where it will stay. The page without JavaScript, and the
  listings under the graph, always show everything. **▸ Built**
  ([D-047](decisions.md)).
- **Straight edges**, node to node, and none may run through a node it does
  not connect — that would draw a relation that is not there. **▸ Decided**
  ([D-046](decisions.md)).
- **Drawn in SVG with React**, no graph library — under a layer of real HTML
  controls that carry the labels and the interaction (**▸ Decided**,
  [D-042](decisions.md)). Labels are checked for collisions by a test, at two
  sizes, in every year.
- **Wider than the text around it.** The home page sits outside the reading
  column (**▸ Decided**, [D-043](decisions.md)); the listings under the graph
  return to it.

## 4. Data — ▸ Built

([D-039](decisions.md), [D-040](decisions.md); as built in
[architecture.md § The home graph](architecture.md#the-home-graph); how to use
it in [authoring.md § Joining the graph](authoring.md#joining-the-graph).)

- Entries join the graph through optional frontmatter: `orgs`, `fields`,
  `tools`, `related`. Typed references — an unknown id fails with the file
  path. References to drafts are dropped, not errors.
- Everything that is not an entry — organisations, fields, tools, their angles
  — lives in one file, `content/home/graph.json`, which the OS also shows at
  `/home/graph.json`.
- Only published entries are nodes, as with the sitemap.
- The graph is built on the server by pure functions and will be handed to a
  client component as plain data, the same shape as `/os` receiving its
  filesystem.

## 5. Phone and accessibility

- **A real phone layout** — a compact graph and a bottom-sheet inspector — not
  the desktop one shrunk.
- **Every control is a real `<button>` or `<a>`**, and the graph is navigable
  from the keyboard — one tab stop, arrow keys between nodes. **▸ Built**
  ([D-042](decisions.md)); a full accessibility pass is Phase 5.
- **Motion respects `prefers-reduced-motion`.**

## 6. Out of scope for now

Filters, search, URL-synced selection, the listings following the timeline, and
anything that changes the OS.
