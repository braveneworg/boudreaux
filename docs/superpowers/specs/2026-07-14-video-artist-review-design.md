# Video form: server-assisted metadata prefill + reviewed artist creation

Date: 2026-07-14
Status: approved

## Problem

Admins report the new-video form staying empty despite the uploaded file
carrying metadata, and artists created on video save are invisible naive
shells. Today (PR #590): on file select, `music-metadata` prefills
title/artist/releasedOn/duration client-side (only-if-empty); on save,
`syncVideoArtists` silently creates shell Artists via a 2-part
`splitFullName` (no middle name, no admin review).

## Approved decisions

1. **Both workstreams**: strengthen metadata extraction AND add the
   structured artist-name flow.
2. Name fields appear **only for unmatched (new) artists**; matched names
   render a "links to existing artist" chip — the video form never edits an
   existing artist.
3. The flow covers **every parsed artist** (primary + feat./ft./featuring
   splits), not just the primary.
4. It applies on **create and edit**.

## Workstream A — server-assisted prefill

After the S3 multipart upload completes (s3Key exists, no Video row yet),
the client calls `GET /api/videos/probe-metadata?videoId&s3Key`
(admin-gated + rate-limited). The route runs a **non-persisting** ffprobe
against a presigned URL (`VideoProbeService.probeForPrefill(s3Key)`) and
returns normalized tags via a new pure extractor
(`src/lib/video-probe/probe-tags.ts`):

- `title`, `artist` (tag `artist` → `album_artist`), `releasedOn` (from a
  real `date` tag ONLY — **never** `creation_time`, an encode date is not a
  release date; partial `"2019"` → `2019-01-01`), `description`
  (comment/description), `durationSeconds` (`format.duration`, rounded).

The client merges via `applyServerProbePrefill` with the same
only-fill-empty semantics as the existing `applyVideoPrefill`, wired
through a TanStack Query hook (`useVideoProbePrefillQuery`, key
`videos.probePrefill(s3Key)`, staleTime Infinity) gated on
`upload.status === 'success'` — it never fires on edit-page initial load.
E2E/local-dev uses the existing `BIO_GENERATOR_FAKE` short-circuit with
deterministic tags added to `videoProbeFixture`. A missing ffprobe binary
degrades to `{ ok: false }` and the client silently skips.

## Workstream B — reviewed artist creation

The form watches the `artist` field (debounced 400ms) →
`splitFeaturedArtists` → `GET /api/artists/name-lookup?name=A&name=B`
(admin-gated; mirrors the service's private `findArtistByName` matching:
slug → case-insensitive displayName → firstName+surname, over ALL artists
including unpublished shells — the public `/api/artists/search` is
published-only and cannot be reused).

- **Matched** → chip "Links to existing artist X" (links to
  `/admin/artists/[id]`).
- **Unmatched** → "New artist" block with editable First / Middle / Surname
  / Display name inputs, prefilled by a new 3-part split
  (`splitArtistNameParts`: 1 token → first; 2 → first/surname; ≥3 →
  first/middle-joined/last; displayName = whole string).

On submit the drafts ride the payload as
`artistDetails: Array<{ sourceName, firstName?, middleName?, surname?, displayName? }>`
(plain array in the RHF values → `objectToFormData` JSON-stringifies →
`getActionState` decodes → `z.array(videoArtistDetailSchema).max(20).optional()`).
Server-side, `kickPostSaveEnrichment` forwards the validated details to
`syncVideoArtists(videoId, artistString, artistDetails?)`, which passes the
matching entry (by lowercased sourceName) into
`findOrCreateByName(name, details?)`. **Matching is unchanged**; only the
create branch uses admin-provided names (trimmed, falling back to the naive
split / sourceName). Stale detail entries (sourceName no longer in the
artist string) are ignored structurally. The update action's sync condition
extends to `artistChanged || s3KeyReplaced || artistDetails?.length`.

Draft state lives outside RHF (Map keyed by lowercased sourceName) and all
derived state recomputes from the watched artist value — it survives the
`form.reset` that runs on every `videos.detail` refetch.

## Invariants preserved (PR #590)

Release-date Apply writes to the RHF form only; enrichment mutations
invalidate only `videos.enrichment(id)` (+ `artists.all`); the enrichment
panel stays MUSIC-only + edit-only; the new lookup uses its own
`artists.nameLookup` query key.

## Error handling

Probe failures → `{ ok: false }`, silent client skip. Lookup failures →
review section renders nothing new (form remains submittable; the server
falls back to today's naive shell creation). Zod caps: 20 detail entries,
field lengths match the artist schema.

## Testing

Strict TDD. Unit specs adjacent to every new/changed file (extractor,
fixture contract, probe service, both routes, both hooks, split util,
schema, actions, services, review hook/section, form wiring). E2E
(isolated Docker Mongo, localhost:27018 only): edit-page flow — type
`E2E Review Existing feat. Zora Quill Brandt` → chip + prefilled block →
edit middle name → save → artist persisted with reviewed names; exact
existing name → chip only; probe endpoint contract via `adminPage.request`
(200 fixture tags, 400 out-of-namespace). Coverage: branches ≥95%, ≤2%
drop vs COVERAGE_METRICS.md.
