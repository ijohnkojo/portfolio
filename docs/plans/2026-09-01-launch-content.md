# Launch Content: Identity, a Curated Set, and the Domain

> **Status:** drafted 2026-09-01 · **approved and executed 2026-09-15**
>
> - [x] 1. Fact-check pass on the six drafts (attribution, dates, naming)
> - [x] 2. `whoami` — one file, two views (OS command + `/about` site route)
> - [x] 3. Curate and write the launch set — prose drafted for all three
> - [ ] 4. Flip `draft: false` on the launch set only — **deliberately not done**
>       · *2026-09-27: done by the author in `516e366` — all six, not only the
>       launch set, with the summaries still reading `DRAFT — replace this.`*
> - [x] 5. SEO/metadata pass: `metadataBase`, OG tags, sitemap, robots
>       (favicon still the Next.js default)
> - [x] 6. Site chrome: contact/links in the footer, name on the landing page
> - [ ] 7. Deploy: Vercel + domain DNS — needs account access
>
> **Deviations:**
>
> 1. **Step 4 was not executed, and that is the point.** The prose in all three
>    entries was drafted by Claude from verified sources — the git log, the two
>    decks, the analysis README. The facts are checked; the sentences are not
>    the author's. Publishing first-person claims about someone's own research
>    before they have read them is the one failure this plan exists to prevent.
>    Each entry carries a `REVIEW BEFORE PUBLISHING` comment naming what to
>    check. The flip is one line per file afterwards.
> 2. **The lightning talk was dropped entirely** rather than given its own
>    entry — one talk told properly beats two that overlap.
> 3. **A `now.md` was added** alongside `whoami.md`, but deliberately got no
>    command of its own. Reasoning recorded as [D-036](../decisions.md).
> 4. **`hq`'s date moved to 2026-08-30**, the end of the fellowship, rather
>    than 2026-08-28, the last commit — it marks the end of the body of work
>    rather than the last push.
> 5. **HSCP's date is 2025-10-13**, its last commit. The repository is at
>    `~/work/optimizing_DEDx_estimator`, not on GitHub alone, and its README
>    settled the secondary-peak question: it is written as an observation in a
>    prototype, which is how that README frames it and is weaker than the
>    earlier draft's phrasing here.
> 6. **A colon is now banned from `title` frontmatter**, discovered by
>    `lib/content.test.ts` failing on the first draft of the demo-day title.
>    Documented in [../authoring.md](../authoring.md) rather than worked
>    around.
>
> Read [../../AGENTS.md](../../AGENTS.md) and [../README.md](../README.md)
> first; everything below assumes them.
>
> **Corrections received 2026-09-15**, folded in below: the fellowship ended
> **2026-08-30**; the "CoDaS-HEP talk" was **a remote meeting that merely
> coincided** with being at CoDaS-HEP; `both-sides` is a **former GitHub
> username of the author's**, not a second person; and the four disputed `hq`
> features are confirmed **not the author's work**. The attribution question is
> closed — see Step 1.
>
> Launch trio **confirmed**; domain is **`ijohnkojo.dev`**. Both decks were
> read from `~/irishep/` on 2026-09-15 and the talk question is settled: the
> entry is the **IRIS-HEP AGC Demo Day** talk of **2026-07-17**, and the
> separate lightning talk is dropped. The directory has been renamed to
> `content/presentations/hq-agc-demo-day/` and its false CoDaS-HEP frontmatter
> replaced. **Nothing is blocked.**

## Context

The site has never shown a visitor who built it. `content/home/about.md`
describes the OS's architecture, not its author — there is no bio, no contact
link, and no name anywhere in `app/(site)/`. Every entry under `content/` still
carries `draft: true`, so the public site currently lists nothing, which
`docs/README.md` already names as the largest gap between what's built and what
a visitor sees. A domain has now been bought and needs a site worth pointing it
at.

None of this needs new architecture. `lib/content.ts` already reads files once
and feeds both the crawlable web routes and the OS ([D-010](../decisions.md#d-010--2026-08-12--active));
this plan reuses that pattern for a bio and asks the same discipline of six
half-written drafts that it already asked of everything else here: write for a
stranger, ship only what's checked.

## Step 1 — Fact-check pass

Nothing gets prose until the facts under it are confirmed. Per-entry, from the
notes already left in each draft:

- **`hq` — attribution: closed, and it inverts the draft's worry.** Verified
  against `~/irishep/hq` on 2026-09-15. `both-sides` is a former GitHub
  username of the author's, and its single commit is a merge
  (`5807a4d`) carrying no authored work — so including it changes nothing.
  The four disputed features (peakRSS, per-task subprocess isolation, Redis
  Streams/fault recovery, heartbeat telemetry) are confirmed **not yours** and
  must not be claimed.

  The real problem is the opposite one: **the draft is stale and undersells
  you by a month.** Its notes stop at 2026-07-22. The log shows 22 commits
  from 2026-06-08 to 2026-08-28, and everything after July is missing from the
  draft entirely:

  | Date | Work | Commit |
  |---|---|---|
  | Jun 21–25 | client/worker split, server-side TLS, HTTPS option, certs via env vars | `8daa669` `c1fd11d` `f60b3af` |
  | Jun 25 | circular-import fix in `util.ts` | `7ac0e1f` |
  | Jul 10 | per-client unique IDs | `1d2a5d1` |
  | Jul 22 | `HQExecutor`; results to a shared FS via `HQ_RESULT_DIR` | `15ca208` `9811e59` |
  | **Aug 13** | **workers running the Analysis Grand Challenge** — Coffea runner/ship smoke tests, `agc_hq_vs_futures.py` benchmark, cabinetry configs | `27894e1` |
  | **Aug 13** | **full codebase documentation**, `testrun.sh` | `1e00a74` `0cd0abe` |
  | **Aug 24** | AGC ttbar pipeline split into its own `agc-hq` repo; docs into `hq_docs` | `f8f388a` `897bced` |
  | **Aug 28** | **`histserv` option** — `src/hq/histserv.py`, plus architecture/ops docs | `0185dd0` |

  That August work is the strongest material in the entry and none of it is
  written down. It also turns the writeup from a list of patches into an arc:
  *make it deployable → give it an executor → prove it on a real physics
  workload → document it so someone else can run it.* `~/irishep/agc-hq` and
  `~/irishep/hq_docs` are your own repos and should be linked from the entry —
  probably as part of this story rather than as separate portfolio items.

  Two follow-ons: the entry's `date: 2026-07-22` predates half the work and
  should move (2026-08-28, last commit, or 2026-08-30, fellowship end); and
  `~/irishep/hq` has an uncommitted `README.md` change sitting in the working
  tree.

  **The slide decks independently confirm the attribution boundary.** Both
  list requeue-on-timeout, worker telemetry on heartbeats, per-task software
  environments and fault-injection hardening under *next on the roadmap* —
  i.e. as work not yet done at the time you presented. That is the same set
  you said you never got to, arrived at from a second source. The line is
  solid; write to it confidently.
- **The talk — ~~done~~ 2026-09-15.** The entry claimed
  `venue: CoDaS-HEP 2026`, `location: Princeton University` and lived at
  `content/presentations/codas-hep-2026-hardening-hq/` — a slug that
  [../authoring.md](../authoring.md) turns into both the public URL and the VFS
  path. All three were false; the talk was remote and CoDaS-HEP week merely
  overlapped it.

  **Resolved:** the entry is the **IRIS-HEP Analysis Grand Challenge Demo Day**
  talk, **2026-07-17**, `location: Remote`, renamed to
  `content/presentations/hq-agc-demo-day/`. The separate IRIS-HEP lightning
  talk (3 slides, `~/irishep/docs/irishep_lightning_talk_hq.pptx`) is
  **deliberately dropped** — it covers the same subject less well, and one talk
  told properly beats two that overlap.

  `hq-agc-demo-day` keeps the occasion in the slug and still honours the naming
  rule: "demo day" describes what the talk *was* — a live demo — not merely
  where it happened. The wrong venue is what stays out of a path.

  Still to do: convert the deck to PDF
  (`soffice --headless --convert-to pdf`) and drop it beside `index.mdx`, where
  it is served and openable in the viewer app. The "presented remotely while at
  CoDaS-HEP" detail belongs in the prose, not the frontmatter.
- **Academic Explainer** — decide whether the directory stays
  `academic-explainer` or becomes `the-professor` (repo name); the slug
  follows the directory either way.
- **NanoGlide** — decide which date anchors it: repo creation (2023-12-26,
  current) or last push (2026-03-10); the demo video is worth embedding, not
  just linking.
- **HSCP Mass Reconstruction** — the date is a placeholder; pick internship
  period, the PHY 477 paper, or last commit.
- **TreeViz** — no open questions beyond the general "write it."
- **Why the demo day is the talk worth keeping.** Six slides, and it carries a
  **live demo** — the stack brought up on TLS, a long `map` through
  `HQExecutor`, a worker killed mid-run to show what survives, then Redis and
  the server stopped and restarted to show the queue is still there. "I killed
  a worker in front of an audience" is a materially different claim from "I
  wrote a task queue," and it is the kind of thing a portfolio should lead
  with. Slide 5 is better still: it states plainly what *didn't* survive — a
  claimed task hits the ~30s heartbeat timeout and is marked lost rather than
  requeued — and names the at-least-once caveats of the fix. Write that in.
  Saying where the system breaks is the most credible thing in the deck.

  It also supplies the framing the `hq` writeup needs and the draft lacks: why
  pull-based at all (Dask's scheduler is a single Python process, so task
  assignment, dependency tracking, worker state and result routing all
  serialize on one thread, and its state is in memory — stop it and it's
  gone), against hq's durable Redis-snapshotted queue where stopping for the
  day and resuming later is a supported workflow. Both decks state that
  existing HEP tools generally don't support stop-and-resume. That is the
  entry's thesis, already written in your own words.

## Step 2 — `whoami`: one file, two views

Per your answer: the bio lives as an OS-native `whoami` (file + command), and
the marketing site also gets a page about you outside the OS. Build it the way
papers already work, not as two separate write-ups:

- `content/home/whoami.md` — the actual bio: who you are, the physics/software
  combination, and how to reach you. The slide decks supply the line you
  introduce yourself with in practice — **Michael Noamesi, Gettysburg College
  (Physics & CS)** — which is both the institution and the double subject, and
  appears nowhere in this repo yet. **Past tense on the fellowship** — it ran
  Summer 2026 and ended 2026-08-30, so "currently an IRIS-HEP fellow" is
  already wrong. `about.md` stays exactly as it is — a description of the OS
  itself, which is what the About app already reads.
- **A `/now` file is worth more than it costs, and it has a gap to fill.** The
  fellowship ended two weeks ago; without a line saying what came next, the
  newest thing on the site is a finished thing. As of 2026-09-15 that line is:
  still on `hq`, at a lower intensity now that classes are back, and starting a
  quantum-mechanics project — likely on entanglement — for an applied linear
  algebra course. One file, a few sentences, updated occasionally.

  Worth noting for later: that entanglement project is a **future
  `content/projects/` entry**. Applied linear algebra is the honest
  mathematical spine of both QM and the physics work already here, so it
  extends the existing story rather than starting a side one.
- **In the OS:** a `whoami` shell command that reads and prints it (same
  mechanism the About app uses — `kernel.fs.read`), plus the file is `cat`-able
  and `stat`-able like anything else in `/home`.
- **On the site:** a new `app/(site)/about/page.tsx`, prerendered, linked from
  the header nav in `app/(site)/layout.tsx` (which currently links `projects`,
  `papers`, `talks`, `/os` — `about` is the missing one) and from the landing
  page. Reads the same file server-side rather than duplicating the bio in
  JSX — `lib/content.ts` doesn't expose single non-collection files yet, so
  this needs a small accessor alongside `listEntries`/`getEntry`.

This is a new pattern (a singleton file feeding two renderers, not a
collection), close enough to [D-010](../decisions.md#d-010--2026-08-12--active)
that it's worth a short decision entry when it lands, referencing that
precedent rather than restating it.

## Step 3 — Curate and write the launch set

You chose a curated subset over publishing all six. **Confirmed 2026-09-15:
`hq` + the talk + HSCP Mass Reconstruction** — with one thing to settle once
the slides arrive, namely whether "the talk" is the lightning talk, the AGC
demo day, or both (they may be cheap enough together to make it a quartet).
Reasoning — `hq` is
the strongest single signal, and Step 1's findings make it stronger than the
draft implies: proving the queue on the Analysis Grand Challenge and then
documenting it for other people to deploy is exactly the evidence that
separates "wrote some patches" from "made a thing usable." The talk is its
natural companion and cheap to finish once `hq` is written — **though it now
needs a rename and corrected frontmatter first**, so it is no longer free.
HSCP is the deepest physics substance (Fermilab, a real finding — the
secondary peak) and rounds the trio into "here is a physicist who also ships
infrastructure software," which is the actual pitch. TreeViz, NanoGlide, and the VS Code
extension follow in a second pass — they're the broader, non-physics evidence,
better placed once the core story is up rather than diluting it at launch.

Say the word if you'd rather lead with one of the software projects instead
(the hackathon win reads well to a non-physics audience) — this is a genuine
call, not a formality.

For each entry in the launch set: replace the HTML-comment notes with real
prose under the section headers already scaffolded, first person, written for
someone who has never met you, per [../authoring.md](../authoring.md).

## Step 4 — Flip `draft: false`

Only on the launch set. The other three stay `draft: true` — visible in the OS
(`ls` still finds them), invisible on the web, exactly as `docs/README.md`
already describes drafts working.

## Step 5 — SEO / metadata pass

Currently missing entirely — checked directly, not inferred:

- `app/layout.tsx`'s `metadata` has no `metadataBase`, so any relative OG/canonical
  URL resolves wrong once there's a real domain.
- No `openGraph` or `twitter` metadata anywhere — sharing a link renders bare.
- No `app/sitemap.ts` or `app/robots.ts` — nothing tells crawlers the
  prerendered `/projects`, `/papers`, `/presentations` routes exist.
- The favicon is still the Next.js default.

The domain is **`ijohnkojo.dev`**, so `metadataBase` becomes
`new URL('https://ijohnkojo.dev')` and canonical URLs follow from it.

One property of `.dev` worth knowing rather than discovering: the whole TLD is
on the **HSTS preload list**, so browsers refuse plain HTTP to it outright —
there is no insecure fallback to misconfigure. Vercel provisions the
certificate automatically, so this costs nothing at deploy time, but any
`http://` URL hardcoded into metadata, an OG tag, or a sitemap entry is simply
broken rather than merely redirected. Write `https://` everywhere.

## Step 6 — Site chrome

Add contact/links (email, GitHub, and whatever else you want public) to
`app/(site)/layout.tsx`'s header or footer, and a name on the landing page
itself (`app/(site)/page.tsx` currently has none) — the two-tier "ten seconds
vs. ten minutes" read only works if the ten-second version actually has a name
on it.

## Step 7 — Deploy

Vercel, per your answer — matches the toolchain already implied by the
boilerplate `README.md`. Point `ijohnkojo.dev` at it, then run
`pnpm build && pnpm verify && pnpm test` clean before flipping DNS live, not
after.

Also replace the root `README.md`, which is still unmodified
`create-next-app` boilerplate — it is the first thing anyone sees on the GitHub
repo, and right now it describes Next.js rather than this project.

## On ship

Update this plan's checklist and status line, record any deviations (the
desktop-and-apps plan is the model for how to do that honestly), add the
`docs/changelog.md` entry, and file the `whoami` pattern as a `D-NNN` in
[decisions.md](../decisions.md) if it lands as designed in Step 2.
