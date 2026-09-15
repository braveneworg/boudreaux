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
- The published/non-deleted filter is applied in the service, not the query,
  because Prisma MongoDB cannot put a `where` on a junction-table include.

## Why this is hard to reverse

The `credit` field is part of the artist-detail wire contract (Zod-validated
on the client) and the picker's ordering and labels depend on it. Removing it
means removing the ordering and labels with it.

## Trade-offs accepted

- Credit order depends on `ArtistRelease` insertion order. `syncArtistReleases`
  only inserts missing rows, so reordering artists on an existing release does
  not reorder existing rows; the admin listing shares this limitation.
- There is no admin UI for `ArtistMember` rows yet; band membership is data
  entered by script. Until it exists, a member's page shows band releases only
  where that data has been entered.
- A release with no playable MP3 tracks is still hidden by the player's
  playable-track filter, unchanged by this decision.
