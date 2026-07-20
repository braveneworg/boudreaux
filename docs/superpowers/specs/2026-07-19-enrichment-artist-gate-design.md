# Web Enrichment Artist Gate + Title-Only Release-Date Lookup — Design

Date: 2026-07-19
Status: Approved (pending user review of this document)
Branch: `fix/enrichment-artist-gate`

## Problem

Two gaps in the video web-enrichment feature:

1. **Web enrichment can be triggered without an Artist / Creator.** All
   *automatic* enrichment kicks already gate on
   `category === 'MUSIC' && artist.trim() !== ''`
   (`kickPostSaveEnrichment` in `src/lib/actions/video-action-helpers.ts`,
   `markEnrichmentPending` in `src/lib/actions/create-video-draft-action.ts`).
   But the *manual* path does not: on a draft edit page (row auto-created at
   upload-complete, Artist / Creator still blank), the Web Enrichment panel
   renders whenever `videoId && category === 'MUSIC'`, its "Run enrichment"
   button is enabled, and `runVideoEnrichmentAction` accepts the run. The job
   then limps to `failed: "No linked artists to enrich."` — and on the
   E2E/fake path (`BIO_GENERATOR_FAKE=true`, `runFakeEnrichment`) it bogusly
   *succeeds* with fixture suggestions despite zero linked artists.

2. **Title-only release-date lookup is accidental, not first-class.** The
   "Find release date" button already enables on title alone and already
   scrapes the web (2 Serper searches + 1 Gemini adjudication via the
   `release-date-lookup` Lambda task). But with a blank artist,
   `resolveReleaseDateSuggestion` (`bio-generator/src/release-date.ts`) builds
   degraded queries — `"" "Title" video release date` (stray empty quoted
   string) — and a malformed prompt line: `Video: "Title" by .`.

## Decisions (user-approved)

- **Blank artist → show the panel disabled with a hint**, not hidden: the
  Web Enrichment section stays visible; Run/Re-run are disabled with the hint
  "Add an artist or creator to enable web enrichment." The server action also
  refuses as a backstop.
- **"Find release date" keeps the artist in the query when one is set**
  (precision: "Halo" alone is ambiguous, "Beyoncé Halo" is not); the
  title-only query shape becomes first-class when the artist is blank.

## Design

### 1. Enrichment gate (web app — manual path only)

**`src/app/components/forms/videos/enrichment/video-enrichment-panel.tsx`**

- Watch the live form artist via the `control` prop the panel already
  receives: `useWatch({ control, name: 'artist' })`; derive
  `hasArtist = artist.trim() !== ''` once and thread it into
  `EnrichmentPanelBody`.
- When `hasArtist` is false:
  - the empty-phase `RunEnrichmentButton` is disabled;
  - the terminal-phase `RerunEnrichmentDialog` trigger button is disabled;
  - one muted hint renders in the panel:
    "Add an artist or creator to enable web enrichment."
- Extract any new branching into named helpers (repo ESLint `complexity` cap
  of 10; the panel components are already split for this reason).

**`src/lib/actions/run-video-enrichment-action.ts`**

- After `VideoRepository.getEnrichmentState(videoId)` (whose state already
  carries `artist` — `dispatchEnrichment` uses it as `artistDisplay`), and
  before the in-flight check / any status write:
  `state.artist.trim() === ''` → return
  `{ success: false, error: 'Add an artist or creator and save before running enrichment.' }`.
- This covers the type-but-didn't-save edge (button lights up as the admin
  types, but the persisted row is still blank — the error tells them to
  save), and it closes the E2E fake path's bogus zero-artist success, since
  the fake path is only reachable through this action's `after()` chain or
  the already-gated auto-kicks.
- The error surfaces through the existing mutation-failure toast path in
  `use-video-enrichment-mutations.ts` (verify during implementation; no new
  plumbing expected).

**Untouched:** `kickPostSaveEnrichment`, `markEnrichmentPending`, the panel's
render condition in `video-form.tsx` (`videoId && category === 'MUSIC'`), the
`runEnrichmentJob` service (its `'No linked artists to enrich.'` dispatch
failure remains as a deep backstop), and all auto-kick call sites
(create/update/draft actions) — already correctly gated.

### 2. Title-only release-date lookup (Lambda only)

**`bio-generator/src/release-date.ts` — `resolveReleaseDateSuggestion`**

- Derive `artist = artistDisplay.trim()` and branch:
  - artist present (unchanged):
    queries `"${artist}" "${title}" video release date` and
    `${artist} ${title} premiere`; prompt line
    `Video: "${title}" by ${artist}.`
  - artist blank (new first-class shape):
    queries `"${title}" video release date` and `${title} premiere`;
    prompt line `Video: "${title}".`

**Untouched:** the wire schemas (`releaseDateLookupInputSchema` already
accepts an optional artist), `release-date-lookup.ts` (already passes
`artist ?? ''`), `ReleaseDateLookupService`, the API route, the query hook,
and `release-date-field.tsx` (button already gates on title only). The
enrichment-run caller (`runVideoEnrichment`) always passes a non-blank
`artistDisplay` — gated upstream — so its behavior is unchanged.

## Error handling

- The action's blank-artist refusal is a typed `{ success: false, error }`
  return **before** any `pending` write — no job state is ever created for a
  refused run, so the status poll and stale-job coercion are never engaged.
- The Lambda change is pure query/prompt construction inside a function that
  already degrades to `null` on any failure; no new failure modes.

## Testing (TDD — tests first, watch them fail)

- **Panel spec** (`video-enrichment-panel` spec): blank artist → Run
  disabled + hint visible; non-blank → enabled, no hint; terminal phase with
  blank artist → Re-run trigger disabled.
- **Action spec** (`run-video-enrichment-action` spec): blank persisted
  artist → typed error, and `setEnrichmentStatus` never called.
- **Lambda spec** (`bio-generator/src/release-date.spec.ts`): with artist →
  existing query/prompt shapes unchanged; blank artist → title-only queries,
  no stray `""`, prompt omits `by`.
- **E2E**: extend the existing draft/video-form spec to assert the disabled
  Run button + hint on a fresh blank-artist draft. Run the affected specs
  locally against the isolated Docker Mongo (`pnpm run e2e:docker:up`,
  hardcoded `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`), plus
  every spec already covering the video form / enrichment panel (repo
  lesson: neighboring-spec regressions).

## Rollout

- One PR from this worktree; Lambda + web ship together (no wire change, no
  ordering hazard). "Deploy Bio Generator" auto-runs on merge to deploy the
  Lambda; no ops steps.
