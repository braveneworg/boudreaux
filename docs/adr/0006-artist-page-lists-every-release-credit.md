# ADR-0006: An Artist's page lists every release they are credited on

- **Status**: Accepted
- **Date**: 2026-09-14

## Context

The public artist page took its releases from one place: the artist's own
`ArtistRelease` join rows. An artist whose work was linked only to their band
(a separate Artist row, e.g. "Gregory Pepper & His Problems") or who only ever
appeared as a guest on someone else's release showed "No releases available".

The schema has no per-release role. `ArtistRelease` is a bare join with no
`role` column (unlike `VideoArtist`, which carries `PRIMARY | FEATURED`), and
`FeaturedArtist` is an editorial homepage slot, not a release credit. What the
data does carry is an **order**: the admin release form submits `artistIds` as
an ordered list, and the admin release listing already treats the first
`ArtistRelease` row as the **album artist**. Band membership exists as
`ArtistMember` rows (`memberOf`).

## Decision

**The artist page lists every published release the artist is credited on,
tagged with a derived release credit, and ordered own-releases-first.**

- A **release credit** is derived when the page is built, never stored:
  - `primary` — the artist is the release's first credit (its album artist),
    or the release has no credits at all;
  - `featured` — the artist is credited on the release but not first;
  - `member` — the release belongs to a band the artist is a member of and
    the artist is not credited on it directly.
- Band releases are loaded through `memberOf → artist → releases` with the
  same release graph as the artist's own rows, and folded into the one
  `releases` list by the service. The band graph itself is not exposed.
- Each release is listed once. A direct credit wins over a band route; when
  two bands share a release the first band's row keeps the slot.
- Order is by credit (`primary`, `featured`, `member`), newest first within
  each credit. The client applies the same comparator after its playable-track
  filter so the order survives.
- The release picker labels a non-primary release with its album artist
  ("by The Problems"); own releases carry no label.

## Why this is surprising without context

- "Featured" is a **position**, not a flag. Reordering the artists on the
  admin release form changes which artist the release belongs to on the public
  site. That is the existing album-artist convention made load-bearing.
- A release can appear on an artist's page without any row linking the two:
  the link runs through the band. Deleting the `ArtistMember` row removes it.
- The published/non-deleted filter is applied in the service, not the query.
  The reason first recorded here, that Prisma MongoDB cannot put a `where` on
  a junction-table include, was wrong: a probe on 2026-09-28 showed it can
  (`docs/lessons/prisma-mongo/junction-include-where-works.md`). The filter
  stays in the service for a different reason: a release's credit is derived
  from its full credit order, so hidden artists must be read before they are
  dropped ([ADR-0015](0015-a-release-publishes-its-credited-artists-only-by-confirmation.md)).

## Why this is hard to reverse

The `credit` field is part of the artist-detail wire contract (Zod-validated
on the client) and the picker's ordering and labels depend on it. Removing it
means removing the ordering and labels with it.

Note (2026-10-19, #906): the artist-detail payload no longer carries the
credit-tagged release list. It is now the artist page model
(`src/lib/services/artist-page-model.ts`), which carries the latest release
and whether any listed release exists, band releases included. The credits
are still derived from the full credit order, to decide which releases
count: a direct credit (`primary` or `featured`) can lead the page, and a
band's release counts without leading it.

## Trade-offs accepted

- ~~Credit order depends on `ArtistRelease` insertion order. `syncArtistReleases`
  only inserts missing rows, so reordering artists on an existing release does
  not reorder existing rows; the admin listing shares this limitation.~~
  **Closed 2026-10-03:** credit order is a stored fact. `ArtistRelease.position`
  (dense from 0; position 0 is the album artist) is written whole by
  `syncCredits` from the form's list order (inside the release save's own
  transaction since 2026-10-04, `_internal/release-credits.ts`), so moving
  an artist to the front makes it the album artist, and every credit read
  orders by `creditOrderBy` (`position`, then `id` for rows that predate the
  field — their insertion order). `scripts/backfill-credit-positions.ts`
  stamps the rows written before the field existed; until it runs, those
  rows read in the order they always did.
- There is no admin UI for `ArtistMember` rows yet; band membership is data
  entered by script. Until it exists, a member's page shows band releases only
  where that data has been entered.
- A release with no playable MP3 tracks is still hidden by the player's
  playable-track filter, unchanged by this decision.

## Amendment (2026-10-06): the page leads with the latest release

The artist page redesign (ADR-0019, ADR-0020) keeps every rule above and
moves where the list lives. The page itself leads with one release: the
newest listed release the artist holds a **direct** credit on (`primary` or
`featured`), summarised by `summarizeListedReleases` exactly as the artists
index card is, as `newestRelease` on the artist graph. When the release is
playable its line links to the release deep link and a plain left click
primes track 1 in the gesture and opens the listening modal in place (the
`/releases` Play flow); otherwise the title is plain text (ADR-0023). The
modal's footer and the line beneath both lead to the full list. A featured credit names the album artist ("by …"), and a hidden album
artist leaves that empty (ADR-0015).

The full list — every credit, in the order above, under a heading per credit
group when there is more than one — is `/artists/[slug]/releases`, a Server
Component over the same cached read, rendering `ReleaseCard`s with the same
Play flow. The release picker and the artist player are gone, and so is the
`?release=` query the nav search used to deep-link into the picker: a
release picked in the search opens its listening modal in place (ADR-0023).

## Amendment (2026-10-15): the full list is the filtered releases listing

`/artists/[slug]/releases` is gone, and its URL is a 404 with no redirect.
"View all releases", beneath the latest release and in the listening
modal's footer, opens `/releases?artist=<slug>`.

- The `?artist=` filter matches every credit above: a direct credit
  (`primary` or `featured`) by the public artist with that slug, or a
  credit by a public band they are a member of. A hidden band's releases
  are not listed, as on the old page. The `where` was proved on Docker
  Mongo (`release-artist-filter.contract.spec.ts`).
- The order rule above no longer holds for the full list. It is the
  listing's one paged grid, newest first, with no credit groups. Each card
  is captioned with its album artist, so a featured or band release names
  who leads it. The latest release still counts direct credits only.
- The listing names the artist ("Releases by …") under its wordmark. A slug
  naming no public artist is a 404, as the artist page is.
- An artist whose only releases are their bands' has no latest release.
  Their page reads "No releases of their own yet" and still links to the
  filtered listing.

Trade-off accepted: band membership changes do not invalidate the listing's
cache. Only the unfiltered first page is cached, so the filtered listing
is read fresh, and no stale band release can show there.
