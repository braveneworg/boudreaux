# ADR-0015: A release publishes its credited artists only by confirmation

- **Status**: Accepted
- **Date**: 2026-09-26

## Context

Two rules govern what the public may learn about an artist:

1. An unreleased bio is never public (#796).
2. An artist's name is not public before the artist is. This covers every
   identity field (name parts, `akaNames`, slug, image) on every public
   surface: release bylines, the release player, tour headliners, featured
   artists, the artists index, and every search.

Rule 2 collides with how credited artists come to exist. A release upload
creates its missing credited artists through
`ArtistService.findOrCreateByName`, unpublished, with names split by a naive
`splitFullName`. Most published releases are therefore credited to artists
nobody has published, and hiding those names removes the bylines.

Publishing an artist publishes everything on the row. The public artist page
gates on the public artist rule alone, and a bio has no release state of its
own, so the artist's bio, display images and reference links go live with
`publishedOn`.

## Decision

**Publishing a release publishes a credited artist only when an admin
confirmed that artist by id. `publishedOn` always records a human decision.**

- **Each artist is decided explicitly.** A publishing write carries two
  lists: the artists to publish and the artists to keep hidden. Together
  they must cover every credit awaiting confirmation. An artist is published
  or kept hidden by a decision, never by omission. In the dialog each artist
  has a toggle that starts at "keep hidden".
- **The server enforces it.** The service checks the two lists against the
  actual credits awaiting confirmation and fails with `VALIDATION`, naming
  the artists, when one has no decision, when an id to publish does not
  await confirmation, or when an id is in both lists. The dialogs are how
  the lists are built; they are not the gate.
- **A release is always created unpublished.** Its credits are stored after
  it, so `ReleaseService.createRelease` drops any publication date and
  publishing goes through `publishRelease`, which checks the stored credits.
- **Who decided is recorded.** `publishedBy` on each artist is the admin's id
  from the session, never a value from the request.
- **A credit awaits confirmation** when stamping `publishedOn` would make its
  artist public: no `publishedOn`, current or alumni, not deleted.
- **A credit stays hidden** when publishing cannot make it public: the artist
  is soft-deleted, or inactive with no departure date. Such credits are
  reported to the admin with the reason. They never block a publish and are
  never modified by one.
- **The confirmation shows what goes live** for each artist: bio state (none,
  hand-written, or generated with its date), display image count, and a link
  to the artist's admin page.
- **A write never publishes a release in the same request that leaves it with
  unconfirmed credits.** An upload with `publish: true` that creates or finds
  such credits saves the release unpublished and returns them. The admin
  confirms, and the ordinary publish runs with ids. When every credit is
  already public, the upload still publishes in one call.
- **Hiding an artist always succeeds.** Archiving an artist is never blocked
  by the work that credits it. The confirmation lists the published releases
  and tour dates that will lose the name. When that list cannot be loaded
  the archive goes ahead without it: a takedown must not depend on a read.
- **A published release with no byline is a legitimate state.** "A published
  release has only public credits" is not an invariant. Filtering hidden
  artists out of every public read is what guarantees rule 2.
- **The name lookup never returns a soft-deleted artist.** When one still
  owns the slug, the new artist takes a numbered slug (`name-2`).
- **Existing data is backfilled by the same rule.**
  `scripts/backfill-publish-credited-artists.ts` writes a candidates file, a
  human prunes it, and only the ids left in it are published.
- **Free-text names are the admin's responsibility.** `Video.artist`,
  `FeaturedArtist.displayName`, and the titles and descriptions of releases
  and tours are typed by an admin and are not gated.

## Alternatives rejected

- **All or nothing: the confirmed ids must equal the awaiting credits.** An
  admin could then publish a release only by publishing every credited
  artist, or by removing the credit of a doubtful one. It contradicts the
  backfill, which lets a human leave artists hidden, and the decision that a
  release with no byline is a legitimate state.
- **One list, anything not confirmed stays hidden.** A caller that sends an
  empty list would publish with no decision made.

- **Silent cascade: publishing a release publishes all its credits.** The
  first plan. It keeps every byline with no extra step, but it turns
  `publishedOn` into a side effect of a decision about a different record.
  Rules 1 and 2 would then hold only by definition, and every auto-created
  artist page, with whatever bio sat on the row, would go live unread.
- **Confirmation in the dialog only.** Any write path without a dialog, such
  as the upload flow or the admin API, would be a silent cascade.
- **Block the publish until every credited artist is published.** The
  strongest gate, but it makes each upload a multi-step job in the admin.
- **The name is public by credit, the page stays gated.** No cascade and no
  backfill, but it relaxes rule 2.
- **A separate release state for the bio.** A second publication state on
  one record, with its own gate on every bio read, to cover a case that one
  line in the confirmation handles.
- **Blocking a takedown while the artist is credited.** Removing an artist
  from the site must not depend on first handling other records.
- **Confirming artists by name before they exist.** The server would have to
  match confirmed names to the rows it creates, through the same name
  splitting that makes those rows doubtful.

## Consequences

- An upload that credits a new artist takes two steps to publish. Today no
  screen sends `publish: true` with an upload, so this is a server rule with
  no dialog of its own.
- Archiving is the only way the admin UI hides an artist. There is no
  unpublish action for artists, and permanently deleting an artist applies
  only to one already archived, so neither shows the warning.
- A publishing save on the release form is held until the admin answers. If
  the admin cancels, the form takes back the publication date the publish
  button set, so a later plain save does not publish by accident.
- A release credited only to hidden artists is public with no byline, and
  its player runs without an album artist.
- The public listings are cached per process for ten minutes. The services
  clear them after every write that changes whether an artist is public. A
  script cannot, so bylines published by the backfill appear once the cache
  expires.
- Running the backfill twice with the same file is refused, because its ids
  are no longer candidates.
- A soft-deleted artist and its numbered successor can both exist. Restoring
  the deleted one leaves two artists for an admin to merge by hand.
