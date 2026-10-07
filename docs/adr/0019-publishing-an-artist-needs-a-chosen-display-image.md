# ADR-0019: Publishing an artist needs a chosen display image

- **Status**: Accepted
- **Date**: 2026-10-06

## Context

The redesigned artist page is built around the artist's display images: the
chosen set is the page's collage and its first image is the index card's
photo ([ADR-0008](0008-display-images-are-chosen-by-humans-and-survive-regeneration.md),
second addendum). An artist page with no chosen image has no collage, and
the fallback tiers ([ADR-0008](0008-display-images-are-chosen-by-humans-and-survive-regeneration.md),
first addendum) depend on what a bio generation job happened to find and
on alt text nobody checked. The page was designed for an artist someone
has looked at.

Publishing an artist is already a human decision on every path
([ADR-0015](0015-a-release-publishes-its-credited-artists-only-by-confirmation.md)):
the edit form's Publish, the admin list's Publish, the release credit
confirmation, and the backfill script. None of them asked whether the
artist had anything to show.

## Decision

**An artist is published only with at least one chosen display image, on
every path that first publishes it. A published artist's chosen set can
never become empty.**

- **The service is the gate.** `ArtistService.updateArtist` refuses a
  `publishedOn` for a stored artist that is unpublished and has no chosen
  image; `publishArtist` refuses the same way; `createArtist` refuses any
  `publishedOn` (an artist is created unpublished and published once it has
  an image). The refusal is `VALIDATION` and says why. A save of an already
  published artist re-sends its `publishedOn` and is not re-checked.
- **The credit confirmation cannot publish an imageless artist.**
  `checkCreditDecisions` rejects a publish id whose artist has no chosen
  image, inside the release save's transaction too. Such a credit can only
  be kept hidden; the release still publishes, without that byline
  ([ADR-0015](0015-a-release-publishes-its-credited-artists-only-by-confirmation.md):
  a published release with no byline is a legitimate state). The dialog
  shows the chosen count and disables the toggle with the reason.
- **The backfill script refuses imageless ids.** A human prunes the
  candidates file as before; an id left in it that has no chosen image fails
  the run with its slug.
- **Two guards keep a published artist's set non-empty.**
  `setDisplayImages([])` is refused for a published artist, and
  `deleteBioImage` refuses to delete a published artist's last chosen image.
  Both key on `publishedOn`, the same field the public reads key on.
- **Grandfathered artists are not unpublished.** An artist published before
  this rule with no chosen image stays public, renders the fallback tiers
  or an inert placeholder tile, and is badged "No display image" in the
  admin list. The rule applies to the next publish, not retroactively.
- **Create-and-publish leaves the admin UI.** The create form saves an
  unpublished artist; the edit form's Publish appears once the artist exists
  and is enabled once an image is chosen.

## Alternatives rejected

- **Gate only the forms, let the credit confirmation and the backfill
  publish imageless artists.** Those two paths publish most artists (an
  upload creates its credited artists unpublished), so the page the rule
  protects would be the common case, not the exception.
- **Auto-choose the job's suggestion when publishing.** It turns a
  suggestion into a human choice nobody made, which
  [ADR-0008](0008-display-images-are-chosen-by-humans-and-survive-regeneration.md)
  exists to prevent, and the suggestion often lacks alt text.
- **Unpublish grandfathered artists until an image is chosen.** A takedown
  of live pages for a layout change.
- **A UI-only rule.** The service is the only place every path passes
  through; the API and the scripts would publish around a disabled button.

## Consequences

- A release that credits auto-created artists needs a chosen photo per
  artist before those bylines can go live. The byline waits, the release
  does not. This is the cost the label accepted for a page that always has
  something to show.
- Two check-then-act races remain, of the same class `setDisplayImages` and
  the hard-delete refusal already accept: an image deleted while a publish
  is in flight, or chosen while a delete is. The admin UI disables the
  control first; the service's refusal is what a race hits.
- `deleteBioImage` now returns a `ServiceResponse` so its refusal can carry
  a reason; its callers show it.
