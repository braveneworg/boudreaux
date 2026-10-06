# ADR-0008: Display images are chosen by humans and survive regeneration

- **Status**: Accepted; amended 2026-09-26 (see the addendum, #767) and
  2026-10-06 (the set is uncapped; see the second addendum)
- **Date**: 2026-09-17

## Context

The public artist page and the artists index show up to three bio images
beside the short bio. Which three was decided entirely by the bio generation
job: the vision pass flagged its best guesses `isPrimary`, every regeneration
rewrote those flags, and an admin had no way to choose, order, or replace
them. The only upload path into an artist's images lived inside the rich-text
bio editor and never reached the page.

Two image systems existed on Artist. `ArtistBioImage` is what the public
pages render: re-hosted on our CDN with license and attribution, and carrying
`origin: generated | custom` so a regeneration deletes only the job's rows.
The legacy `Image` table had a full service and server actions but no UI ever
called the upload, so the "browse artist images" combobox on the featured-
artist and release forms always offered nothing.

## Decision

**An artist's display images are the ordered set of up to
`DISPLAY_IMAGE_CAP` bio images with a human-written `displayOrder`. The job's
`isPrimary` stays a suggestion, shown only while no human has chosen.**

- The pool is `ArtistBioImage`. The legacy artist `Image` path is dead and is
  removed in a follow-up; the cover-art combobox now browses bio images.
- `displayOrder` is a separate, human-owned field. Regeneration never writes
  it, and the recreated generated rows never carry it (pinned by
  `ArtistRepository.replaceBioContent` and `persistGeneratedBio` specs).
- Choosing a generated image promotes it to `origin: 'custom'` in the same
  transaction that writes its position, because `replaceBioContent` deletes
  every non-custom row. `custom` therefore means "a row a human owns", not
  "an admin upload"; the row keeps its license and attribution either way.
- One set-style action, `setArtistDisplayImagesAction(artistId, imageIds)`,
  replaces the whole set: the cap, uniqueness, ownership, and alt-text rules
  are properties of the set, so the service checks them atomically and a
  reorder is one round-trip.
- Alt text is what makes a display image publishable, because the public
  page renders display images as content, not decoration: a chosen image
  with a blank alt is backfilled with the artist's name by the set action,
  the same default an upload gets. Attribution and license stay optional so
  the label's own photos need no credit line.
- Resolution order, in one client-safe util used by every surface: chosen
  rows by position → suggested rows → first pool rows, capped. The listing
  select reads the chosen-or-suggested candidates with `displayOrder: { gte:
0 }` and no DB-level take, because MongoDB sorts nulls first.
- The admin surface is one media manager replacing the bio image palette:
  chosen strip, upload zone, and the pool, mounted even when the pool is
  empty. Edit mode only; create mode explains that images wait for the save.

## Alternatives rejected

- **A third origin value (`kept`)** — conflates provenance with choice and
  grows every `origin` filter in the repository for no extra information.
- **Reusing `isPrimary` for the human's choice** — the job overwrites it on
  every run and a boolean cannot express order.
- **A separate hero/portrait field on Artist** — a second source of truth
  for one image, when the page already has a three-image slot and a pool.
- **The legacy `Image` table** — no public reader, no license, attribution,
  alt, or CDN re-host, and a combobox that has been empty since it shipped.

## Consequences

- Re-host keys are random, so after a regeneration a promoted (custom) row
  and a fresh generated copy of the same photo can coexist in the pool.
  Accepted for now; dedupe on `originalUrl` / `sourceUrl` is a follow-up.
- Custom rows seed the bio Lambda's face-reference images, so a chosen
  Wikimedia photo now also guides the next generation. A benefit.
- Admin thumbnails stay `unoptimized`; a just-uploaded display image can
  403 on the public page for the few seconds until its srcset variants
  exist (the same exposure editor uploads already had).
- Production needs `prisma db push` for the new optional field. Existing
  documents read as `null`, so every artist keeps its suggested-image
  fallback until an admin chooses.
- The legacy artist `Image` path (actions, service methods, repository
  finders, includes, and `Artist.images`) is removed in a separate PR.

## Addendum (2026-09-26, #767): the fallback tiers require alt text

### Context

Alt text was required only to _choose_ an image. The two fallback tiers had
no such rule, so on an artist with nothing chosen and nothing suggested, a
fresh upload without alt went straight onto the public page with a made-up
alt (`title`, else "<name> image"). The admin could not have chosen that
image, and the manager said nothing was shown: its badges came from the
chosen tier only. The job does not guarantee alt on its suggestions either:
`applyImageRanking` in the bio Lambda flags primaries by index (or every
image when the vision pass ranks none), and the job contract's `alt` is
optional.

### Decision

- **Both fallback tiers take only rows that pass `isDisplayEligible`.**
  Resolution is now: chosen rows by position → suggested rows with alt →
  the first pool rows with alt, capped. A row without an `alt` field counts
  as having none, so a projection that forgets to select it fails closed.
  Chosen rows are not re-checked. The set-display-images service already
  guards them.
- **The admin sees the tier the page uses.** `resolveDisplayImageSet`
  returns `{ tier, images }` and `resolveDisplayImages` delegates to it, so
  there is still one resolver. While nothing is chosen, the manager badges
  the tiles the page shows as "Shown (suggested)" or "Shown (first in pool)"
  in place of "Suggested". A suggestion the page skips keeps "Suggested". The
  strip's empty-state copy mentions the alt rule and points at the badges.

### Alternatives rejected

- **Drop the pool tier entirely** (issue option C). This changes today's
  pages for every artist with a pool and no suggestions, and we cannot count
  them without a production query. Filtering the tier removes the
  accessibility hole without that blast radius.
- **Filtering only the pool tier.** An alt-less suggestion is the same
  hole, because the job does not guarantee alt.

### Consequences

- Alt-less suggestions stop rendering in production until someone adds alt
  or chooses an image. Where every suggestion lacks alt, the detail page
  falls through to pool images with alt, or shows no header images.
- The index card never had a pool tier: the listing select reads only
  chosen or suggested rows. An artist whose suggestions all lack alt now
  shows no image on its index card while the detail page may show pool
  images. This divergence predates the change (no suggestions → the same
  split) and is left as it is.
- Still open: clearing alt on an already-chosen row is not guarded. The
  detail page's biography gallery, which listed every pool row the header
  did not show, alt or not, is removed by the second addendum.

## Addendum (2026-10-06): the set is uncapped and the page shows all of it

### Context

The artist page is being redesigned around the display images: a collage of
the chosen set, not three thumbnails beside a teaser. Three was the number
of slots the old header had, not a property of the set. Admins choosing a
fourth image hit the cap, and the pool rows the header did not show reached
the public page through the biography gallery, which ignored the alt rule.

### Decision

- **The chosen set has no cap.** `DISPLAY_IMAGE_CAP` becomes
  `FALLBACK_DISPLAY_IMAGE_CAP = 3` and applies to the two fallback tiers
  only; the chosen tier is returned whole, in position order.
- **The public artist page shows the chosen set as one collage.** It has
  layouts for one to seven tiles; from eight images up, the seventh tile
  shows image seven under "+N more". Every tile opens the lightbox at the
  image it shows, and the lightbox steps through all of them.
- **The first display image is the index card's photo**
  (`CARD_DISPLAY_IMAGE_COUNT = 1`); listing and featured payloads carry only
  that many.
- **The biography gallery is gone.** A pool row that is not chosen is not
  shown on the public page, which closes the alt gap above.
- **A media manager upload joins the chosen set**, appended last. The bio
  editor's inline upload stays pool-only: it exists to place an image in the
  prose, not to put it on the page.
- **Publishing an artist needs at least one chosen display image.** The rule
  and its guards are [ADR-0019](0019-publishing-an-artist-needs-a-chosen-display-image.md).
- **Grandfathered artists keep the fallback.** A published artist with no
  chosen image still renders the ADR-0008 fallback tiers (up to three), or
  one inert placeholder tile when nothing is eligible; the admin list badges
  it "No display image".

### Alternatives rejected

- **A higher cap (seven, matching the collage).** It would be the same
  arbitrary number one size up, and the "+N more" tile already answers "what
  about the rest".
- **Keeping the gallery for the remaining pool rows.** It is what put
  alt-less images on the page; the pool is an admin's working material.

### Consequences

- The set action's request is still bounded, by a generous size guard
  rather than a product cap, so a hostile payload cannot carry thousands of
  ids.
- An artist with many chosen images costs one lightbox with many slides;
  the page loads the collage's tiles only.

## Enforcement (2026-10-04)

The admin surface's writes to the pool and to the chosen set had no owner:
the manager, the upload zone, the editor's upload path and nine one-caller
mutation hooks each decided for themselves what joined the set and which
caches learned of a change. Three stale-state defects followed — a choice
made during an upload was overwritten when the upload landed (the manager
decided against the set as it was when the upload _started_), the cover-art
picker's pool was invalidated by two of nine writers, and the bio editor's
image picker kept a frozen copy of the pool. `useArtistPool`
(`src/app/components/forms/_hooks/use-artist-pool.ts`) is now the one
client module for the pool and the Shown set: every surface renders it,
whether an upload joins the display images is decided against the set as it
is when the upload lands (`decideUploadJoin`; since 2026-10-06 a media
manager upload always joins, appended last, and a bio-editor upload never
does), and one invalidation policy marks both pool keys stale after every
write. The bio-generation and
images-from-links sections track a run through one client tracker,
`useJobRun`, the twin of `async-job-lifecycle.ts`: a terminal state cached
before the trigger is never surfaced as the new run's outcome.

## Gallery gap closed (2026-10-06)

The first addendum left one gap open: the biography's gallery of the pool
images the header did not show, rendered without an alt-text rule. That
gallery is gone with the redesign. The page shows the display images and
nothing else from the pool: the chosen set (uncapped, second addendum), or
for a grandfathered artist with none chosen the fallback tiers of the first
addendum, which already require alt text. Every image on the public page now
passes through one rule.
