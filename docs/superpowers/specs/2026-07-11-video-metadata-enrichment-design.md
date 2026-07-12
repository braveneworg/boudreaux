# Video Metadata Probe + Web Enrichment — Design Spec

Date: 2026-07-11
Status: Approved (brainstormed + architecture selected by owner; plan approved)

## Problem

When an admin uploads a video, the form captures title/artist/releasedOn (typed),
client-side tag prefill, duration, and a poster — but all technical metadata
(codec, resolution, bitrate, fps, color, audio layout) is discarded,
`Video.artist` is a free-text string with no link to the `Artist` catalog, and
nothing verifies or enriches the release date or artist identity.

## Goals

1. Probe every uploaded video with ffprobe and store everything it reports —
   normalized fields for display plus the full raw JSON so nothing is lost.
2. Auto-create/link `Artist` shells from the admin-entered artist string.
3. Run an async web-enrichment job producing reviewable suggestions: artist
   full names, stage names, dates of birth, and the video release date — each
   with sources and confidence.
4. Display probe data + suggestions on the admin video edit page with
   per-field Apply.

## Non-goals

- Auto-writing any web-derived fact into `Artist` or `Video` rows without an
  explicit admin action.
- Parsing artist strings on ambiguous separators (`&`, `x`, `,`).
- Bulk backfill tooling (manual per-video Re-run covers legacy rows).
- Generalizing the bio-generation progress timeline component (follow-up).

## Approved decisions

1. **Tags are hints only.** Admin form fields stay authoritative; embedded
   container tags remain a prefill nicety (existing behavior, untouched).
2. **Trust model: auto-shell + suggest facts.** Artist shells (name/slug via
   `ArtistService.findOrCreateByName`) are the only auto-created rows. All
   web-derived identity facts and the release date are suggestions requiring
   per-field admin Apply. Rationale: web results for underground artists are
   frequently wrong (name collisions, fan-wiki DOBs); data in the DB reads as
   authoritative; `bornOn` drives birthday features.
3. **Multi-artist: feat.-split + join table.** Split only on
   `feat.`/`ft.`/`featuring` (high precision). New `VideoArtist` join
   (PRIMARY | FEATURED, sortOrder) mirroring `ArtistRelease`; `Video.artist`
   remains the display string.
4. **Architecture B: probe on web, search in Lambda.** ffprobe runs on the web
   host (binary already in the prod Alpine image) against a short-TTL presigned
   S3 GET URL (range-reads headers of files up to 5 GB). Web search/identity
   enrichment is a `task: 'video-enrichment'` mode in the existing
   `bio-generator/` Lambda, reusing its Serper/MusicBrainz/Wikidata/Gemini
   clients and SSM keys. Async Event invoke; token-guarded callback + progress
   routes; 2.5 s client polling; 17-minute stale-job coercion — all copied from
   the proven artist-bio pipeline.
5. **Scope.** Probe all videos; search enrichment only for `category: MUSIC`.
   Auto-kick after create; manual Re-run; re-probe on file replacement;
   re-sync + re-dispatch on artist-string change.

## Enrichment strategy (structured sources first)

- **MusicBrainz** artist search → candidates (score ≥ 90, name/alias equality
  required) → identity lookup (type person/group, legal-name alias, life-span
  begin, Wikidata relation).
- **Wikidata** corroboration: P569 DOB (+precision), P1477 birth name, aliases,
  P106 occupation gate (music-occupation allowlist).
- **Serper + one Gemini flash adjudication** only for the release date
  (2 queries; JSON output `{releaseDate, confidence, sourceUrls ⊆ provided,
rationale}`; suggestion emitted only when it differs from the admin-entered
  date) and as identity fallback when structured sources miss (always low
  confidence).
- **Confidence enum** `high | medium | low`: high = MB ≥ 95 + WD corroboration
  of the specific fact + occupation gate; single-token names hard-capped at
  medium without full MB↔WD corroboration; web/LLM-only facts are low.

## Data model

- `Video` gains nullable probe fields (`probedAt`, `probeError`, `container`,
  `width`, `height`, `videoCodec`, `audioCodec`, `bitrateKbps`, `frameRate`,
  `audioChannels`, `audioSampleRateHz`, `colorSpace`, `colorPrimaries`,
  `colorTransfer`, `sourceCreatedAt`, `encoder`, `probeData Json` — raw ffprobe
  JSON with `format.filename` redacted to the bare s3Key and a 256 KB cap) and
  job-state fields mirroring the Artist bio fields (`enrichmentStatus`,
  `enrichmentError`, `enrichmentStartedAt`, `enrichmentJobToken`,
  `enrichmentProgress Json`, `enrichedAt`).
- New `VideoArtist` join: role PRIMARY|FEATURED, sortOrder,
  `@@unique([videoId, artistId])`.
- New `VideoEnrichmentSuggestion` model: videoId, artistId? (null =
  video-level `releasedOn`), field enum, value, confidence, sources Json
  (≤10 http(s) URLs), note, status pending|applied|dismissed, appliedAt/By.
  Rows, not Json: per-row atomic apply/dismiss, audit, re-run replaces pending
  rows only (applied/dismissed survive and fence re-discovered facts).

## UX (admin edit page)

- `VideoTechnicalMetadataCard` (all categories; hidden until probed; `<dl>`).
- `VideoEnrichmentPanel` (MUSIC only, absent from DOM otherwise; error-boundary
  wrapped): status chip, progress timeline, per-artist suggestion cards
  (current vs suggested per field, confidence text badge, source links,
  per-field Apply + Apply-all, Dismiss with Undo), release-date suggestion.
- **Release-date Apply goes to the RHF form** (`setValue`, dirty, "Save to
  persist" hint) — never a server write, because any `videos.detail` refetch
  resets the form and would wipe dirty edits. Artist-field Apply is a server
  action with `expectedCurrent` optimistic-concurrency and a field-whitelist
  switch.
- Post-create redirect changes to `/admin/videos/{id}` so the admin watches
  enrichment complete; polling requires no client trigger (server sets
  `pending`).
- Cache discipline: enrichment mutations never invalidate `videos.all` while
  the form is mounted (form-reset hazard); enrichment state polls on its own
  query key/endpoint (`GET /api/videos/[id]/enrichment`).

## Error handling

Probe failure never blocks save (persists `probeError`; Re-run available).
Stale probe of a replaced file writes zero rows (s3Key-conditional update).
Shell-creation failures are per-name best-effort. Invoke/env failures fail the
job immediately. Lost callbacks resolve via read-time stale coercion; late
callbacks can still claim the single-use token. Apply races are handled by
`expectedCurrent` conflicts plus conditional `markApplied`.

## Security

Anti-enumeration callbacks (always 202); per-job UUID token, timingSafeEqual,
atomic single-use claim, stripped from every response; presigned probe URL is
GET-only/120 s/server-only and redacted from stored probe JSON (no `X-Amz-`
substring may survive); admin gating + `logSecurityEvent` on all actions;
payload caps (512 KB callback / 4 KB progress); http(s)-only source URLs;
`suggestion.field` maps through an explicit whitelist switch — never a dynamic
Prisma key.

## Testing

TDD throughout; ≥95 % branch coverage sustained in both workspaces. Unit specs
per new module (split util edge-case table, probe normalization fixtures with
redaction assertion, conditional claims, service dispatch/stale/filter logic,
route cap/202 discipline, hook poll gating incl. the "apply must not invalidate
`videos.detail`" regression, component states/a11y). Lambda workspace: client
extensions on fixture JSON, confidence rules, sourceUrls subset enforcement,
handler routing with the bio path untouched. E2E on isolated Docker Mongo with
the `BIO_GENERATOR_FAKE` seam: seeded videos (single `createMany`), full
run→suggest→apply→verify-on-artist flow, INFORMATIONAL probe-only assertion
(`toHaveCount(0)` on an unrendered panel).

## Rollout

Additive `prisma db push`; no new secrets (SSM keys + `BIO_GENERATOR_LAMBDA_NAME`

- `NEXT_PUBLIC_BASE_URL` already exist); deploy Lambda first (new mode inert),
  then db push, then web; validate `ffprobe -protocols | grep https` in the prod
  container and one real end-to-end run.

## Implementation plan

The approved step-by-step plan (files, contracts, ordering) lives in the
session plan and is executed task-by-task with TDD, per-task review, and atomic
conventional commits on `feat/video-metadata-enrichment`.
