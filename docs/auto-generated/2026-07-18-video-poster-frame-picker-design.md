# Video Poster Frame Picker — Design Spec

- **Date**: 2026-07-18
- **Branch**: `feat/video-poster-picker` (off main `41d30d5f`, which includes #611)
- **Status**: Approved design, ready for implementation planning

## Problem

`captureVideoPoster` (`src/app/components/forms/videos/video-metadata.ts`) already
seeks 5 evenly spaced timestamps in the 3–10s window
(`POSTER_SAMPLE_START_SECONDS = 3` / `POSTER_SAMPLE_END_SECONDS = 10`, samples at
3.7/5.1/6.5/7.9/9.3s for a ≥10s video; clamped to the duration, whole-video for
clips of 3s or less) and scores each rendered frame with
`scoreFrameQuality` (mean squared luma difference between pixel neighbors —
flat/fade-in frames score 0, blurry frames score low). Today it JPEG-encodes
**only the argmax frame** and discards the other four. The admin's only choices
are "accept the winner" or "manually upload an image": the sharpest frame is not
always the best editorial choice, and the four losers are already decoded,
rendered, and scored before being thrown away.

## Decision

**Option A — encode every sampled frame in the existing single pass** and let
the admin pick from a thumbnail strip.

Rejected alternatives:

- **B — re-seek on demand** (keep one blob, re-run capture at a chosen time when
  the admin browses): adds latency and a second decode path for memory we don't
  need to save.
- **C — server-side frame extraction** (ffmpeg on upload): absurd overkill for
  an interactive pick; the client already has the decoded frames.

### Memory constraint (binding on implementation)

"~1–2MB total" holds for the **JPEG blobs only**. The intermediate canvases are
the real cost: batching all 5 full-resolution canvases until the end of the loop
would hold ~5 RGBA framebuffers (~33MB each at 4K ≈ 165MB). The capture loop
MUST encode inline per frame — render → score → `toBlob` → drop the canvas →
seek next — so at most one full-resolution canvas is alive at a time. This
serializes encoding into the seek loop, which is fine (JPEG encode is fast
relative to seek+decode).

## Design

### 1. Capture API — `video-metadata.ts`

```ts
export interface PosterCandidate {
  blob: Blob; // JPEG, quality 0.85 (unchanged)
  atSeconds: number; // sample timestamp, for labeling/debugging
  score: number; // scoreFrameQuality result (downscaled sample)
}

export const captureVideoPosterCandidates = (file: File): Promise<PosterCandidate[]>
```

- Same sample times (`posterCandidateTimes`, unchanged), same luma scoring
  (`scoreFrameQuality` / `scoreCanvasQuality`, unchanged).
- Inline encode per frame per the memory constraint above.
- **Behavior change (deliberate)**: a frame that fails to render or encode is
  **skipped** and the loop continues to the next timestamp. Today's code aborts
  the whole capture with `null` on the first unrenderable frame; the new loop
  degrades to a partial list instead. Zero successful frames (undecodable file,
  `error` event, throwing canvas APIs) → resolves `[]` — same
  never-rejects/graceful-degradation contract as today.
- Candidates are returned in **time order** (for the strip). The caller derives
  the default selection by score.
- `captureVideoPoster` has exactly one non-test caller
  (`use-video-upload.ts:132`) — it is **replaced**, not wrapped. The `atSeconds`
  manual-capture parameter has **zero** non-test consumers and is removed with
  it (no orphaned code, no orphaned tests — specs move to the new API).

### 2. Form state — `video-form.tsx` / `use-video-upload.ts`

- `useVideoUpload`'s `onPosterCandidate: (poster: Blob | null) => void` becomes
  `onPosterCandidates: (candidates: PosterCandidate[]) => void`.
- `VideoForm` holds `posterCandidates: PosterCandidate[]` and
  `selectedCandidateIndex: number`, defaulting to the **argmax score** (ties →
  earliest, matching today's `score > best.score` strict-inequality semantics).
  The pre-selected frame is therefore exactly the frame today's code would have
  produced — **#611's Save-auto-upload guarantee is preserved untouched**:
  `resolveSubmitPosterUrl` receives the _selected_ candidate's blob where it
  received the _only_ blob before. No change to its logic, gating, or the
  `ok:false` toast path.
- Re-selecting a different video file replaces the candidate list and resets the
  selection to the new argmax. A poster already uploaded this session
  (`uploadedPosterUrl`) keeps display/submit priority, unchanged.

### 3. Poster UI — `video-poster-section.tsx`

- Props change from `candidate: Blob | null` to
  `candidates: PosterCandidate[]`, `selectedIndex: number`,
  `onSelectCandidate: (index: number) => void`.
- **Thumbnail strip** under the big preview: a `radiogroup` (repo rule: radios,
  never checkboxes; roving-tabindex arrow-key navigation, `aria-checked`,
  visible ring on the selected thumb). Clicking or arrowing a thumb swaps the
  big preview and the pending submit candidate.
- Strip renders only with **≥ 2 candidates** (a one-frame "choice" is noise);
  the big preview shows the selected/only candidate either way. Zero candidates
  → no strip, no auto-upload — exactly today's no-candidate behavior.
- **"Use this frame" is removed** — redundant since #611 (Save commits the
  visible candidate automatically). Manual "Upload a poster image" stays and
  overrides the picker exactly as today (`uploadedPosterUrl` priority).
- Object-URL lifecycle for all thumbnails handled in **one effect keyed on the
  candidates array** — create all URLs, revoke all in cleanup — StrictMode-safe
  like the current single-candidate effect. The big preview reuses the selected
  thumb's URL (no second URL per blob).
- Display priority is unchanged: `uploadedPosterUrl` → selected candidate →
  existing `posterUrl` → placeholder.

### 4. Edge cases

- **Fewer than 5 frames render** → show what rendered (partial strip, or no
  strip if < 2).
- **Zero frames** → no strip, no auto-upload; form submits fine without a
  poster (unchanged).
- **Short clips** → existing `posterCandidateTimes` clamping, unchanged.
- **Near-duplicate frames** (static videos) → acceptable in v1; no dedupe.
- **E2E stays inert by construction**: the keystone E2E uploads garbage bytes →
  `error` event → `[]` → no strip, no auto-upload. The existing spec is
  unaffected.

### 5. Testing (TDD, per repo rules)

- `video-metadata.spec.ts`: candidates returned in time order with scores
  (existing mock-video pattern); per-frame inline encode; skip-and-continue on a
  frame render failure; `[]` on undecodable/error; object-URL revocation.
- `use-video-upload.spec.tsx`: `onPosterCandidates` receives the array.
- `video-form.spec.tsx`: default selection = argmax; changing the selection
  changes the blob submitted through the #611 `resolveSubmitPosterUrl` path;
  zero candidates → `posterUrl: ''` with no upload call.
- `video-poster-section.spec.tsx`: radiogroup semantics + keyboard navigation;
  selected ring; preview swap; ≥2-candidate render gate; manual-upload override;
  URL lifecycle.
- Coverage: hold the 90–95% target; no `COVERAGE_METRICS.md` regression.

### 6. Out of scope

- Server-side frame extraction (rejected option C).
- Scrubber / arbitrary-time capture (the removed `atSeconds` path; re-add
  deliberately if ever wanted — it is one parameter away).
- Frame dedupe, changing the sample count/window, poster clearing.

## Implementation constraints (repo rules that will bite here)

- ESLint `complexity` cap 10: the strip is new branching in an already-busy
  section — extract it as a named component/helper up front.
- Arrow functions, named exports, destructured props, MPL header on any new
  file.
- When a component covered by existing E2E changes, run those specs locally
  before pushing (the admin video form specs drive the poster section today).
