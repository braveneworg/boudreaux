# ADR-0022: An artist with a live video is listed

- **Status**: Accepted
- **Date**: 2026-10-17

## Context

[ADR-0007](0007-artists-index-lists-only-directly-credited-artists.md) lists
an artist on the public `/artists` index only when they hold a direct credit
on a published release. Since the home search widened (#890), an artist with
only video credits is found by the home search and has a working artist page
and `/videos?artist=` filter, but is missing from the artists index. The
label wants every artist with something public to watch or hear on the index.

## Decision

**The artists index lists a public artist holding a direct credit (primary
or featured) on at least one published, non-deleted release, OR a video
credit on at least one live video (published, go-live moment reached, not
archived).**

- One `where` builder (`buildListedWhere`) defines the rule for the index and
  its search. The credit `OR` sits in an `AND` member after the search
  tokens, because `publicArtistWhere` owns the only top-level `OR` and two
  filters on one relation share one join on MongoDB
  (`docs/lessons/prisma-mongo/same-relation-filters-share-one-join.md`).
- The index search also matches the titles of the artist's live videos, so a
  video-only artist can be found by what they made.
- One `now` decides which videos are live for the whole read.
- The playlist "By artist" search keeps ADR-0007's release-only rule
  (`buildReleaseCreditedWhere`): it expands each match into release tracks,
  so a video-only artist would add nothing.
- The "Newest" order (labelled "Newest release" before this decision) ranks
  an artist by their newest work: the later of their newest listed release's
  `releasedOn` and their newest live video's `releasedOn`. The listing read
  selects each live video's date for this alone; the service drops it before
  the row leaves the server. An artist with nothing dated sorts last, ties by
  display name. A video-only artist's card shows a release count of 0 and no
  newest release.

## Alternatives rejected

- **Keep "Newest release" ranking releases only** — files every video-only
  artist last, however recent their video.
- **Rank a video by its go-live moment (`publishedAt`)** — a live video
  always has a `releasedOn` (ADR-0004), and the release side ranks by
  release date too.
- **Widen the playlist search too** — it plays release tracks only.

## Consequences

- An admin who publishes a video credited to a public artist puts that artist
  on the index the moment the video goes live, with no release linked.
- Archiving or unpublishing an artist's last live video, with no listed
  release, removes them from the index again.
- A **home search match** is now a subset of the listed artists: the home
  search still requires a playable release or a live video.
