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
- "Newest release" ordering is unchanged: an artist with no listed release
  sorts last. The card's release count is 0 and it shows no newest release.

## Alternatives rejected

- **Sort "newest" by the newer of the latest release and latest video** —
  changes the meaning of a sort labelled "newest release"; revisit if the
  label asks for it.
- **Widen the playlist search too** — it plays release tracks only.

## Consequences

- An admin who publishes a video credited to a public artist puts that artist
  on the index the moment the video goes live, with no release linked.
- Archiving or unpublishing an artist's last live video, with no listed
  release, removes them from the index again.
- A **home search match** is now a subset of the listed artists: the home
  search still requires a playable release or a live video.
