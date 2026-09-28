# Decision Review

A periodic audit of [decisions.md](decisions.md) and
[architecture.md § known gaps](os/architecture.md): which choices have gone stale,
which costs have become live, and what is worth doing next.

Distinct from the other docs on purpose. `decisions.md` records *what was
decided and why*; `architecture.md` records *what exists*; this records
*judgement about both* — which is the part that goes out of date fastest and is
worth re-running rather than trusting.

**Last run:** 2026-08-12, covering D-001 … D-025.

**Stale:** this run predates the split of 2026-09-27 ([D-037](decisions.md)).
Its findings are about what is now the frozen OS, whose known gaps live in
[os/architecture.md](os/architecture.md#10-known-gaps); the site's are in
[architecture.md](architecture.md#known-gaps). The next run should cover both.

---

## How to re-run this

1. Read every decision's **Cost** line and ask whether that cost is now being
   paid in practice, or is still theoretical.
2. Check every **Revisit when** trigger against reality. A trigger nobody
   notices firing does nothing — see the finding below.
3. Cross-reference known gaps: which are *choices with reasons*, and which are
   merely absences nobody ever decided about? The second kind is the dangerous
   kind.
4. Re-scope anything whose original estimate now looks wrong in either
   direction.

---

## Findings from the 2026-08-12 run

### Two errors in the log itself

**D-008 was stale and wrong.** It read "Maximize ships; snapping and tiling do
not" and was still marked `active` — while D-021 had shipped snapping and D-023
tiling. Anyone reading the log top to bottom would have learned something false.
Now marked `superseded by D-021 and D-023`, and kept rather than deleted,
because the deferral is the point: design doc §5's "no new WM feature until N
apps need it" held the feature back until something needed it.

**D-002's revisit trigger had fired and nobody answered it.** The trigger was
"when Phase 2 snapping/tiling lands" — both landed, and the decision was never
re-examined. It held (the snap preview is imperative precisely so it stays
outside React's commit cycle, and `verify-phase2` now asserts zero commits
during a drag *with the preview running*), but that was luck rather than
process.

**The general lesson:** a revisit trigger is only worth writing if something
causes it to be read. Nothing did. Hence this document, and the convention that
shipping a feature means checking whether it fired any trigger.

---

## Live — worth acting on

### 1. No delete — and it is smaller than D-025 claimed

The original scoping said tombstones plus a schema bump. That is only true for
deleting something from the *base tree*. Restrict deletion to files the user
created and it collapses to removing the overlay entry, since the base tree is
rebuilt from `/content` on every load.

**Why act:** an editor app is the obvious next feature and "save but never
delete" is a strange system. The re-scoped version is a kernel `unlink` and
little else.

**Why not:** it is still new kernel surface, and the first primitive that
*removes* rather than adds. Everything so far only ever grew the filesystem,
which is why the overlay has been sufficient.

**The rule it produces is better than the limitation it replaces:** you can
delete what you created, not what shipped with the build — [D-003](decisions.md)
extended. Amended in [D-025](decisions.md).

### 2. Terminal `cwd` does not need the app-contract hook

Persisting app state *in general* needs a `serialize` hook, which is a Phase 3
shape. But history already persists by writing to the VFS, and **cwd could do
exactly the same** — no kernel change, no contract change.

**Why act:** a restored terminal coming back at `/` is the most visible
half-restored feel, and this removes most of it cheaply.

**Why not:** scrollback is the other half and genuinely does need the hook, so
this is a partial fix that might make the remaining gap less obvious rather than
more.

### 3. Placeholder slugs — the only item with a deadline

`project-one`, `paper-one` are stand-ins, and each is **a published URL**.

**Why act now:** real writeups are being authored. Settling slugs today costs
nothing; settling them after anything links in costs redirects, forever.

**Why not:** no reason. It is a naming decision that has to happen anyway.

### 4. The viewer will silently mis-render an embedded component

[D-016](decisions.md)'s trigger has not fired — no writeup embeds React yet —
but writing real content is exactly when it becomes possible. The route would
render the component and the viewer would show raw JSX.

**Cheap mitigation short of the full fix:** have the viewer detect JSX-looking
content and print "this writeup embeds components — open it on the web" instead
of rendering it wrong. Honest failure beats silent garbage.

**Why not the full fix:** runtime MDX evaluation is ~200KB for a capability
nothing uses.

---

## Dormant by design — leave alone

These are choices with reasons, and their triggers have not fired.

| Decision | Trigger | Reality at last run |
|---|---|---|
| [D-011](decisions.md) all content in the `/os` payload | "when the payload gets uncomfortable" | **Measured: 10.5 KB RSC.** Nowhere near — a number now, not a worry |
| [D-004](decisions.md) permissions per-app, not per-pid | "when anything runs that isn't first-party code" | Nothing does |
| [D-013](decisions.md) minimized windows stay mounted | "when an app is expensive enough" | Four cheap apps |
| [D-009](decisions.md) Playwright is not a dependency | "when there is CI" | No CI — though there are five verify scripts now, and a fresh clone cannot run any of them |
| [D-022](decisions.md) completion ignores quotes | — | Only bites on filenames with spaces; slugs will not have them |
| [D-023](decisions.md) `wm:tile` is fire-and-forget | — | Cosmetic: the shell reports success even if nothing is listening |
| [D-005](decisions.md) manifests centralized | — | Fine at four apps |

---

## The blind spot: gaps that never became decisions

Three items sit in known gaps but have **no D-number**, which means nobody ever
chose against them for a reason — they are absences by default rather than by
choice. All three are design doc §5 gotchas, and every *other* §5 gotcha was
resolved into a decision.

- **Accessibility.** §5 asks for ARIA roles, per-window focus traps, keyboard
  equivalents. Windows are divs. For a portfolio specifically, this is a signal
  about its author to anyone who checks.
- **Mobile.** §5 explicitly wants "a genuinely different full-screen single-app
  mode, not a responsive squeeze." There is nothing. A portfolio link opened on
  a phone gets a draggable-window desktop WM — close to the worst case for
  something whose purpose is being shared.
- **URL sync.** §5 warned it is "hard to retrofit," and it gets harder as more
  state accrues. The back button does nothing.

For an artifact whose job is being sent to people, mobile and accessibility are
arguably worth more than any remaining feature.

---

## Recommended order, as of the last run

1. **Settle the slugs** — deadline-driven, free today
2. **Mobile mode** — the largest gap between "impressive" and "impressive to
   someone who opens it on a phone"
3. **`unlink` + `rm`** — small now that it is scoped correctly, and unblocks an
   editor
4. **Terminal `cwd` persistence** — cheap, removes the half-restored feel
5. **Accessibility pass** — larger, and the one a reviewer would notice
