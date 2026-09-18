# ADR-0008: Display images are chosen by humans and survive regeneration

- **Status**: Accepted
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
- Alt text is required to choose an image (service-enforced), because the
  public page renders display images as content, not decoration. Attribution
  and license stay optional so the label's own photos need no credit line.
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
