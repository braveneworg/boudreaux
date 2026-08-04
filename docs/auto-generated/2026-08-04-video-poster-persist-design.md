# Video Poster Candidates Persist at Upload — Design Spec

- **Date**: 2026-08-04
- **Branch**: `feat/video-poster-persist` (off main `dd83bee2`, v4.295.0)
- **Status**: Approved design, ready for implementation planning

## Problem

The five poster frame candidates captured at file drop
(`captureVideoPosterCandidates`, `src/app/components/forms/videos/video-metadata.ts`)
exist only as JPEG `Blob`s in `VideoForm` component state
(`video-form.tsx:290-291`). The only persistence is inside the Save handler:
`resolveSubmitPosterUrl` uploads the selected blob to S3 and the Server Action
writes `Video.posterUrl`. Leaving the page before Save loses all five frames
irrecoverably — they derive from the local `File`, which the browser no longer
holds after unmount, and nothing recaptures from the uploaded S3 object.

Compounding traps:

- The draft row created at upload-complete (`use-video-draft.ts`) omits the
  poster entirely, then `history.replaceState` flips the URL to
  `/admin/videos/{id}` — the page _looks_ saved while the poster is RAM-only.
- Picking a frame writes `useState`, not the form, so `isDirty` stays false and
  there is no `beforeunload` guard — no warning on the way out.
- An abandoned draft is a playable video row with `posterUrl: null` forever.

User requirement: poster images must be durable as soon as they exist, with the
frame choice still changeable afterwards — and a later re-pick persists
**instantly on click** (user-selected option, 2026-08-04).

Note: enrichment is _not_ involved. Frames are captured at file drop, before
enrichment starts; the durable point is upload/draft creation, which is earlier
than "when enrichment has run" and requires no coupling to the enrichment
pipeline.

## Decision

**Option A — persist the client-captured frames at upload time.** Keep the
existing browser capture; upload all candidates to S3 immediately after
capture; record them on the `Video` row at draft creation with the
best-scoring frame as the live `posterUrl`; hydrate the picker strip from
stored URLs on any later visit; persist a re-pick instantly via a small admin
Server Action.

Rejected alternatives:

- **B — server-side frame extraction** (ffmpeg in the Lambda after upload):
  durable regardless of the browser and could backfill existing videos, but new
  infrastructure (video download in Lambda, frame extraction, callbacks),
  slower feedback, and it duplicates a working client path. Rejected by the
  2026-07-18 picker spec as overkill; still holds. Backfill was not requested.
- **C — IndexedDB stash** of the blobs: device- and browser-local only; an
  abandoned draft still has no poster; nothing survives a different machine.
  Not actually "saved".

## Design

### 1. Data model — `prisma/schema.prisma`

```prisma
type VideoPosterCandidate {
  url       String
  atSeconds Float
  score     Float
}

model Video {
  // ...
  posterUrl        String?
  posterCandidates VideoPosterCandidate[]
}
```

- Additive composite-type list; `prisma db push` only, no migration. Existing
  documents read back as an empty list → exactly today's behavior.
- **No selected-index field.** The chosen candidate is the entry whose `url`
  equals `posterUrl`; a manual poster matches none. Nothing to keep in sync.
- Mirror the field through `src/lib/types/domain/video.ts`, the admin
  `VideoRow`/detail API payloads, and validation schemas.
- Read `prisma/AGENTS.md` before touching the schema (repo rule).

### 2. Candidate upload at capture — `use-video-upload.ts`

- Immediately after `captureVideoPosterCandidates` resolves, upload every
  candidate blob via the existing presigned path
  (`getPresignedUploadUrlsAction('videos', preGeneratedId, …)` +
  `uploadFileToS3`), named `poster-candidate-{index}.jpg` →
  `media/videos/{preGeneratedId}/…` keys. Runs in parallel with the multipart
  video upload — a few MB beside the video is noise.
- Per-candidate failures **skip-and-continue** (mirrors the capture loop's
  contract). Zero successes → degrade to exactly today's behavior: blobs stay
  in memory and `resolveSubmitPosterUrl` still uploads the selected one at
  Save.
- The upload fan-out resolves to `{url, atSeconds, score}[]` held alongside the
  blobs so draft creation and the strip can use whichever exists.

### 3. Draft creation — `use-video-draft.ts` / `createVideoDraftAction`

- `videoDraftSchema` (`src/lib/validation/video-draft-schema.ts`) gains
  `posterUrl` and `posterCandidates` (both optional).
- `buildDraftInput` awaits the candidate-upload results (`Promise.allSettled`;
  they finish long before a video multipart) and includes:
  - `posterCandidates`: the successfully uploaded entries, time order;
  - `posterUrl`: the **currently selected** candidate's URL (defaults to the
    best-scoring frame; respects a pre-draft click).
- Server-side validation in the action: every URL must resolve to our CDN
  domain and to a key passing `isVideoNamespacedKey` **and** prefixed with the
  draft's own `preGeneratedId` — no arbitrary-URL injection.
- Result: the instant the draft row exists, the poster and all choices are
  durable. Abandoning the page leaves a draft _with_ a poster.

### 4. Edit-page hydration — `video-form.tsx` / `video-poster-section.tsx`

- The strip's display model becomes `src`-based: fresh captures render via
  object URLs (unchanged lifecycle effect), hydrated candidates via their
  stored `https` URLs (no object-URL management needed).
- The strip renders whenever the video has **≥ 2 candidates** — including on a
  plain edit visit, which never showed it before. Highlight = the candidate
  whose `url` equals the current `posterUrl`; a manually uploaded poster
  highlights none.
- **Deliberate behavior change** (user-approved): the strip is no longer
  permanently hidden after a manual poster upload — with durable candidates
  you can switch back to a captured frame later. Within-session display
  priority (`uploadedPosterUrl` first) is unchanged.

### 5. Instant re-pick — new Server Action `selectVideoPosterAction`

- `selectVideoPosterAction(videoId, candidateUrl)`, gated `withAdmin`,
  `try`/`catch` → `{ success, error? }`.
- Validates `candidateUrl` is a member of the video's **stored**
  `posterCandidates` (DB membership check — stronger than pattern
  validation), then sets `posterUrl`.
- Client: a mutation hook with optimistic highlight, revert + `toast.error` on
  failure, and invalidation of the video detail + admin list query keys.
- Activation rule: clicks persist instantly once a row exists (edit mode, or
  upload session after the draft is created). Pre-draft clicks stay local
  state, and §3 writes the selection into the draft.

### 6. Save path — `resolveSubmitPosterUrl`

- Unchanged in logic; demoted to fallback. When all candidate uploads failed
  (§2), the selected blob still uploads at Save exactly as today. Manual
  poster upload persists via Save, unchanged (instant-persist for manual
  uploads is out of scope).

### 7. File replace — candidates follow the file

- Replacing the video file (per #679's re-derive flow) captures new frames;
  the new candidates upload per §2 and the update payload replaces
  `posterCandidates` and `posterUrl` the same way §3 does at creation, with
  the same server-side namespace validation.
- The update action accepts `posterCandidates` **only** when the payload also
  carries a new `s3Key` (i.e. an actual file replace); otherwise the field is
  ignored. `selectVideoPosterAction` (§5) is the sole other writer, and it
  only moves `posterUrl` between existing entries.
- `deleteReplacedVideoAssets` (`src/lib/actions/video-action-helpers.ts:133`)
  extends: when the candidate list is replaced, the old candidates' S3 objects
  are deleted best-effort alongside the old poster.

### 8. Cleanup guard — candidate switches must not delete objects

- `deleteReplacedVideoAssets` currently deletes the old `posterUrl` object
  whenever the poster changes. New guard: **skip deletion when the replaced
  URL is in the stored candidate list** — switching frames must not destroy a
  still-listed candidate. A replaced _manual_ poster still deletes as today.
- Candidates live under `media/videos/{id}/`, so they ride whatever the
  video-delete flow does with S3 assets today (verify at implementation; if
  video delete leaves S3 objects, that is pre-existing and out of scope).

### 9. Edge cases

- **Partial capture/upload** (< 5 successes): store what succeeded; strip
  gates at ≥ 2 as today.
- **Zero candidates** (undecodable file, all uploads failed): today's behavior
  end-to-end; nothing persisted, Save-time fallback available.
- **Pre-feature videos**: empty list → no strip, unchanged.
- **Save racing candidate uploads**: `posterUrl` already set by draft creation
  or the fallback path covers it; last write wins harmlessly.
- **E2E fake-upload mode**: garbage bytes → `[]` candidates → nothing
  persisted; specs that exercise the strip need a stubbed candidate fixture
  (same pattern as the existing `NEXT_PUBLIC_E2E_MODE` upload fake).

### 10. Testing (TDD, per repo rules)

- **Unit**: draft schema accepts/round-trips the new fields; draft action
  persists candidates + selected `posterUrl` and rejects foreign-namespace
  URLs; `selectVideoPosterAction` — admin gate, membership rejection, success
  write; `deleteReplacedVideoAssets` skip-when-candidate guard and
  replace-file candidate cleanup; candidate-upload fan-out skip-and-continue.
- **Component**: strip hydrates from stored URLs on edit; highlight follows
  `posterUrl`; click fires the mutation with optimistic highlight and reverts
  on failure; pre-draft clicks stay local.
- **E2E**: extend the admin draft-upload spec — draft row carries poster +
  candidates; revisit shows the strip; click persists. Note: fresh worktrees
  fail the two S3-dependent specs without `.env` creds (known, #617).
- Coverage: hold targets; no `COVERAGE_METRICS.md` regression.

### 11. Out of scope

- Backfilling candidates for already-uploaded videos (rejected option B).
- Instant persist for the manual poster upload (stays Save-time).
- A `beforeunload` guard for other unsaved form fields (pre-existing
  behavior).
- Pruning candidate objects to save storage; changing capture count/window.

## Implementation constraints (repo rules that will bite here)

- ESLint `complexity` cap 10 — extract the hydration/selection branching as
  named helpers up front.
- Arrow functions, named exports, destructured props, MPL header from
  `HEADER.txt` on every new file.
- Prisma-on-Mongo quirks: read `docs/lessons/prisma-mongo/` before the schema
  change; `{ field: null }` filter quirk documented there.
- The admin video form is covered by existing E2E — run those specs locally
  before pushing.
