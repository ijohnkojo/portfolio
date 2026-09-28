# Test fixtures

`content/` here is a miniature content tree — one published entry and one
draft. `fixtureContent.ts` loads a second copy of `lib/content.ts` bound to it,
for tests that check how the pipeline *behaves*. Tests about the real `content/` directory (slugs, titles, declared
collections) still read the real one. See D-038 in `docs/decisions.md`.

Nothing outside tests reads this directory: it is not routed, not mirrored into
`public/`, and not in the OS.
