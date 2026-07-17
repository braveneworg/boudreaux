# Video enrich-on-upload — design

Date: 2026-07-17
Status: approved (brainstormed with user; all four sections approved)
Builds on: `2026-07-11-video-metadata-enrichment-design.md` (async Lambda enrichment),
`2026-07-15-video-uploader-v2-design.md` (artist review, producers, release-date lookup)

## Problem

Four quality gaps in the admin video upload flow:

1. **Enrichment waits for a save.** Web enrichment only dispatches after "Create
   video" (post-save `after()` kick) — the admin uploads, fills the form, saves,
   and only then waits for suggestions. Suggestions should already be arriving
   while the form is being filled.
2. **Artist extraction is weak end-to-end.** The filename/tag prefill mangles
   common patterns (`Artist - Title (feat. X) [Official Video].mp4`), the
   feat-splitter misses markers and multi-primary separators, and the Lambda's
   artist-name-only lookups produce weak displayName / full-name / featured
   suggestions.
3. **No description.** The Video model has `description String?` but enrichment
   never populates or suggests it.
4. **Poster frame is too early.** Auto-capture samples 5 frames from the first
   3 seconds — fade-ins, logos, and title cards win.

## Design overview

Four coordinated changes, one PR:

1. **Draft row at upload-complete** — create the Video row as an unpublished
   draft the moment the S3 multipart upload finishes, and kick the existing
   artist-sync → probe → enrichment pipeline against it. All row-anchored
   enrichment machinery (status, job token, callback, suggestions, apply) is
   reused unchanged.
2. **Extraction quality** — a real filename parser on the client; MusicBrainz
   _recording_ (artist + title) lookups in the Lambda with credit-based
   canonical names, split validation, and featured-artist discovery.
3. **Description suggestion** — Lambda synthesizes a short editorial
   description from gathered facts; delivered as a reviewable video-level
   suggestion applied client-side into the form field.
4. **Poster window** — sample the sharpest of 5 frames from seconds 3–10
   instead of 0–3, clamped for short clips.

No Prisma schema changes: drafts use the existing nullable `publishedAt`,
and new suggestion kinds are new values of the existing
`VideoEnrichmentSuggestion.field` string (whitelist is app-level).
No new env/ops requirements: the Lambda, callback base URL, and deploy
workflow are already in place.

## 1. Draft row at upload-complete

### Flow (New Video page)

1. Admin picks a file → prefill from container tags + the new filename parser
   (§2) → artist-review UI appears (existing). Multipart upload streams
   (existing).
2. **On upload-complete**, the client calls a new Server Action
   `createVideoDraftAction` with the pre-generated ObjectId and a snapshot of
   the _current_ form values — any corrections the admin made during the
   upload ride along. The action:
   - validates admin role and the S3 object under `media/videos/{id}/`
     (reuse `confirmVideoUpload`);
   - parses a **lenient draft schema** (`videoDraftSchema`): required are only
     `s3Key`/`fileName`/`mimeType`; fallbacks fill the rest —
     `title` ← form value, else filename stem; `releasedOn` ← form value,
     else container date, else today; `artist` may be empty; `category`
     ← form value (form default MUSIC);
   - creates the row **unpublished** (`publishedAt: null`) with the
     pre-generated id (same id already namespacing the S3 key);
   - is **idempotent**: if the row already exists, return success with the id
     and change nothing (guards double-fire on flaky networks);
   - in `after()`: probe always; `syncVideoArtists` + `runEnrichmentJob`
     **only when the artist string is non-empty** (never mint an
     "Unknown Artist" shell). The existing MUSIC-only gate inside
     `runEnrichmentJob` still applies.
3. On draft success the form flips to **draft mode**:
   - `router.replace('/admin/videos/{id}')` — a mid-fill refresh resumes on
     the edit page instead of losing everything;
   - the enrichment panel's mount gate changes from "edit mode" to
     "a video row exists" (i.e. a known videoId), so it mounts immediately
     and polls; suggestions stream in while the admin finishes the form;
   - the submit button becomes **Save** (`updateVideoAction`).
4. On draft **failure** (e.g. duplicate title from the filename stem) the page
   degrades gracefully to today's behavior: log it, no pre-save enrichment,
   submit stays "Create" via `createVideoAction`. The upload itself is never
   blocked or failed by draft creation.

### Save-time double-run fix

`scheduleUpdateEnrichment` (update-video-action.ts) currently re-kicks
enrichment whenever `artistDetails` is present in the payload — in the draft
world that means every ordinary save would re-run a job that already ran at
upload-complete. Tighten the gate to _actual change_:

- artist string differs from the stored row, **or**
- file replaced (`s3KeyReplaced`, re-probe as today), **or**
- `artistDetails` names differ from the currently linked artists' details.

The manual "Re-run enrichment" button remains the force path (unchanged).

### Draft lifecycle

An abandoned upload is an unpublished draft: visible in the admin list
(which already displays unpublished videos), deletable via the existing
delete path (which frees S3 objects). No cleanup job, no new "draft" flag
(YAGNI). INFORMATIONAL uploads still get the draft + probe; the category
gate skips web enrichment as today.

## 2. Extraction quality, end to end

### Client parse (prefill)

New pure util `src/lib/utils/parse-video-filename.ts` (client-safe, no
`server-only`), replacing the thin filename fallback:

- strip extension; normalize `_` and `.` separators to spaces;
- strip decoration junk: `(Official Video)`, `[Official Music Video]`,
  `(Lyric Video)`, `(Official Audio)`, `(Visualizer)`, `[HD]`/`[4K]`/`1080p`/
  `x264`-style tokens, `(Remastered)`, leading track numbers (`01 - `);
- split `Artist - Title` / `Artist – Title` / `Artist | Title`;
- extract feat-clauses from **both** segments — `Title (feat. X)` contributes
  X as a featured artist and cleans the title.

`splitFeaturedArtists` extensions:

- more featured markers: `feat`/`ft` with or without dot, `Feat`, `w/`;
- multi-primary separators `" x "`, `" & "`, `", "` become split _candidates_
  surfaced in the existing artist-review UI — not silently trusted, since `&`
  and `and` live inside legitimate band names. The Lambda's split validation
  (below) is the safety net that lets the parser be aggressive.

Container tags remain the preferred artist source; the filename supplements
feat-clauses and the cleaned title. Existing behavior when both are absent is
unchanged.

### Lambda (bio-generator workspace, `video-enrichment.ts`)

- **Recording-first lookup**: query MusicBrainz _recordings_ with artist +
  video title together (today: artist-name-only). A matched recording's
  artist-credit yields canonical credited names — stage names — for the
  primary and every featured artist, plus a first-release date. Wikidata
  birth name (P1477) fills legal first/middle/surname. Feeds stronger
  `displayName` / `firstName` / `surname` / `akaNames` / `releasedOn`
  suggestions; confidence rubric extended to credit-corroborated facts.
- **Split validation**: if the _unsplit_ artist string matches a single MB
  artist (band with `and`/`x`/`&` in its name), suggest the unified name; if
  split parts each appear on the recording credit, the split is confirmed.
- **Featured-artist discovery**: a credited artist not among the video's
  linked artists emits a new video-level suggestion
  `field: 'featuredArtist'`, `value: <credited name>`, with sources and
  confidence.

### Featured-artist apply (client-side)

Apply appends `feat. <name>` to the artist form field and adds a matching
`artistDetails` entry; the normal save → `syncVideoArtists` path then creates
the shell and links it FEATURED. Server-side linking is deliberately avoided:
`syncVideoArtists` rebuilds join rows from the form's artist string at save,
so a server-created link would be detached by the next save. The suggestion
row is marked applied through the existing apply action (same
client-applied pattern as `releasedOn` today).

## 3. Description suggestion

- Lambda synthesizes a 2–4 sentence editorial description from gathered
  MusicBrainz/Wikidata/web-search facts (song, artists, release context —
  no invented visual claims), well under the 2000-char field limit.
- Emitted as a video-level suggestion `field: 'description'` with confidence
  - sources; the fake/E2E fixture gains `description` and `featuredArtist`
    entries.
- UI: a suggestion card previewing the full text; **Apply fills the RHF
  `description` field client-side** (same pattern as `releasedOn` — never
  server-applied, cannot stomp unsaved form edits; applying over a non-empty
  field replaces it and stays editable).
- Video-level whitelist grows: `releasedOn` → `releasedOn | description |
featuredArtist` (apply action whitelist, wire schema, status mapper).
  Artist-level whitelist unchanged.

## 4. Poster window

In `video-metadata.ts`:

- capture window moves from `[0s, 3s]` to `[3s, 10s]`: named exported
  constants `POSTER_SAMPLE_START_SECONDS = 3`,
  `POSTER_SAMPLE_END_SECONDS = 10`; still 5 candidates, same luma-sharpness
  scoring and JPEG encode;
- clamping: duration ≤ 3s → whole-video sampling (today's behavior);
  3s < duration < 10s → sample `[3s, duration]`;
- manual timestamp capture (`atSeconds`) and the "Use this frame" flow are
  untouched.

## Error handling

- Draft-create failure → logged, silent fallback to create-on-submit; upload
  never blocked.
- Post-draft pipeline stages stay independently best-effort (existing
  `kickPostSaveEnrichment` contract); a failed pre-save run is re-runnable
  from the panel.
- Suggestion apply keeps optimistic-concurrency + whitelist guards; new
  video-level fields are client-applied, so no new server write paths for
  form-owned fields.
- Idempotent draft create guards double-fire; `runEnrichmentJob`'s
  freshly-processing guard prevents overlapping dispatches.

## Testing (TDD)

Unit (web):

- filename parser table tests (decorations, separators, feat-clauses in both
  segments, underscores/dots, track numbers);
- `createVideoDraftAction`: lenient defaults, idempotency on existing id,
  artist-blank gate (no shell/enrichment), S3 confirm, failure fallback shape;
- tightened `scheduleUpdateEnrichment` change-detection;
- poster candidate-time windows/clamps via exported constants;
- whitelist + status-mapper + apply-action extensions for
  `description`/`featuredArtist`;
- video-form draft-mode transition (panel gate, Save vs Create submit).

Unit (bio-generator workspace, own vitest project):

- recording-credit mapping (primary + featured canonical names, release
  date), split validation both directions, featured-artist discovery,
  description synthesis prompt/output shape.

E2E (fake enrichment path, isolated Docker Mongo):

- upload → draft auto-created → enrichment panel appears **pre-save** →
  apply description + featured-artist suggestions → Save → verify row and
  linked FEATURED artist;
- update existing enrichment/form/artist-review specs for the new flow and
  fixture fields — minding the repo lessons on seed-count-pinning specs,
  combobox drivers, and `scrollToLoad`.

## Out of scope

- Video-content (frame/vision) analysis for descriptions — descriptions are
  web-facts-based by decision.
- Draft cleanup jobs or a dedicated draft flag.
- Server-side auto-fill of any form-owned field.
