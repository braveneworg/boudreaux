# ADR-0007: The artists index lists only directly credited artists

- **Status**: Accepted
- **Date**: 2026-09-16

## Context

The public `/artists` index and the artist search disagreed about who an
artist is. The index listed every active Artist with a `publishedOn` date
(capped at 100 rows, no search); the search listed only artists holding an
`ArtistRelease` row on a published release, regardless of the artist's own
`publishedOn`. A published Artist with nothing to hear — no published release
linked to them — was a dead end on the index and invisible to search.

The search also lived on its own page (`/artists/search`) with a combobox
that waited for three characters and 400 ms, built on a raw input rather than
the cmdk primitive the `/videos` and `/releases` comboboxes use, and returned
a thinner row than the index (no bio, no genres).

## Decision

**The artists index lists a listed artist: active, published, not deleted,
and holding a direct credit (primary or featured) on at least one published,
non-deleted release. A member credit alone does not list an artist.**

- One `where` builder (`buildListedWhere`) defines "holds a listed direct
  release" for both the index and the playlist "By artist" search. Only the
  index adds the artist-level `publishedOn` gate; the playlist search keeps
  its existing rule so playlist behaviour does not change as a side effect.
- Direct credits only, for a data-layer reason: matching "credited directly
  OR through a band" needs two relation filters under one `OR`, which Prisma
  on MongoDB rejects (error 17124, see `prisma_mongodb_or_relation_size_bug`),
  and filtering in memory instead would move pagination off the database.
  Band output on the card is explained by the "Member of X" line, and the
  release count on the card counts direct credits only, so the count and the
  listing rule agree.
- Search matches every name part (title, first, middle, surname, suffix),
  display name, slug, aka names, genres, and the titles of the artist's listed
  releases, case-insensitively. The query is split into words and every word
  must match some field, so a name typed — or picked from the dropdown — as it
  is displayed ("Dr. John Q. Smith Jr.") finds an artist whose display name is
  composed from its parts.
- The index is one shared infinite query: its first page, sliced to eight
  rows, is the search dropdown, so the grid and the suggestions never
  disagree. Picking a suggestion fills the field with the artist's name and
  narrows the grid; the card is the way into the artist page.
- "Newest release" ordering is computed on read: Prisma on MongoDB cannot
  order by a relation aggregate, so the repository reads the listed roster
  whole, orders by each artist's newest listed release, and slices the page.
  No denormalised column.
- The row that leaves the server is a narrow Prisma `select`: identifying
  fields, primary bio images, the band graph as name projections, and a
  release summary. Contact fields (`phone`, `email`, address) are never
  selected; the previous index rendered `ArtistScalars` server-side only.
- `/artists/search` redirects permanently to `/artists`. The home-page
  typeahead (`ArtistNavSearchCombobox`, `/api/artists/search`) is a separate
  surface and is unchanged.

## Alternatives rejected

- **Artist-level `publishedOn` alone** (the old index rule) — lists artists
  with nothing to hear.
- **Any release credit, including member** — needs the two-relation `OR`
  MongoDB rejects, or in-memory filtering that breaks database pagination.
- **A denormalised "latest release" column on Artist** — a second source of
  truth that every release write would have to maintain; the roster is small
  enough to order on read.

## Consequences

- Publishing an Artist is no longer enough to show them publicly; an admin
  must also link them to a published release. An artist published today with
  no linked release (the production state of Gregory Pepper on 2026-09-16)
  stays hidden until one is linked.
- There is no admin writer for `ArtistMember`, so "Member of" / "Members:"
  lines appear only where that data has been entered by script.
- Both index sorts — and the playlist "By artist" search, which shares the
  A–Z order — read the whole listed roster per page and order it in memory:
  newest-release because it is a relation aggregate, and A–Z because it ranks
  by the displayed name, which is composed from the name parts when no display
  name is stored (a database sort on `displayName` files those artists first,
  outside the alphabet).
  Revisit (with a stored column or a Mongo aggregation) if the listed roster
  grows past a few hundred artists.
