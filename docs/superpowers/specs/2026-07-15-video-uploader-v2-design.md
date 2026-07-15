# Video uploader v2 — credits comboboxes, date lookup, explicit publish

- **Date**: 2026-07-15
- **Branch**: `feat/video-uploader-v2` (base `faa01678`, v4.216.0)
- **Status**: Approved design

## Goal

Rework the admin video uploader so credits are entered through searchable
comboboxes instead of free text, the release date can be looked up from the
web at upload time, and publishing is an explicit action distinct from
saving. Plus one global style tweak to `ZinePanel`.

## Decisions (user-approved)

1. **Artist field** is _always_ a search combobox (probe prefill fills it
   when metadata exists) — not a conditional swap.
2. **Producers** live in a **separate `Producer` model** (not the artist
   catalog / `VideoArtistRole`).
3. **Release-date lookup** is an in-form button that synchronously invokes a
   new lightweight bio-generator Lambda task (Serper key already in Lambda
   SSM — no new web-app secrets).
4. **A future publish date schedules the video**: public queries change from
   `publishedAt != null` to `publishedAt <= now`.
5. On an already-published video, **Save persists date-field edits**; the
   form gains an **Unpublish** button. Publish hides once published.
6. The featured-artists combobox **fully replaces `feat.` string parsing in
   the UI**; the artist field holds the primary artist only. The canonical
   `Video.artist` string is recomposed on submit so storage, sync, display,
   and enrichment are untouched.
7. **New producers are created on video save** (pills marked "new" locally;
   no orphan rows from abandoned forms).
8. **ZinePanel** drops the black border on right + bottom only; the 6px
   accent offset shadow becomes the sole right/bottom edge.

## 1. Data model (Prisma)

```prisma
model Producer {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String   @unique
  createdBy String?  @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  videoProducers VideoProducer[]
}

// Mirrors VideoArtist: join between a Video and the Producer catalog.
model VideoProducer {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  video      Video    @relation(fields: [videoId], references: [id])
  videoId    String   @db.ObjectId
  producer   Producer @relation(fields: [producerId], references: [id])
  producerId String   @db.ObjectId
  sortOrder  Int      @default(0)

  @@unique([videoId, producerId])
  @@index([videoId])
  @@index([producerId])
}
```

`Video` gains `videoProducers VideoProducer[]`. `VideoArtistRole` is
unchanged. Domain types (`src/lib/types/domain`) gain `Producer` /
`VideoProducer` mirrors, drift-checked in the repository like the others.

**Ops**: `pnpm exec prisma db push` after deploy (two new collections +
indexes). No new env vars.

## 2. Artist entry — three controls, one canonical string

The RHF field `artist` **remains the single canonical string**
(`Primary feat. A, B`). The new controls are a structured editor over that
string — validation, probe prefill (`applyServerProbePrefill` writes
`artist`), `useVideoArtistReview` (which watches and splits the string), and
the save payload all keep working unchanged.

- `splitFeaturedArtists` (exists) decomposes the field value → primary name +
  featured names; `composeArtistString(primary, featured)` (new util,
  `src/lib/utils/compose-artist-string.ts`) recomposes with canonical
  `feat.`. Round-trip property: `split(compose(p, f)) === { p, f }`.
- **Primary artist combobox** (`ArtistSearchCombobox`, new, in
  `src/app/components/forms/fields/`): single-select search-as-you-type over
  the artist catalog (existing artist list/search API + debounce, patterned
  on `ArtistMultiSelect`). Free text allowed — an unmatched name is kept
  verbatim; the existing Artist Review section picks it up as a "new artist"
  entry (name parts editable, created on save). Selecting/typing writes the
  recomposed string back to `artist`.
- **Featured artists combobox** (`FeaturedArtistsCombobox`, new): multi
  variant with removable `Badge` pills rendered beneath. Free text adds a
  pill (marked "new") that also flows through the review section. Add/remove
  recomposes `artist`. Disabled (with hint) until a primary artist is set —
  a pill without a primary would compose an invalid `"feat. A"` string that
  slips past the required-`artist` validation.
- **Prefill/edit**: nothing special — both controls derive their display
  state from the current `artist` value via the splitter, so a probe-prefilled
  `"X feat. Y"` or an edited legacy video decomposes automatically.
- Downstream (`syncVideoArtists`, `artistDetails`, enrichment kick) is
  untouched.

## 3. Producers vertical

- `producer-repository.ts` — `search(q, take)` (case-insensitive contains,
  sorted by name), `findOrCreateByName(name, createdBy?)` (unique-name
  upsert), `syncVideoProducers(videoId, producers)` (replace joins,
  transactional).
- `ProducerService` wraps the repository; save-side sync lives here.
- `GET /api/producers/search?q=` — `withAdmin` + `withRateLimit`, returns
  `{ results: [{ id, name }] }`, capped `take` (default 10). Zod-validated
  query.
- Query key `producers.search(q)` in `src/lib/query-keys.ts`;
  `useProducersSearchQuery(q, overrides?)` hook (signal forwarded, standard
  options-override tail).
- `ProducerMultiCombobox` (new field component): same UX as featured pills;
  free text adds a "new"-badged pill.
- Form schema gains
  `producers: z.array(z.object({ id: z.string().optional(), name: z.string().min(1) })).max(20).optional()`
  (`video-producer-schema.ts`); `VIDEO_PERMITTED_FIELD_NAMES` extended.
- Create/update actions: after the video row is written, entries without an
  `id` are `findOrCreateByName`d, then `syncVideoProducers` replaces the
  joins. Edit mode prefills pills from the video's `videoProducers`.
- **Out of scope**: public display of producers (data model ready).

## 4. Release-date web lookup

### Lambda (bio-generator workspace)

New task `release-date-lookup` alongside the existing bio / video-enrichment
tasks in `handler.ts`:

- Input: `{ task: 'release-date-lookup', title: string, artist?: string }`.
- Flow: Serper search (`"<title>" <artist> release date`) → Gemini extracts
  `{ releasedOn: 'YYYY-MM-DD', confidence: 'high'|'medium'|'low', sources: string[] }`
  or a not-found result. Strict output schema; invalid model output → not
  found, never a throw.
- Invoked **synchronously** (RequestResponse) — unlike the fire-and-forget
  enrichment path. Internal budget well under the route timeout (single
  search + single extraction).

### Web app

- `GET /api/videos/release-date-lookup?title=&artist=` — `withAdmin` +
  `withRateLimit` (new modest tier, e.g. 10/min). 400 on missing/empty
  title; 200 `{ result: { releasedOn, confidence, sources } | null }`; 502
  when the Lambda invoke fails.
- `ReleaseDateLookupService` (`src/lib/services/`): sync `InvokeCommand`
  reusing the Lambda client/config pattern from
  `video-enrichment-service.ts`, hard client-side timeout; **fake path**
  gated exactly like `video-enrichment-fixture` (E2E/dev without Lambda
  config) returning a deterministic fixture date.
- `useReleaseDateLookupQuery(title, artist, { enabled: false })` +
  `refetch()` on click; key `videos.releaseDateLookup(title, artist)`.
- **Form**: "Find release date" button beside the `releasedOn` DatePicker —
  disabled while title is empty or a lookup is in flight; spinner while
  searching; on success fills `releasedOn` and toasts confidence + first
  source; on miss toasts "No release date found". Never fires automatically;
  fills the field even if non-empty (explicit click = intent to replace).

**Ops**: one "Deploy Bio Generator" workflow run. No new secrets.

## 5. Category default

`buildVideoDefaults()` sets `category: 'MUSIC'` in create mode. Edit mode
keeps the stored value. The RadioGroup renders with Music pre-selected.

## 6. Publish flow

### Button semantics (form footer)

| State                 | Buttons         | Behavior                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create / draft        | Save, Publish   | **Save** submits with `publishedAt` stripped — a typed date is _not_ persisted and the video stays a draft. **Publish** submits everything with `publishedAt` = date field, or today when empty.                                                                                                                                                                                                         |
| Published / scheduled | Save, Unpublish | **Save** persists date-field edits as an ordinary field change (moving a scheduled date isn't "publishing"). Clearing the field + Save keeps the existing `publishedAt` — Save never unpublishes. **Unpublish** calls the existing `unpublishVideoAction`, returning to draft — it changes publish state only and does not save other dirty fields (a confirm dialog notes this when the form is dirty). |

Publish/Save enforcement is client-side payload shaping (admin-only tool);
the actions keep accepting `publishedAt` as today. The date field is
relabeled "Publish date" with helper text explaining Publish/scheduling.

### Scheduling

- The public "published" gate moves from `publishedAt != null` to
  `publishedAt <= now`, extracted into one shared where-helper in
  `video-repository.ts` and applied to **every** published-video gate
  (public list/detail, playlist video guard, admin `count`), found by
  sweeping `publishedAt` usages.
- States: **Draft** (`null`), **Scheduled** (`> now`), **Published**
  (`<= now`), Archived (unchanged, orthogonal). Admin videos list badge
  logic gains Scheduled; dashboard "published" count = `<= now`, the
  draft-side count = everything else (label format unchanged).
- No cron needed — visibility is query-time.

## 7. ZinePanel border

In `zine-panel.tsx`, `border-2` → `border-t-2 border-l-2` (still
`border-black`); `shadow-zine` unchanged. The accent shadow is now the only
right/bottom edge. Update the component spec. **Coordination note**: the
parallel `style/design-tweaks` branch also drops borders in playlists-scoped
components; whichever lands second may see a trivial overlap.

## 8. Error handling

- Lookup route: Lambda failure/timeout → 502 → destructive toast; malformed
  Lambda payload → treated as not-found (200, `result: null`).
- Producer sync runs inside the save action's existing try/catch; a sync
  failure surfaces the standard save error and leaves the form dirty.
- Comboboxes degrade to plain text entry when search queries error (free
  text always works; search results are an enhancement).

## 9. Testing (TDD throughout)

- **Unit**: `composeArtistString` round-trip with `splitFeaturedArtists`;
  combobox components (search, select, free-text pill, remove); producer
  repository/service/route; lookup service (fake + invoke paths, timeout,
  malformed payload); form button semantics (Save strips `publishedAt` on
  drafts, Publish stamps today when empty, published-Save persists edits,
  clear+Save keeps date); repository where-helper (`lte now`) incl. count
  buckets; badge state logic; `buildVideoDefaults` category; ZinePanel
  border classes.
- **Lambda workspace**: `release-date-lookup` task — happy path, not-found,
  Serper error, invalid Gemini output.
- **E2E**: uploader flow — pick existing artist via combobox, add a featured
  pill (new name → review section), add existing + new producer pills, Find
  release date (fixture path fills the field), Save → still draft on
  `/videos`; Publish (empty date) → visible; publish with future date via
  the form → _not_ visible publicly, Scheduled badge in admin; Unpublish →
  hidden again. Prefer driving state through the UI over new seed rows;
  where the seed must change (e.g. one Producer row for search), sweep
  count-pinning assertions per the `#LESSONS` rule and run neighboring specs
  locally (admin-dashboard, admin videos, playlists).

## 10. Out of scope

- Public display of producers and structured featured credits.
- Backfill/migration of existing `Video.artist` strings (decomposed lazily
  on edit).
- Notifications or cron around scheduled publishing.
- Artist catalog changes (producers stay separate).

## Ops runbook (post-merge)

1. `pnpm exec prisma db push` — `Producer` + `VideoProducer` collections
   (deploy may handle it; verify).
2. Run the "Deploy Bio Generator" workflow so the Lambda knows the
   `release-date-lookup` task.
3. Smoke: admin upload → Find release date on a real title → Publish with a
   future date → confirm hidden publicly until that date.
