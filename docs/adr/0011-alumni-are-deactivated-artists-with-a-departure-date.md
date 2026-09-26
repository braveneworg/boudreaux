# ADR-0011: Alumni are deactivated artists with a departure date

- **Status**: Accepted
- **Date**: 2026-09-26

## Context

The public `/artists` index gains a Current / Alumni / All roster filter
(issue #769). Until now every public artist query filtered `isActive: true`,
so a deactivated artist was simply hidden. The `Artist` model carries three
fields that could define "alumni":

- `isActive` (required, `@default(true)`) — "whether the artist is currently
  active; used for filtering in listings".
- `deactivatedAt` / `deactivatedBy` — "when the artist was deactivated; ie.
  left the label".
- `reactivatedAt` / `reactivatedBy` — "when the artist was reactivated; ie.
  re-signed with the label".

No code path writes any of them. `isActive` is only ever set to its default,
and the timestamps are set by hand or by script, if at all.

## Decision

**An alumnus is a listed artist with `isActive: false` and a recorded
`deactivatedAt`. A current artist is a listed artist with `isActive: true`.
"All" is either.**

- `isActive` is the state and the timestamps are its history. Re-signing sets
  `isActive` back to true, which makes the artist current whatever the
  timestamps say, so `reactivatedAt` plays no part in the rule.
- Requiring `deactivatedAt` keeps the filter from exposing artists that were
  hidden for some other reason. Before this change `isActive: false` meant
  "not on the public site"; an inactive row with no departure date keeps
  that meaning and stays hidden everywhere public.
- `deactivatedAt: { not: null }` also excludes a document where the field is
  unset, the same guard the `publishedOn` gate relies on (the Prisma/Mongo
  null-versus-unset quirk).
- The ADR-0007 listed-artist rule (published, not deleted, directly credited
  on a published release) applies to every roster alike.
- The artist detail page resolves current artists and alumni. The index
  links every card to it, so an alumni card must not lead to a 404. It still
  hides inactive artists with no departure date.
- The playlist "By artist" search and the home-page typeahead stay on
  current artists only. Their behaviour does not change.

## Alternatives rejected

- **`isActive: false` alone.** Simpler, but it would put every hidden artist
  on the public Alumni list with no admin action involved.
- **Comparing `deactivatedAt` with `reactivatedAt`.** A second source of
  truth for state that `isActive` already holds, and Prisma on MongoDB
  cannot compare two fields in a `where` without a raw aggregation.

## Consequences

- To move an artist to Alumni, an admin (or a script) must set `isActive`
  to false AND set `deactivatedAt`. There is no admin UI for either yet.
- An artist card under "All" does not say whether the artist is current or
  alumni. Labelling it would need `isActive` added to the listing row.
