# ADR-0010: Image-source links feed the pool without a vision gate

- **Status**: Accepted
- **Date**: 2026-09-25

## Context

The only ways into an artist's image pool were the bio-generation job's own
discovery (MusicBrainz → Commons, Jina web search, Serper, a Bandcamp/Discogs
link-follow) and a manual upload. An admin who knows exactly where the good
photos live — a press kit, a photographer's gallery, a direct image file —
had no way to point the job at that page. The "Reference links" input on the
bio-generation section looked like it might do this, but the Lambda only
appends those links to the output link list after every image stage has run,
so a reference link never yields an image.

Two constraints shaped the design. `ArtistBioLink` has a unique
`(artistId, url)` index, so a URL can only be stored once per artist. And
`ArtistRepository.replaceBioContent` deletes every image row that is not
`origin: 'custom'`, while `custom` also means "a human chose this for
display" and seeds the next run's Rekognition face references (ADR-0008).

## Decision

**Image sources are `ArtistBioLink` rows that play a separate role, read by
their own async Lambda task, whose images land in the pool as
`origin: 'linked'`.**

- A link row carries two nullable role flags: `reference` (default `true`)
  and `imageSource` (default `false`). A URL added in the image-sources
  section is an image-only custom row (`reference: false`); a URL that
  already exists as a reference link simply gains `imageSource: true`. Every
  reader of reference links — the status endpoint that feeds the palette and
  the reference list, and the public artist include — filters on the
  reference role (`referenceLinkWhere`), so image-only rows never reach the
  bio payload, the palette, or the public page. Legacy documents without the
  fields read as reference-only.
- The scrape is a new `images-from-links` task in the bio-generator Lambda,
  dispatched as a fire-and-forget `Event` invoke with its own callback route
  and its own lifecycle columns on `Artist` (`imageLinks*`), so it can run
  while a bio generation runs. Each link is HEAD-probed first: an `image/*`
  response is a single candidate; anything else is read through Jina, whose
  URL/alt heuristics already drop icons and junk. Survivors are face-scored
  with Rekognition against the artist's custom display images, but the
  Gemini vision gate is skipped — the admin chose the page, so the cheap
  filters plus a human's later curation are the gate.
- Scraped images are re-hosted and inserted with `origin: 'linked'`. The
  regeneration delete targets only `generated`/unset rows, so linked images
  survive a bio regeneration like custom ones do; unlike custom rows they are
  not human-chosen, so they never seed face references and carry no
  `displayOrder` until an admin picks them. Candidates whose URL already
  exists in the pool (`url` or `originalUrl`) are skipped before re-hosting.
- Progress is status-only: the section polls the job status and toasts the
  number of images added. No per-stage progress channel.

## Consequences

- Two more nullable booleans on `ArtistBioLink` and five job columns on
  `Artist` need a manual production `prisma db push` (#751) before the deploy
  that reads them.
- `bioOriginSchema` gains `linked`; the image tile shows a "Linked" badge.
- The Lambda's `fetchCandidates` (bytes for Rekognition) is now exported from
  `vision.ts`, and `toScrapedBioImage` lives in `scraped-image.ts` so the task
  module does not import the orchestrator.
- The bio job's own Jina/Serper/link-follow image discovery is unchanged;
  admin image sources are additive.
- Jina renders whatever a site serves it and never bypasses anti-bot walls,
  so a Cloudflare-challenged link (imginn.com, 2026-09-26) comes back as a
  200 "Just a moment..." page with no photos. `readUrlOutcome` classifies
  such reads as `blocked`; when every link was blocked or unreadable the job
  fails with the hosts named ("imginn.com blocked automated access (bot
  check)") instead of reporting an empty page, and a blocked link beside a
  productive one is logged (`image_links_links_skipped`) while the job still
  succeeds. Pulling images from such hosts needs a different fetch path, not a
  Jina header — see `docs/lessons/ops/jina-reader-returns-bot-walls-as-pages.md`.
  Decided 2026-09-26: no paid anti-bot scraping provider. Walled hosts are
  out of scope for the job; the admin saves the photos from their own browser
  (imginn's own "Download All"/"Download" buttons work there) and adds them
  through the pool uploader. Revisit only if walled hosts turn out to be most
  of what admins paste.

## Addendum (2026-09-26): pool dedupe is by content, not only URL (#773)

The URL check above misses the common case of the same photo served under a
second URL (a Commons image re-hosted on the band's press page), and the bio
job's byte/perceptual dedupe only ever compared a batch with itself. Both jobs
now dedupe new candidates against the images already in the pool.

- **Hashes are persisted, not recomputed.** Every image re-hosted by
  `BioImageService.rehostImages` stores `contentHash` (SHA-256 of the source
  bytes) and `perceptualHash` (the 64-bit dHash as 16 hex digits — MongoDB has
  no unsigned 64-bit integer) on its `ArtistBioImage` row. `rehostImages`
  takes the pool's fingerprints as a seed, so a byte- or near-identical
  candidate is dropped and aliased to the pool copy's URL exactly like an
  in-batch duplicate; the pool copy always wins.
- **Which rows seed the dedupe differs per job.** The links job deletes
  nothing, so it seeds with every hashed row. The bio job seeds only with
  `custom` and `linked` rows: `generated` rows are about to be replaced, and
  deduping against them would drop a rediscovered photo and then delete its
  only copy. A bio-job fingerprint lookup failure degrades to the old
  batch-only dedupe; the links job fails the run, as it already did when the
  URL lookup failed.
- **Legacy rows without hashes are skipped, not backfilled.** A lazy
  backfill mostly cannot recover the byte hash from our own copy: a row
  re-hosted at generation time points at a 384px webp thumbnail, whose
  SHA-256 never equals the source's (only rows upgraded at save time hold the
  original bytes). Recovering it would mean re-fetching each row's external
  `originalUrl` — third-party traffic and callback latency on every run until
  backfilled, for sources that may be gone or changed.
  Legacy rows age out on their own: `generated` rows are rewritten with hashes
  on the next regeneration, and promotion to `custom` (display picks) keeps a
  row's hashes. URL dedupe still covers them in the links job.

### Consequences

- Two nullable strings on `ArtistBioImage`, no index — no `prisma db push` is
  needed before the deploy (documents without them read as `null`).
- Manual uploads (`ArtistBioImageRepository.create`) are not hashed, so a
  scraped copy of an uploaded photo is still re-hosted. Hashing uploads would
  close that gap if it shows up in practice.
