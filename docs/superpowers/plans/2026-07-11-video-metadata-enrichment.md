# Video Metadata Probe + Web Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an admin uploads a video, probe it with ffprobe (storing normalized technical fields plus the full raw JSON), auto-create/link Artist shells from the artist string via a new VideoArtist join, run an async web-enrichment job (MusicBrainz/Wikidata first, Serper + Gemini fallback) that produces reviewable suggestions (artist full names, stage names, DOBs, release date), and surface everything on the admin edit page with per-field Apply.

**Architecture:** ffprobe runs on the web host (binary already in the prod Alpine image) against a 120-second presigned S3 GET URL; web search/identity enrichment is a `task: 'video-enrichment'` mode added to the existing `bio-generator/` Lambda (reusing its Serper/MusicBrainz/Wikidata/Gemini clients and SSM keys); results return via token-guarded callback/progress routes and are polled by the client at 2.5 s — a structural copy of the proven artist bio-generation pipeline. All web-derived facts are stored as `VideoEnrichmentSuggestion` rows and never auto-applied.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Prisma 6 + MongoDB, TanStack Query 5, RHF 7 + Zod 4, shadcn/ui + Tailwind v4, Vitest 4, Playwright, AWS Lambda (SAM, esbuild, nodejs24.x).

**Spec:** `docs/superpowers/specs/2026-07-11-video-metadata-enrichment-design.md` (committed, approved).

## Global Constraints

- Working directory: the git worktree `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat+video-metadata-enrichment`, branch `feat/video-metadata-enrichment`. Never commit to main.
- All subagents run on Fable 5 (session instruction).
- TDD per step: write the failing test, run it and watch it fail, implement minimally, watch it pass, commit.
- Gates before every commit (pre-commit hook also enforces): `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- `bio-generator/` is a separate pnpm workspace (own lockfile). Its gates: `cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run` (it has no `typecheck` script).
- Commits: `type(scope): <gitmoji> subject`, full header ≤50 chars including the emoji; no AI attribution; no `--no-verify`.
- MPL header from `HEADER.txt` at the top of every new source file (web and Lambda).
- Arrow functions only; named exports; no `any`, no `!`, no `@ts-ignore`/`eslint-disable` of any kind; explicit return types on exported functions; ESLint complexity cap 10 — extract helpers proactively.
- Specs adjacent to source; `describe/it/expect/vi` are globals (never imported); modules importing `server-only` need `vi.mock('server-only', () => ({}))` in their specs; mock at the service boundary; one condition per test.
- Sanctioned exception: `video-enrichment-error-boundary.tsx` is a class component — React error boundaries require a class and no boundary component exists in the repo yet.
- Never read or touch `.env*`. E2E runs only against the isolated Docker Mongo (`mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`).
- Coverage: ≥95% branches sustained; never regress the `COVERAGE_METRICS.md` baseline.

## Execution order (cross-cluster dependencies)

Tasks are numbered by cluster (A: 1–6, B: 7–15, C: 16–21), not by dependency. Execute in this order:

**1, 2, 3, 4 → 7, 8, 9 → 5 → 10, 11, 12, 13 → 6 → 14, 15 → 16, 17, 18, 19, 20, 21**

- Task 5 imports `videoProbeFixture` from `@/lib/services/video-enrichment-fixture` (created in Task 9).
- Task 6 imports `VideoEnrichmentService` (created in Task 10).
- Everything else depends only on tasks earlier in the order above.

---

# Video Metadata Enrichment — Implementation Plan, Part A (Tasks 1–6)

**Spec:** `docs/superpowers/specs/2026-07-11-video-metadata-enrichment-design.md`
**Branch / worktree:** `feat/video-metadata-enrichment` at
`/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat+video-metadata-enrichment`
(all commands run from this worktree root).

**Scope of Part A:** Prisma schema + domain types + wire schema + strip lists (Task 1);
feat.-split util (Task 2); ffprobe probe pipeline (Task 3); presign util +
`VideoRepository.saveProbeResult` (Task 4); `VideoProbeService` (Task 5);
create/update Server Action wiring via `kickPostSaveEnrichment` (Task 6).

**Cross-part execution ordering (hard):**

- Tasks 1–4 have no Part B dependencies and can run first, in order.
- **Task 5 requires Part B's `src/lib/services/video-enrichment-fixture.ts`**
  (exports `videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown }`) —
  typecheck fails without the file on disk.
- **Task 6 requires Part B's `src/lib/services/video-enrichment-service.ts`**
  (static `syncVideoArtists(videoId: string, artistString: string): Promise<void>` and
  `runEnrichmentJob(videoId: string): Promise<void>`).

**Binding repo rules baked into every task:** MPL header from `HEADER.txt` on every new
source file; arrow functions only; named exports; no `any` / non-null `!` /
ts-ignore / eslint-disable; explicit return types on exported functions; destructured
params; `interface` for object shapes; complexity cap 10 (extract helpers);
`describe/it/expect/vi` are globals (never imported); `vi.mock('server-only', () => ({}))`
in specs of server-only modules; one condition per test; path aliases only; commit
headers ≤50 chars including gitmoji; full gate before each commit:
`pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.

**Contract deviations (Part A):**

1. There is **no existing `video-schema` spec** — `src/lib/validation/video-schema.spec.ts`
   is **created** (the contract said "extend the existing video-schema spec").
2. The admin detail route strips exactly `probeData` / `enrichmentJobToken` /
   `enrichmentProgress` per the pinned contract. `enrichmentError` therefore remains in
   the admin detail JSON body, but never reaches app code: it is not in `videoRowSchema`,
   and Zod strips unknown keys at parse. (Part B's enrichment endpoint is the error's
   sanctioned carrier.)
3. On update, a file-only replacement also re-runs `syncVideoArtists` (the fixed
   `kickPostSaveEnrichment` signature always syncs first; the sync is idempotent).
   `artistChanged → re-sync`, `s3KeyReplaced → reProbe`, and
   `MUSIC && (artistChanged || s3KeyReplaced) → runEnrichmentJob` all hold exactly.

---

### Task 1: Prisma schema, domain types, wire schema, strip lists

**Files:**

- Modify `prisma/schema.prisma` — Video probe/enrichment fields + relations; new
  `VideoArtistRole` enum, `VideoArtist`, `VideoEnrichmentSuggestion` models; Artist
  back-relation.
- Modify `src/lib/types/domain/video.ts` — 23 new nullable fields on `Video`.
- Create `src/lib/types/domain/video-artist.ts` — `VideoArtistRole`, `VideoArtistRecord`.
- Modify `src/lib/types/domain/index.ts` — barrel export.
- Modify `src/lib/validation/video-schema.ts` — 13 wire fields on `videoRowSchema`.
- Create `src/lib/validation/video-schema.spec.ts`.
- Modify `src/app/api/videos/route.ts` — public strip list for ALL new internals.
- Modify `src/app/api/videos/route.spec.ts`.
- Modify `src/app/api/videos/[id]/route.ts` — admin strip of probeData/enrichmentJobToken/enrichmentProgress.
- Modify `src/app/api/videos/[id]/route.spec.ts`.
- Modify `src/lib/services/video-service.spec.ts` + `src/app/videos/page.spec.tsx`
  (their `const mockVideo: Video = {…}` literals gain the new fields; drift-guard fallout).

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: Prisma `Video` columns `probedAt, probeError, container, width, height,
videoCodec, audioCodec, bitrateKbps, frameRate, audioChannels, audioSampleRateHz,
colorSpace, colorPrimaries, colorTransfer, sourceCreatedAt, encoder, probeData,
enrichmentStatus, enrichmentError, enrichmentStartedAt, enrichmentJobToken,
enrichmentProgress, enrichedAt`; relations `videoArtists`, `enrichmentSuggestions`;
  models `VideoArtist` (enum `VideoArtistRole`), `VideoEnrichmentSuggestion`; domain
  `Video` type with the same fields (`Json` from `@/lib/types/domain/shared` for the two
  Json columns); `VideoArtistRecord` + `VideoArtistRole` union in
  `@/lib/types/domain/video-artist`; `videoRowSchema` wire fields (list above, minus the
  never-on-wire four); public/admin strip behavior other parts' routes/components rely on.

- [ ] **Step 1: Edit `prisma/schema.prisma`** — three edits, exactly as follows.

  (a) In `model Video`, insert between the `updatedAt` line and the `@@index([releasedOn])` line:

  ```prisma
    // ffprobe technical metadata — written by the server-side probe pipeline.
    // All optional: rows predating the feature (and failed probes) leave them unset.
    probedAt          DateTime? // When the last probe attempt finished (success or failure)
    probeError        String? // Error from the last failed probe; null after a successful probe
    container         String? // ffprobe format.format_name, e.g. "mov,mp4,m4a,3gp,3g2,mj2"
    width             Int?
    height            Int?
    videoCodec        String? // First video stream codec_name, e.g. "h264"
    audioCodec        String? // First audio stream codec_name, e.g. "aac"
    bitrateKbps       Int? // Overall format.bit_rate, rounded to kbps
    frameRate         Float? // avg_frame_rate fraction evaluated, 2dp (30000/1001 -> 29.97)
    audioChannels     Int?
    audioSampleRateHz Int?
    colorSpace        String?
    colorPrimaries    String?
    colorTransfer     String?
    sourceCreatedAt   DateTime? // Container creation_time tag (when the source file was made)
    encoder           String? // Encoder tag, e.g. "Lavf60.3.100"
    probeData         Json? // Full raw ffprobe JSON — format.filename redacted to the bare s3Key, 256KB cap

    // Async web-enrichment job state (mirrors the Artist bio* lifecycle fields)
    enrichmentStatus    String? // pending | processing | succeeded | failed (null = never run)
    enrichmentError     String? // Error from the last failed enrichment run, if any
    enrichmentStartedAt DateTime? // When the current/last job started (stale-job detection)
    enrichmentJobToken  String? // Opaque per-job callback token; set at dispatch, cleared on claim
    enrichmentProgress  Json? // Latest progress checkpoint; cleared when a new run goes pending
    enrichedAt          DateTime? // When the last enrichment run completed successfully

    videoArtists          VideoArtist[] // Linked Artist rows parsed from the artist string
    enrichmentSuggestions VideoEnrichmentSuggestion[] // Reviewable web-derived facts
  ```

  (b) Append after the closing `}` of `model Video`:

  ```prisma
  enum VideoArtistRole {
    PRIMARY
    FEATURED
  }

  // Join between a Video and the Artist catalog, parsed from the free-text
  // Video.artist string (split only on feat./ft./featuring). Mirrors ArtistRelease.
  model VideoArtist {
    id        String          @id @default(auto()) @map("_id") @db.ObjectId
    video     Video           @relation(fields: [videoId], references: [id])
    videoId   String          @db.ObjectId
    artist    Artist          @relation(fields: [artistId], references: [id])
    artistId  String          @db.ObjectId
    role      VideoArtistRole @default(PRIMARY)
    sortOrder Int             @default(0)

    @@unique([videoId, artistId])
    @@index([videoId])
    @@index([artistId])
  }

  // One reviewable web-derived fact for a video (artistId null = the video-level
  // releasedOn suggestion). Rows, not Json: per-row atomic apply/dismiss + audit.
  model VideoEnrichmentSuggestion {
    id         String    @id @default(auto()) @map("_id") @db.ObjectId
    video      Video     @relation(fields: [videoId], references: [id])
    videoId    String    @db.ObjectId
    artistId   String?   @db.ObjectId
    field      String // Whitelisted field name, e.g. "fullName" | "stageName" | "bornOn" | "releasedOn"
    value      String // Suggested value, serialized as a string
    confidence String // high | medium | low
    sources    Json // <=10 http(s) source URLs
    note       String?
    status     String    @default("pending") // pending | applied | dismissed
    appliedAt  DateTime?
    appliedBy  String?   @db.ObjectId
    createdAt  DateTime  @default(now())

    @@index([videoId, status])
    @@index([artistId])
  }
  ```

  (c) In `model Artist`, insert directly after the line
  `artistFeaturedArtists ArtistFeaturedArtist[]`:

  ```prisma
    videoArtists          VideoArtist[] // Videos this artist appears on (probe/enrichment feature)
  ```

- [ ] **Step 2: Regenerate the Prisma client** — run:

  ```bash
  pnpm exec prisma generate
  ```

  Expect: `✔ Generated Prisma Client` with no schema validation errors.

- [ ] **Step 3: Push the schema** (creates the new collections/indexes; one push covers
      the whole feature) — run:

  ```bash
  pnpm exec prisma db push
  ```

  Expect: `Your database indexes are now in sync with your Prisma schema.` (Uses the
  standard repo command against the dev DB — never against the E2E container, never
  reading `.env*` manually.)

- [ ] **Step 4: Run typecheck expecting FAIL (this is the failing "test" for the domain type)** —

  ```bash
  pnpm run typecheck
  ```

  Expected failure: in `src/lib/repositories/video-repository.ts` the drift guard
  `const _videoDrift: _VideoDrift = true;` errors with
  `Type 'true' is not assignable to type 'never'` (hand-written `Video` no longer
  matches `Prisma.VideoGetPayload`).

- [ ] **Step 5: Update the domain `Video` type.** In `src/lib/types/domain/video.ts`,
      add the import at the top of the type section:

  ```ts
  import type { Json } from './shared';
  ```

  and extend the `Video` type after `updatedAt: Date;` (field order does not matter to
  the drift guard; this mirrors the schema), so the type ends:

  ```ts
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    // --- ffprobe technical metadata (probe pipeline; all nullable) ---
    probedAt: Date | null;
    probeError: string | null;
    container: string | null;
    width: number | null;
    height: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    bitrateKbps: number | null;
    frameRate: number | null;
    audioChannels: number | null;
    audioSampleRateHz: number | null;
    colorSpace: string | null;
    colorPrimaries: string | null;
    colorTransfer: string | null;
    sourceCreatedAt: Date | null;
    encoder: string | null;
    probeData: Json | null;
    // --- async web-enrichment job state (mirrors the Artist bio* fields) ---
    enrichmentStatus: string | null;
    enrichmentError: string | null;
    enrichmentStartedAt: Date | null;
    enrichmentJobToken: string | null;
    enrichmentProgress: Json | null;
    enrichedAt: Date | null;
  };
  ```

  `CreateVideoData` / `UpdateVideoData` are intentionally untouched — probe fields are
  written only through `VideoRepository.saveProbeResult` (Task named below) and Part B's
  enrichment-state methods, never through the generic create/update path.

- [ ] **Step 6: Create `src/lib/types/domain/video-artist.ts`** (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  /**
   * Hand-written, Prisma-free mirror of the `VideoArtist` join model (a video's
   * link to the Artist catalog, parsed from the free-text artist string).
   */

  /** Role union mirroring the Prisma `VideoArtistRole` enum. */
  export type VideoArtistRole = 'PRIMARY' | 'FEATURED';

  /** Scalar fields of the Prisma `VideoArtist` join model (no relations). */
  export interface VideoArtistRecord {
    id: string;
    videoId: string;
    artistId: string;
    role: VideoArtistRole;
    sortOrder: number;
  }
  ```

  In `src/lib/types/domain/index.ts`, add after `export * from './video';`:

  ```ts
  export * from './video-artist';
  ```

- [ ] **Step 7: Run typecheck expecting the residual FAIL** —

  ```bash
  pnpm run typecheck
  ```

  Expected failure now moves to the two fully-typed mock literals:
  `src/lib/services/video-service.spec.ts` (`const mockVideo: Video`) and
  `src/app/videos/page.spec.tsx` (`const mockVideo: Video`) — each missing the 23 new
  properties.

- [ ] **Step 8: Extend both mock literals.** In BOTH
      `src/lib/services/video-service.spec.ts` and `src/app/videos/page.spec.tsx`, insert
      into the `mockVideo` object (before the closing `}`):

  ```ts
    probedAt: null,
    probeError: null,
    container: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    bitrateKbps: null,
    frameRate: null,
    audioChannels: null,
    audioSampleRateHz: null,
    colorSpace: null,
    colorPrimaries: null,
    colorTransfer: null,
    sourceCreatedAt: null,
    encoder: null,
    probeData: null,
    enrichmentStatus: null,
    enrichmentError: null,
    enrichmentStartedAt: null,
    enrichmentJobToken: null,
    enrichmentProgress: null,
    enrichedAt: null,
  ```

- [ ] **Step 9: Run typecheck expecting PASS** —

  ```bash
  pnpm run typecheck
  ```

- [ ] **Step 10: Write the failing wire-schema spec.** Create
      `src/lib/validation/video-schema.spec.ts` (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { videoRowSchema } from './video-schema';

  /** Minimal valid serialized row, as `/api/videos` emits it (listing shape). */
  const baseWireRow = {
    id: '507f1f77bcf86cd799439011',
    title: 'Test Video',
    artist: 'Test Artist',
    category: 'MUSIC',
    description: null,
    releasedOn: '2026-01-01T00:00:00.000Z',
    durationSeconds: 120,
    s3Key: 'media/videos/507f1f77bcf86cd799439011/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: 123456,
    mimeType: 'video/mp4',
    posterUrl: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  describe('videoRowSchema — probe/enrichment wire fields', () => {
    it('parses a listing row with every probe field absent', () => {
      const parsed = videoRowSchema.parse(baseWireRow);

      expect(parsed.width).toBeUndefined();
    });

    it('keeps width on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, width: 1920 });

      expect(parsed.width).toBe(1920);
    });

    it('coerces a numeric-string width', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, width: '1920' });

      expect(parsed.width).toBe(1920);
    });

    it('accepts a null width', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, width: null });

      expect(parsed.width).toBeNull();
    });

    it('keeps height on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, height: 1080 });

      expect(parsed.height).toBe(1080);
    });

    it('keeps videoCodec on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, videoCodec: 'h264' });

      expect(parsed.videoCodec).toBe('h264');
    });

    it('keeps audioCodec on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, audioCodec: 'aac' });

      expect(parsed.audioCodec).toBe('aac');
    });

    it('keeps bitrateKbps on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, bitrateKbps: 5000 });

      expect(parsed.bitrateKbps).toBe(5000);
    });

    it('keeps a fractional frameRate on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, frameRate: 29.97 });

      expect(parsed.frameRate).toBe(29.97);
    });

    it('keeps container on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, container: 'mov,mp4' });

      expect(parsed.container).toBe('mov,mp4');
    });

    it('keeps audioChannels on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, audioChannels: 2 });

      expect(parsed.audioChannels).toBe(2);
    });

    it('keeps audioSampleRateHz on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, audioSampleRateHz: 48000 });

      expect(parsed.audioSampleRateHz).toBe(48000);
    });

    it('coerces sourceCreatedAt to a Date', () => {
      const parsed = videoRowSchema.parse({
        ...baseWireRow,
        sourceCreatedAt: '2024-01-15T10:30:00.000Z',
      });

      expect(parsed.sourceCreatedAt).toEqual(new Date('2024-01-15T10:30:00.000Z'));
    });

    it('coerces probedAt to a Date', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, probedAt: '2026-07-11T00:00:00.000Z' });

      expect(parsed.probedAt).toEqual(new Date('2026-07-11T00:00:00.000Z'));
    });

    it('accepts a null probedAt', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, probedAt: null });

      expect(parsed.probedAt).toBeNull();
    });

    it('keeps probeError on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, probeError: 'ffprobe exited 1' });

      expect(parsed.probeError).toBe('ffprobe exited 1');
    });

    it('keeps enrichmentStatus on the wire', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentStatus: 'pending' });

      expect(parsed.enrichmentStatus).toBe('pending');
    });

    it('strips probeData (never on the wire)', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, probeData: { format: {} } });

      expect(parsed).not.toHaveProperty('probeData');
    });

    it('strips enrichmentJobToken (never on the wire)', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentJobToken: 'tok' });

      expect(parsed).not.toHaveProperty('enrichmentJobToken');
    });

    it('strips enrichmentProgress (never on the wire)', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentProgress: { stage: 'x' } });

      expect(parsed).not.toHaveProperty('enrichmentProgress');
    });

    it('strips enrichmentError (never on the wire)', () => {
      const parsed = videoRowSchema.parse({ ...baseWireRow, enrichmentError: 'boom' });

      expect(parsed).not.toHaveProperty('enrichmentError');
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/validation/video-schema.spec.ts
  ```

  Expected failure: every "keeps …"/"coerces …"/"accepts a null …" test fails (e.g.
  `expected undefined to be 1920`) because `videoRowSchema` strips the unknown keys.
  The "absent" test and the four "strips …" tests already pass (regression guards).

- [ ] **Step 11: Extend `videoRowSchema`.** In `src/lib/validation/video-schema.ts`, add
      below `const nullableString = z.string().nullable();`:

  ```ts
  const nullableNumber = z.coerce.number().nullable();
  ```

  and inside the `videoRowSchema` object, after `streamUrl: z.string().nullable().optional(),`:

  ```ts
    // Probe/enrichment display fields — present on the admin detail wire only,
    // stripped from listings, so all are optional. Numerics/dates are coerced
    // like the base fields. probeData / enrichmentJobToken / enrichmentProgress /
    // enrichmentError are NEVER on this wire (unknown keys are stripped at parse).
    width: nullableNumber.optional(),
    height: nullableNumber.optional(),
    videoCodec: nullableString.optional(),
    audioCodec: nullableString.optional(),
    bitrateKbps: nullableNumber.optional(),
    frameRate: nullableNumber.optional(),
    container: nullableString.optional(),
    audioChannels: nullableNumber.optional(),
    audioSampleRateHz: nullableNumber.optional(),
    sourceCreatedAt: nullableDate.optional(),
    probedAt: nullableDate.optional(),
    probeError: nullableString.optional(),
    enrichmentStatus: nullableString.optional(),
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run src/lib/validation/video-schema.spec.ts
  ```

- [ ] **Step 12: Write the failing route strip tests.**

  (a) In `src/app/api/videos/route.spec.ts`, extend `mockVideo` (after `updatedBy: null,`):

  ```ts
    width: 1920,
    enrichmentStatus: 'pending',
    probeData: { format: { filename: 'media/videos/test/video.mp4' } },
    enrichmentJobToken: 'job-token-1',
  ```

  and add after the existing `it('omits updatedBy from serialized rows', …)` block:

  ```ts
  it('omits probeData from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('probeData');
  });

  it('omits enrichmentJobToken from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('enrichmentJobToken');
  });

  it('omits probe display fields (width) from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('width');
  });

  it('omits enrichmentStatus from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('enrichmentStatus');
  });
  ```

  (b) In `src/app/api/videos/[id]/route.spec.ts`, extend `mockVideo` (after `updatedBy: null,`):

  ```ts
    width: 1920,
    probedAt: new Date('2026-03-01'),
    probeData: { format: { filename: 'media/videos/test/video.mp4' } },
    enrichmentJobToken: 'job-token-1',
    enrichmentProgress: { stage: 'searching' },
  ```

  and add after the `it('serializes a BigInt fileSize to a JSON-safe number', …)` block:

  ```ts
  it('keeps probe display fields on the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data.width).toBe(1920);
  });

  it('omits probeData from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('probeData');
  });

  it('omits enrichmentJobToken from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('enrichmentJobToken');
  });

  it('omits enrichmentProgress from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('enrichmentProgress');
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run "src/app/api/videos/route.spec.ts" "src/app/api/videos/[id]/route.spec.ts"
  ```

  Expected failures: the new `omits probeData / enrichmentJobToken / width /
enrichmentStatus` listing tests and the three admin `omits …` tests fail
  (properties ARE present); `keeps probe display fields` already passes.

- [ ] **Step 13: Implement the strips.**

  (a) In `src/app/api/videos/route.ts`, replace the `VideoRowWithStream` type and
  `buildRows` with:

  ```ts
  /**
   * Video fields that never leave the server on the listing payloads: the audit
   * ObjectIds plus every probe/enrichment internal. Probe display fields are
   * admin-detail-only; job state and raw probe JSON are never on any wire.
   */
  type VideoInternalField =
    | 'createdBy'
    | 'updatedBy'
    | 'probedAt'
    | 'probeError'
    | 'container'
    | 'width'
    | 'height'
    | 'videoCodec'
    | 'audioCodec'
    | 'bitrateKbps'
    | 'frameRate'
    | 'audioChannels'
    | 'audioSampleRateHz'
    | 'colorSpace'
    | 'colorPrimaries'
    | 'colorTransfer'
    | 'sourceCreatedAt'
    | 'encoder'
    | 'probeData'
    | 'enrichmentStatus'
    | 'enrichmentError'
    | 'enrichmentStartedAt'
    | 'enrichmentJobToken'
    | 'enrichmentProgress'
    | 'enrichedAt';

  /**
   * A public video row: the internal audit/probe/enrichment fields are dropped,
   * with the runtime-only, per-request signed stream URL attached.
   */
  type VideoRowWithStream = Omit<Video, VideoInternalField> & { streamUrl: string | null };

  /** Strip the internal fields from one row and attach its signed stream URL. */
  const toPublicVideoRow = ({
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    probedAt: _probedAt,
    probeError: _probeError,
    container: _container,
    width: _width,
    height: _height,
    videoCodec: _videoCodec,
    audioCodec: _audioCodec,
    bitrateKbps: _bitrateKbps,
    frameRate: _frameRate,
    audioChannels: _audioChannels,
    audioSampleRateHz: _audioSampleRateHz,
    colorSpace: _colorSpace,
    colorPrimaries: _colorPrimaries,
    colorTransfer: _colorTransfer,
    sourceCreatedAt: _sourceCreatedAt,
    encoder: _encoder,
    probeData: _probeData,
    enrichmentStatus: _enrichmentStatus,
    enrichmentError: _enrichmentError,
    enrichmentStartedAt: _enrichmentStartedAt,
    enrichmentJobToken: _enrichmentJobToken,
    enrichmentProgress: _enrichmentProgress,
    enrichedAt: _enrichedAt,
    ...video
  }: Video): VideoRowWithStream => ({
    ...video,
    streamUrl: signStreamUrl(video.s3Key),
  });

  /** Drop internal fields, attach signed stream URLs, then BigInt-serialize for JSON. */
  const buildRows = (videos: Video[]): VideoRowWithStream[] =>
    serializeForResponse(videos.map(toPublicVideoRow));
  ```

  (b) In `src/app/api/videos/[id]/route.ts`, replace

  ```ts
  const video = serializeForResponse({
    ...result.data,
    streamUrl: signStreamUrl(result.data.s3Key),
  });

  return NextResponse.json(video, { headers: CACHE_HEADERS });
  ```

  with

  ```ts
  // Raw probe JSON, the per-job callback token, and the progress checkpoint
  // are server-internal — the admin edit page reads the normalized probe
  // columns here and polls job state via the enrichment endpoint instead.
  const {
    probeData: _probeData,
    enrichmentJobToken: _enrichmentJobToken,
    enrichmentProgress: _enrichmentProgress,
    ...video
  } = result.data;

  const payload = serializeForResponse({
    ...video,
    streamUrl: signStreamUrl(video.s3Key),
  });

  return NextResponse.json(payload, { headers: CACHE_HEADERS });
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run "src/app/api/videos/route.spec.ts" "src/app/api/videos/[id]/route.spec.ts"
  ```

- [ ] **Step 14: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add prisma/schema.prisma src/lib/types/domain/video.ts src/lib/types/domain/video-artist.ts src/lib/types/domain/index.ts src/lib/validation/video-schema.ts src/lib/validation/video-schema.spec.ts src/app/api/videos/route.ts src/app/api/videos/route.spec.ts "src/app/api/videos/[id]/route.ts" "src/app/api/videos/[id]/route.spec.ts" src/lib/services/video-service.spec.ts src/app/videos/page.spec.tsx
  git commit -m "feat(videos): ✨ probe schema, types, wire"
  ```

---

### Task 2: feat.-split artist-name util

**Files:**

- Create `src/lib/utils/artist-name-split.ts`
- Create (test) `src/lib/utils/artist-name-split.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `splitFeaturedArtists(artist: string): SplitArtistName[]` and
  `interface SplitArtistName { name: string; role: 'primary' | 'featured' }` in
  `@/lib/utils/artist-name-split` — consumed by `VideoEnrichmentService.syncVideoArtists`
  (Part B).

- [ ] **Step 1: Write the failing spec.** Create `src/lib/utils/artist-name-split.spec.ts`
      (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { splitFeaturedArtists } from './artist-name-split';

  describe('splitFeaturedArtists', () => {
    it('returns a lone name as the single primary', () => {
      expect(splitFeaturedArtists('Ceschi')).toEqual([{ name: 'Ceschi', role: 'primary' }]);
    });

    it('splits on "feat."', () => {
      expect(splitFeaturedArtists('Ceschi feat. Sage Francis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('splits on "ft."', () => {
      expect(splitFeaturedArtists('Ceschi ft. Sage Francis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('splits on "featuring"', () => {
      expect(splitFeaturedArtists('Ceschi featuring Sage Francis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('matches the token case-insensitively', () => {
      expect(splitFeaturedArtists('Ceschi FEAT. Sage Francis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('splits a parenthesized feat token and drops the brackets', () => {
      expect(splitFeaturedArtists('Ceschi (feat. Sage Francis)')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('splits a bracketed ft token and drops the brackets', () => {
      expect(splitFeaturedArtists('Ceschi [ft. Sage Francis]')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('splits chained feat tokens into multiple featured names', () => {
      expect(splitFeaturedArtists('Ceschi feat. Sage Francis featuring Astronautalis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
        { name: 'Astronautalis', role: 'featured' },
      ]);
    });

    it('never splits on an ampersand', () => {
      expect(splitFeaturedArtists('Simon & Garfunkel')).toEqual([
        { name: 'Simon & Garfunkel', role: 'primary' },
      ]);
    });

    it('never splits on an "x" collab separator', () => {
      expect(splitFeaturedArtists('Ceschi x Factor')).toEqual([
        { name: 'Ceschi x Factor', role: 'primary' },
      ]);
    });

    it('never splits on a comma', () => {
      expect(splitFeaturedArtists('Ceschi, Sage Francis')).toEqual([
        { name: 'Ceschi, Sage Francis', role: 'primary' },
      ]);
    });

    it('never splits on a plus sign', () => {
      expect(splitFeaturedArtists('Ceschi + Sage Francis')).toEqual([
        { name: 'Ceschi + Sage Francis', role: 'primary' },
      ]);
    });

    it('keeps a comma inside a featured segment intact', () => {
      expect(splitFeaturedArtists('Ceschi feat. Sage Francis, Astronautalis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis, Astronautalis', role: 'featured' },
      ]);
    });

    it('does not split the mid-word "feat" in Featurecast', () => {
      expect(splitFeaturedArtists('Featurecast')).toEqual([
        { name: 'Featurecast', role: 'primary' },
      ]);
    });

    it('does not split the mid-word "feat" in The Featherlights', () => {
      expect(splitFeaturedArtists('The Featherlights')).toEqual([
        { name: 'The Featherlights', role: 'primary' },
      ]);
    });

    it('splits the word-boundary token in "Left ft. Right"', () => {
      expect(splitFeaturedArtists('Left ft. Right')).toEqual([
        { name: 'Left', role: 'primary' },
        { name: 'Right', role: 'featured' },
      ]);
    });

    it('does not split "ft." glued to the preceding word', () => {
      expect(splitFeaturedArtists('Loftft. Right')).toEqual([
        { name: 'Loftft. Right', role: 'primary' },
      ]);
    });

    it('treats a string that starts with a feat token as one primary (empty-primary edge)', () => {
      expect(splitFeaturedArtists('feat. Sage Francis')).toEqual([
        { name: 'feat. Sage Francis', role: 'primary' },
      ]);
    });

    it('trims surrounding whitespace from every name', () => {
      expect(splitFeaturedArtists('  Ceschi   feat.   Sage Francis  ')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('dedupes a featured name equal to the primary, case-insensitively', () => {
      expect(splitFeaturedArtists('Ceschi feat. CESCHI')).toEqual([
        { name: 'Ceschi', role: 'primary' },
      ]);
    });

    it('dedupes repeated featured names, case-insensitively', () => {
      expect(splitFeaturedArtists('Ceschi feat. Sage Francis ft. sage francis')).toEqual([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sage Francis', role: 'featured' },
      ]);
    });

    it('does not split a trailing token with no name after it', () => {
      expect(splitFeaturedArtists('Ceschi feat. ')).toEqual([
        { name: 'Ceschi feat.', role: 'primary' },
      ]);
    });

    it('drops an empty featured segment when a token is followed only by a bracket', () => {
      expect(splitFeaturedArtists('Ceschi (feat. )')).toEqual([
        { name: 'Ceschi', role: 'primary' },
      ]);
    });

    it('returns an empty array for an empty string', () => {
      expect(splitFeaturedArtists('')).toEqual([]);
    });

    it('returns an empty array for a whitespace-only string', () => {
      expect(splitFeaturedArtists('   ')).toEqual([]);
    });
  });
  ```

  Note the two trailing-token cases: `'Ceschi feat. '` trims to `'Ceschi feat.'` before
  splitting, so the separator (which requires whitespace AFTER the token) never matches —
  the whole string stays one primary. `'Ceschi (feat. )'` DOES match (the space before
  `)` satisfies the trailing whitespace), leaving an empty cleaned segment that must be
  dropped.

- [ ] **Step 2: Run expecting FAIL** —

  ```bash
  pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts
  ```

  Expected failure: `Failed to load ./artist-name-split` (module does not exist).

- [ ] **Step 3: Implement the util.** Create `src/lib/utils/artist-name-split.ts`
      (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  /** One artist name parsed out of a free-text video artist string. */
  export interface SplitArtistName {
    name: string;
    role: 'primary' | 'featured';
  }

  /**
   * Matches a featuring separator as its own word: `feat.`, `ft.`, or `featuring`
   * (case-insensitive), optionally preceded by an opening `(`/`[`, always followed
   * by whitespace. The leading `\b` blocks mid-word hits ("Featurecast",
   * "The Featherlights", "Loftft."). Ambiguous separators (`&`, `x`, `,`, `+`)
   * are deliberately never split on — precision over recall.
   */
  const FEAT_SEPARATOR = /\s*[([]?\s*\b(?:feat\.|ft\.|featuring\b)\s+/gi;

  /** Strip a trailing `)`/`]` left behind when the token was bracket-wrapped, then trim. */
  const cleanSegment = (segment: string): string => segment.replace(/[)\]]+\s*$/, '').trim();

  /**
   * Split a free-text artist string into one primary name plus featured names.
   * Splits ONLY on word-boundary feat./ft./featuring tokens; dedupes names
   * case-insensitively (first occurrence wins); a string that *starts* with a
   * feat token (empty primary) is returned whole as a single primary; blank
   * input yields an empty array.
   */
  export const splitFeaturedArtists = (artist: string): SplitArtistName[] => {
    const raw = artist.trim();
    if (raw === '') return [];

    const [primary, ...featured] = raw.split(FEAT_SEPARATOR).map(cleanSegment);
    if (!primary) return [{ name: raw, role: 'primary' }];

    const seen = new Set<string>([primary.toLowerCase()]);
    const result: SplitArtistName[] = [{ name: primary, role: 'primary' }];

    for (const name of featured) {
      const key = name.toLowerCase();
      if (name !== '' && !seen.has(key)) {
        seen.add(key);
        result.push({ name, role: 'featured' });
      }
    }

    return result;
  };
  ```

- [ ] **Step 4: Run expecting PASS** —

  ```bash
  pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts
  ```

- [ ] **Step 5: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/utils/artist-name-split.ts src/lib/utils/artist-name-split.spec.ts
  git commit -m "feat(utils): ✨ split featured artists util"
  ```

---

### Task 3: ffprobe spawn wrapper + probe normalization/redaction

**Files:**

- Create `src/lib/video-probe/ffprobe.ts`
- Create (test) `src/lib/video-probe/ffprobe.spec.ts`
- Create `src/lib/video-probe/normalize.ts`
- Create (test) `src/lib/video-probe/normalize.spec.ts`

**Interfaces:**

- Consumes: nothing from other tasks. Spawn discipline is modeled on the existing
  `src/lib/audio-metadata/ffmpeg.ts` (arg-vector spawn, no shell, bounded stderr tail,
  resolve-only promise) and its spec's EventEmitter process mocks.
- Produces:
  - `probeUrl(url: string): Promise<ProbeUrlResult>` and
    `type ProbeUrlResult = { ok: true; raw: unknown } | { ok: false; error: string }`
    in `@/lib/video-probe/ffprobe` (plus `PROBE_TIMEOUT_MS = 30_000`).
  - `normalizeProbe(raw: unknown): NormalizedProbe`,
    `redactProbeJson(raw: unknown, s3Key: string): unknown`, and
    `interface NormalizedProbe` (14 nullable fields: `container, width, height,
videoCodec, audioCodec, bitrateKbps, frameRate, audioChannels, audioSampleRateHz,
colorSpace, colorPrimaries, colorTransfer, sourceCreatedAt (Date|null), encoder`)
    in `@/lib/video-probe/normalize` — consumed by `VideoProbeService.probeAndPersist`
    and by Part B's `videoProbeFixture` typing.

- [ ] **Step 1: Write the failing ffprobe spec.** Create
      `src/lib/video-probe/ffprobe.spec.ts` (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { EventEmitter } from 'node:events';

  import { PROBE_TIMEOUT_MS, probeUrl } from './ffprobe';

  const mockSpawn = vi.fn();

  vi.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn(...args),
  }));

  const killMock = vi.fn();

  /** Minimal spawn stand-in: EventEmitter core + stdout/stderr emitters + kill spy. */
  class MockProc extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill = (signal?: string): boolean => {
      killMock(signal);
      return true;
    };
  }

  const presignedUrl =
    'https://bucket.s3.amazonaws.com/media/videos/v1/clip.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';

  /** Queue a fresh mock process for the next spawn call and return it. */
  const nextProc = (): MockProc => {
    const proc = new MockProc();
    mockSpawn.mockReturnValueOnce(proc);
    return proc;
  };

  describe('probeUrl', () => {
    it('spawns ffprobe with the exact arg vector and no shell', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stdout.emit('data', '{}');
      proc.emit('close', 0);
      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', presignedUrl],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    });

    it('resolves ok with the parsed JSON on exit 0', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stdout.emit('data', '{"format":{"duration":');
      proc.stdout.emit('data', '"10.5"}}');
      proc.emit('close', 0);

      await expect(promise).resolves.toEqual({
        ok: true,
        raw: { format: { duration: '10.5' } },
      });
    });

    it('resolves an error on a non-zero exit with empty stderr', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.emit('close', 1);

      await expect(promise).resolves.toEqual({ ok: false, error: 'ffprobe exited with code 1' });
    });

    it('includes the stderr tail in the exit error', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stderr.emit('data', 'Server returned 403 Forbidden');
      proc.emit('close', 1);

      await expect(promise).resolves.toEqual({
        ok: false,
        error: 'ffprobe exited with code 1: Server returned 403 Forbidden',
      });
    });

    it('scrubs the presigned URL from stderr echoes', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stderr.emit('data', `${presignedUrl}: Input/output error`);
      proc.emit('close', 1);
      const result = await promise;

      expect(JSON.stringify(result)).not.toContain('X-Amz-');
    });

    it('keeps only the 8KB stderr tail', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stderr.emit('data', 'a'.repeat(16_384));
      proc.emit('close', 1);
      const result = await promise;

      expect(JSON.stringify(result).length).toBeLessThan(8_400);
    });

    it('resolves an error when stdout is not valid JSON', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stdout.emit('data', 'not-json');
      proc.emit('close', 0);

      await expect(promise).resolves.toEqual({
        ok: false,
        error: 'ffprobe produced unparseable JSON output',
      });
    });

    it('resolves an error when spawn itself fails', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.emit('error', new Error('spawn ffprobe ENOENT'));

      await expect(promise).resolves.toEqual({
        ok: false,
        error: 'Failed to spawn ffprobe: spawn ffprobe ENOENT',
      });
    });

    it('caps stdout at 2MB and resolves an error', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stdout.emit('data', 'x'.repeat(2 * 1024 * 1024 + 1));

      await expect(promise).resolves.toEqual({
        ok: false,
        error: 'ffprobe output exceeded the 2MB limit',
      });
    });

    it('SIGKILLs the process when stdout exceeds the cap', async () => {
      const proc = nextProc();

      const promise = probeUrl(presignedUrl);
      proc.stdout.emit('data', 'x'.repeat(2 * 1024 * 1024 + 1));
      await promise;

      expect(killMock).toHaveBeenCalledWith('SIGKILL');
    });

    it('resolves a timeout error after 30 seconds', async () => {
      vi.useFakeTimers();
      try {
        nextProc();
        const promise = probeUrl(presignedUrl);
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);

        await expect(promise).resolves.toEqual({
          ok: false,
          error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms`,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('SIGKILLs the process on timeout', async () => {
      vi.useFakeTimers();
      try {
        nextProc();
        const promise = probeUrl(presignedUrl);
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
        await promise;

        expect(killMock).toHaveBeenCalledWith('SIGKILL');
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores a late close after the timeout already settled', async () => {
      vi.useFakeTimers();
      try {
        const proc = nextProc();
        const promise = probeUrl(presignedUrl);
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
        proc.stdout.emit('data', '{}');
        proc.emit('close', 0);

        await expect(promise).resolves.toEqual({
          ok: false,
          error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms`,
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
  ```

- [ ] **Step 2: Run expecting FAIL** —

  ```bash
  pnpm exec vitest run src/lib/video-probe/ffprobe.spec.ts
  ```

  Expected failure: `Failed to load ./ffprobe` (module does not exist).

- [ ] **Step 3: Implement `probeUrl`.** Create `src/lib/video-probe/ffprobe.ts`
      (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { spawn } from 'node:child_process';

  /** Outcome of probing a media URL: parsed raw ffprobe JSON, or a safe error. */
  export type ProbeUrlResult = { ok: true; raw: unknown } | { ok: false; error: string };

  /** Hard kill for a hung probe — header reads finish in seconds even on 5 GB files. */
  export const PROBE_TIMEOUT_MS = 30_000;

  /** ffprobe -show_format/-show_streams JSON is ~100 KB at worst; 2 MB is runaway output. */
  const MAX_STDOUT_BYTES = 2 * 1024 * 1024;

  /** Keep only the stderr tail so error messages stay bounded. */
  const MAX_STDERR_BYTES = 8_192;

  /**
   * Remove credential material from text that may echo the probed URL: drop
   * exact occurrences of the URL, then any residual X-Amz-* query fragments.
   */
  const scrubUrl = (text: string, url: string): string =>
    text
      .split(url)
      .join('[media-url]')
      .replace(/X-Amz-[^\s"'&]*/g, '[redacted]');

  /**
   * Probe a presigned media URL with the system ffprobe binary and return the
   * parsed `-show_format -show_streams` JSON.
   *
   * Spawn discipline mirrors `src/lib/audio-metadata/ffmpeg.ts`: arg-vector
   * spawn (no shell, no injection surface), bounded stderr tail, resolve-only
   * promise. On top of that: a 30 s SIGKILL timeout, a 2 MB stdout cap, and —
   * because the URL is a credentialed presigned S3 GET — the URL is never
   * logged and is scrubbed from every error message.
   *
   * Never throws and never rejects; every failure resolves `{ ok: false, error }`.
   */
  export const probeUrl = (url: string): Promise<ProbeUrlResult> =>
    new Promise((resolve) => {
      const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', url];
      const proc = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let settled = false;
      let stdout = '';
      let stderrTail = '';
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: ProbeUrlResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      timer = setTimeout(() => {
        proc.kill('SIGKILL');
        settle({ ok: false, error: `ffprobe timed out after ${PROBE_TIMEOUT_MS}ms` });
      }, PROBE_TIMEOUT_MS);

      proc.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (stdout.length > MAX_STDOUT_BYTES) {
          proc.kill('SIGKILL');
          settle({ ok: false, error: 'ffprobe output exceeded the 2MB limit' });
        }
      });

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stderrTail = (stderrTail + text).slice(-MAX_STDERR_BYTES);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          const tail = scrubUrl(stderrTail, url).trim();
          settle({
            ok: false,
            error: `ffprobe exited with code ${code}${tail ? `: ${tail}` : ''}`,
          });
          return;
        }
        try {
          settle({ ok: true, raw: JSON.parse(stdout) as unknown });
        } catch {
          settle({ ok: false, error: 'ffprobe produced unparseable JSON output' });
        }
      });

      proc.on('error', (err) => {
        settle({ ok: false, error: `Failed to spawn ffprobe: ${scrubUrl(err.message, url)}` });
      });
    });
  ```

- [ ] **Step 4: Run expecting PASS** —

  ```bash
  pnpm exec vitest run src/lib/video-probe/ffprobe.spec.ts
  ```

- [ ] **Step 5: Write the failing normalize spec.** Create
      `src/lib/video-probe/normalize.spec.ts` (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { normalizeProbe, redactProbeJson, type NormalizedProbe } from './normalize';

  const s3Key = 'media/videos/507f1f77bcf86cd799439011/clip.mp4';

  const presignedUrl = `https://bucket.s3.amazonaws.com/${s3Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef`;

  /** Representative ffprobe -show_format -show_streams output. */
  const rawProbe = {
    format: {
      filename: presignedUrl,
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      bit_rate: '5000000',
      tags: {
        creation_time: '2024-01-15T10:30:00.000000Z',
        encoder: 'Lavf60.3.100',
      },
    },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 1920,
        height: 1080,
        avg_frame_rate: '30000/1001',
        color_space: 'bt709',
        color_primaries: 'bt709',
        color_transfer: 'bt709',
        side_data_list: [{ side_data_type: 'Display Matrix' }],
      },
      {
        codec_type: 'audio',
        codec_name: 'aac',
        channels: 2,
        sample_rate: '48000',
      },
    ],
  };

  const NULL_PROBE: NormalizedProbe = {
    container: null,
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    bitrateKbps: null,
    frameRate: null,
    audioChannels: null,
    audioSampleRateHz: null,
    colorSpace: null,
    colorPrimaries: null,
    colorTransfer: null,
    sourceCreatedAt: null,
    encoder: null,
  };

  describe('normalizeProbe', () => {
    it('extracts the container from format_name', () => {
      expect(normalizeProbe(rawProbe).container).toBe('mov,mp4,m4a,3gp,3g2,mj2');
    });

    it('extracts width from the first video stream', () => {
      expect(normalizeProbe(rawProbe).width).toBe(1920);
    });

    it('extracts height from the first video stream', () => {
      expect(normalizeProbe(rawProbe).height).toBe(1080);
    });

    it('extracts the video codec', () => {
      expect(normalizeProbe(rawProbe).videoCodec).toBe('h264');
    });

    it('extracts the audio codec from the first audio stream', () => {
      expect(normalizeProbe(rawProbe).audioCodec).toBe('aac');
    });

    it('rounds bit_rate (bits/s string) to whole kbps', () => {
      expect(normalizeProbe(rawProbe).bitrateKbps).toBe(5000);
    });

    it('evaluates the avg_frame_rate fraction to 2dp', () => {
      expect(normalizeProbe(rawProbe).frameRate).toBe(29.97);
    });

    it('extracts the audio channel count', () => {
      expect(normalizeProbe(rawProbe).audioChannels).toBe(2);
    });

    it('parses the sample_rate string to Hz', () => {
      expect(normalizeProbe(rawProbe).audioSampleRateHz).toBe(48000);
    });

    it('extracts colorSpace', () => {
      expect(normalizeProbe(rawProbe).colorSpace).toBe('bt709');
    });

    it('extracts colorPrimaries', () => {
      expect(normalizeProbe(rawProbe).colorPrimaries).toBe('bt709');
    });

    it('extracts colorTransfer', () => {
      expect(normalizeProbe(rawProbe).colorTransfer).toBe('bt709');
    });

    it('parses the creation_time tag to a Date', () => {
      expect(normalizeProbe(rawProbe).sourceCreatedAt).toEqual(
        new Date('2024-01-15T10:30:00.000Z')
      );
    });

    it('extracts the encoder tag', () => {
      expect(normalizeProbe(rawProbe).encoder).toBe('Lavf60.3.100');
    });

    it('falls back to the quicktime creationdate tag', () => {
      const raw = {
        format: { tags: { 'com.apple.quicktime.creationdate': '2023-06-01T00:00:00Z' } },
      };

      expect(normalizeProbe(raw).sourceCreatedAt).toEqual(new Date('2023-06-01T00:00:00Z'));
    });

    it('falls back to the video-stream encoder tag', () => {
      const raw = {
        streams: [{ codec_type: 'video', tags: { encoder: 'x264 core 164' } }],
      };

      expect(normalizeProbe(raw).encoder).toBe('x264 core 164');
    });

    it('uses the FIRST video stream when several exist', () => {
      const raw = {
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920 },
          { codec_type: 'video', codec_name: 'mjpeg', width: 320 },
        ],
      };

      expect(normalizeProbe(raw).videoCodec).toBe('h264');
    });

    it('returns all nulls for a null payload', () => {
      expect(normalizeProbe(null)).toEqual(NULL_PROBE);
    });

    it('returns all nulls for a non-object payload', () => {
      expect(normalizeProbe('junk')).toEqual(NULL_PROBE);
    });

    it('returns all nulls for an empty object', () => {
      expect(normalizeProbe({})).toEqual(NULL_PROBE);
    });

    it('returns a null frameRate for a 0/0 fraction', () => {
      const raw = { streams: [{ codec_type: 'video', avg_frame_rate: '0/0' }] };

      expect(normalizeProbe(raw).frameRate).toBeNull();
    });

    it('returns a null bitrate for a non-numeric bit_rate', () => {
      const raw = { format: { bit_rate: 'N/A' } };

      expect(normalizeProbe(raw).bitrateKbps).toBeNull();
    });

    it('returns a null sourceCreatedAt for an unparseable creation_time', () => {
      const raw = { format: { tags: { creation_time: 'not-a-date' } } };

      expect(normalizeProbe(raw).sourceCreatedAt).toBeNull();
    });
  });

  describe('redactProbeJson', () => {
    it('replaces format.filename with the bare s3Key', () => {
      const redacted = redactProbeJson(rawProbe, s3Key) as { format: { filename: string } };

      expect(redacted.format.filename).toBe(s3Key);
    });

    it('leaves no X-Amz- substring anywhere in the redacted payload', () => {
      expect(JSON.stringify(redactProbeJson(rawProbe, s3Key))).not.toContain('X-Amz-');
    });

    it('does not mutate the input', () => {
      redactProbeJson(rawProbe, s3Key);

      expect(rawProbe.format.filename).toBe(presignedUrl);
    });

    it('keeps a small payload (with side_data_list) intact below the cap', () => {
      const redacted = redactProbeJson(rawProbe, s3Key) as {
        streams: Array<Record<string, unknown>>;
      };

      expect(redacted.streams[0]).toHaveProperty('side_data_list');
    });

    it('passes through a non-object payload unchanged', () => {
      expect(redactProbeJson('scalar', s3Key)).toBe('scalar');
    });

    it('drops side_data_list when the payload exceeds 256KB', () => {
      const raw = {
        format: { filename: presignedUrl },
        streams: [{ codec_type: 'video', side_data_list: [{ data: 'x'.repeat(300 * 1024) }] }],
      };

      const redacted = redactProbeJson(raw, s3Key) as {
        streams: Array<Record<string, unknown>>;
      };

      expect(redacted.streams[0]).not.toHaveProperty('side_data_list');
    });

    it('keeps the stream itself after dropping its side_data_list', () => {
      const raw = {
        format: { filename: presignedUrl },
        streams: [{ codec_type: 'video', side_data_list: [{ data: 'x'.repeat(300 * 1024) }] }],
      };

      const redacted = redactProbeJson(raw, s3Key) as {
        streams: Array<Record<string, unknown>>;
      };

      expect(redacted.streams[0]?.codec_type).toBe('video');
    });

    it('falls back to a truncation marker when still over the cap', () => {
      const raw = { format: { filename: presignedUrl, tags: { comment: 'x'.repeat(300 * 1024) } } };

      expect(redactProbeJson(raw, s3Key)).toEqual({ __truncated: true });
    });
  });
  ```

- [ ] **Step 6: Run expecting FAIL** —

  ```bash
  pnpm exec vitest run src/lib/video-probe/normalize.spec.ts
  ```

  Expected failure: `Failed to load ./normalize` (module does not exist).

- [ ] **Step 7: Implement normalize/redact.** Create `src/lib/video-probe/normalize.ts`
      (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  /** Normalized, display-ready subset of an ffprobe report (all fields nullable). */
  export interface NormalizedProbe {
    container: string | null;
    width: number | null;
    height: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    bitrateKbps: number | null;
    frameRate: number | null;
    audioChannels: number | null;
    audioSampleRateHz: number | null;
    colorSpace: string | null;
    colorPrimaries: string | null;
    colorTransfer: string | null;
    sourceCreatedAt: Date | null;
    encoder: string | null;
  }

  /** Raw probe JSON is capped at 256 KB serialized before it may be persisted. */
  const MAX_PROBE_JSON_BYTES = 256 * 1024;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  const asString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

  const asInt = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) ? value : null;

  /** Parse a positive numeric value or numeric string ("5000000"), else null. */
  const parseNumeric = (value: unknown): number | null => {
    const parsed =
      typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  /** Evaluate an ffprobe fraction: "30000/1001" → 29.97 (2dp); "0/0" and junk → null. */
  const parseFrameRate = (value: unknown): number | null => {
    if (typeof value !== 'string') return null;
    const [numerator, denominator] = value.split('/').map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    const rate = numerator / denominator;
    return rate > 0 ? Math.round(rate * 100) / 100 : null;
  };

  /** bit_rate arrives in bits/s (usually a string) → whole kbps. */
  const parseBitrateKbps = (value: unknown): number | null => {
    const bits = parseNumeric(value);
    return bits === null ? null : Math.round(bits / 1000);
  };

  /** sample_rate arrives as a string ("48000") → whole Hz. */
  const parseSampleRateHz = (value: unknown): number | null => {
    const rate = parseNumeric(value);
    return rate === null ? null : Math.round(rate);
  };

  /** Parse an ISO-ish tag value ("2024-01-15T10:30:00.000000Z") to a Date, else null. */
  const parseDateTag = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value === '') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  /** First stream of the given codec_type, or null. */
  const findStream = (
    root: Record<string, unknown>,
    codecType: string
  ): Record<string, unknown> | null => {
    const { streams } = root;
    if (!Array.isArray(streams)) return null;
    const match = streams.find(
      (stream: unknown) => isRecord(stream) && stream.codec_type === codecType
    );
    return isRecord(match) ? match : null;
  };

  /** The tags object of a format/stream node, or an empty object. */
  const tagsOf = (node: Record<string, unknown> | null): Record<string, unknown> =>
    node !== null && isRecord(node.tags) ? node.tags : {};

  /**
   * Normalize raw ffprobe JSON (`-show_format -show_streams`) into the display
   * fields persisted on `Video`. Fully defensive: any shape surprise degrades
   * the affected field to null instead of throwing.
   */
  export const normalizeProbe = (raw: unknown): NormalizedProbe => {
    const root = isRecord(raw) ? raw : {};
    const format = isRecord(root.format) ? root.format : null;
    const video = findStream(root, 'video');
    const audio = findStream(root, 'audio');
    const formatTags = tagsOf(format);

    return {
      container: asString(format?.format_name),
      width: asInt(video?.width),
      height: asInt(video?.height),
      videoCodec: asString(video?.codec_name),
      audioCodec: asString(audio?.codec_name),
      bitrateKbps: parseBitrateKbps(format?.bit_rate),
      frameRate: parseFrameRate(video?.avg_frame_rate),
      audioChannels: asInt(audio?.channels),
      audioSampleRateHz: parseSampleRateHz(audio?.sample_rate),
      colorSpace: asString(video?.color_space),
      colorPrimaries: asString(video?.color_primaries),
      colorTransfer: asString(video?.color_transfer),
      sourceCreatedAt: parseDateTag(
        formatTags.creation_time ?? formatTags['com.apple.quicktime.creationdate']
      ),
      encoder: asString(formatTags.encoder) ?? asString(tagsOf(video).encoder),
    };
  };

  /** Serialized UTF-8 size of a JSON value. */
  const byteLength = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

  /** Remove every streams[i].side_data_list in place (the usual size offender). */
  const dropSideDataLists = (root: Record<string, unknown>): void => {
    const { streams } = root;
    if (!Array.isArray(streams)) return;
    for (const stream of streams) {
      if (isRecord(stream)) delete stream.side_data_list;
    }
  };

  /**
   * Prepare raw ffprobe JSON for persistence: deep-clone it, replace
   * `format.filename` (which echoes the credentialed presigned probe URL — no
   * `X-Amz-` material may survive) with the bare s3Key, and cap the serialized
   * size at 256 KB — first by dropping `streams[i].side_data_list`, then by
   * degrading to `{ __truncated: true }`.
   */
  export const redactProbeJson = (raw: unknown, s3Key: string): unknown => {
    let clone: unknown;
    try {
      clone = JSON.parse(JSON.stringify(raw)) as unknown;
    } catch {
      return { __truncated: true };
    }
    if (!isRecord(clone)) return clone;

    if (isRecord(clone.format) && 'filename' in clone.format) {
      clone.format.filename = s3Key;
    }

    if (byteLength(clone) <= MAX_PROBE_JSON_BYTES) return clone;
    dropSideDataLists(clone);
    if (byteLength(clone) <= MAX_PROBE_JSON_BYTES) return clone;
    return { __truncated: true };
  };
  ```

- [ ] **Step 8: Run expecting PASS** —

  ```bash
  pnpm exec vitest run src/lib/video-probe/normalize.spec.ts
  ```

- [ ] **Step 9: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/video-probe/ffprobe.ts src/lib/video-probe/ffprobe.spec.ts src/lib/video-probe/normalize.ts src/lib/video-probe/normalize.spec.ts
  git commit -m "feat(videos): ✨ ffprobe probe pipeline"
  ```

---

### Task 4: probe presign util + `VideoRepository.saveProbeResult`

**Files:**

- Modify `src/lib/utils/s3-client.ts` — add `generatePresignedProbeUrl`.
- Modify (test) `src/lib/utils/s3-client.spec.ts`.
- Modify `src/lib/types/domain/video.ts` — add `SaveProbeResultData`.
- Modify `src/lib/repositories/video-repository.ts` — add `saveProbeResult`.
- Modify (test) `src/lib/repositories/video-repository.spec.ts`.

**Interfaces:**

- Consumes: domain `Video` probe columns (Prisma + domain type from the schema task).
- Produces:
  - `generatePresignedProbeUrl(s3Key: string): Promise<string>` in
    `@/lib/utils/s3-client` — consumed by `VideoProbeService.probeAndPersist`.
  - `VideoRepository.saveProbeResult(videoId: string, probedS3Key: string, data: SaveProbeResultData): Promise<boolean>`
    in `@/lib/repositories/video-repository` — consumed by `VideoProbeService`.
  - `interface SaveProbeResultData` in `@/lib/types/domain/video` (re-exported through
    the domain barrel): `{ probedAt: Date; probeError?: string | null; probeData?: unknown }`
    plus every `NormalizedProbe` field as optional (`container?, width?, height?,
videoCodec?, audioCodec?, bitrateKbps?, frameRate?, audioChannels?,
audioSampleRateHz?, colorSpace?, colorPrimaries?, colorTransfer?,
sourceCreatedAt?, encoder?` — each `T | null`).
  - Part B owns the enrichment-state repository methods (`setEnrichmentStatus` etc.) —
    do NOT add them here.

- [ ] **Step 1: Write the failing presign spec.** In `src/lib/utils/s3-client.spec.ts`,
      add `generatePresignedProbeUrl` to the `./s3-client` import list, then append inside
      the top-level `describe('s3-client', …)` block:

  ```ts
  describe('generatePresignedProbeUrl', () => {
    it('presigns a plain GetObjectCommand for the key (no response overrides)', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://signed.example.com/probe');

      await generatePresignedProbeUrl('media/videos/v1/clip.mp4');

      expect(getCommandCalls.at(-1)).toEqual({
        Bucket: 'test-bucket',
        Key: 'media/videos/v1/clip.mp4',
      });
    });

    it('expires in 120 seconds', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://signed.example.com/probe');

      await generatePresignedProbeUrl('media/videos/v1/clip.mp4');

      expect(vi.mocked(getSignedUrl).mock.calls.at(-1)?.[2]).toEqual({ expiresIn: 120 });
    });

    it('returns the signed URL', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://signed.example.com/probe');

      const url = await generatePresignedProbeUrl('media/videos/v1/clip.mp4');

      expect(url).toBe('https://signed.example.com/probe');
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/utils/s3-client.spec.ts
  ```

  Expected failure: the import of `generatePresignedProbeUrl` is undefined /
  `generatePresignedProbeUrl is not a function`.

- [ ] **Step 2: Implement the presign util.** In `src/lib/utils/s3-client.ts`, add after
      `generatePresignedDownloadUrl`:

  ```ts
  /** Presigned probe GET URLs live just long enough for one ffprobe header read. */
  const PROBE_URL_EXPIRATION_SECONDS = 120;

  /**
   * Generate a short-lived presigned GET URL for the server-side ffprobe pass.
   *
   * Server-only and security-sensitive: the URL embeds credentials (X-Amz-*
   * query parameters) — NEVER log it and NEVER return it to a client. A plain
   * GetObjectCommand (no ResponseContentDisposition/Type overrides) so ffprobe
   * can range-read the container headers directly from S3.
   *
   * @param s3Key - S3 object key of the uploaded video
   * @returns Presigned URL valid for 120 seconds
   */
  export const generatePresignedProbeUrl = async (s3Key: string): Promise<string> => {
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    return getSignedUrl(s3Client, getCommand, { expiresIn: PROBE_URL_EXPIRATION_SECONDS });
  };
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run src/lib/utils/s3-client.spec.ts
  ```

- [ ] **Step 3: Write the failing repository spec.** In
      `src/lib/repositories/video-repository.spec.ts`:

  (a) add `updateMany: vi.fn(),` to the `prisma.video` mock object (after `count: vi.fn(),`);

  (b) change the type import line to include the new interface:

  ```ts
  import type { CreateVideoData, SaveProbeResultData } from '@/lib/types/domain/video';
  ```

  (c) append inside `describe('VideoRepository', …)`:

  ```ts
  describe('saveProbeResult', () => {
    const probeData = { format: { filename: 'videos/test.mp4' } };

    const saveData: SaveProbeResultData = {
      probedAt: new Date('2026-07-11T00:00:00.000Z'),
      probeError: null,
      probeData,
      width: 1920,
      height: 1080,
    };

    it('returns true when the s3Key-conditional update writes a row', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      const result = await VideoRepository.saveProbeResult(
        'video-123',
        'videos/test.mp4',
        saveData
      );

      expect(result).toBe(true);
    });

    it('returns false when the file was replaced during the probe (zero rows)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await VideoRepository.saveProbeResult(
        'video-123',
        'videos/stale.mp4',
        saveData
      );

      expect(result).toBe(false);
    });

    it('conditions the update on BOTH id and the probed s3Key (race guard)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData);

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ id: 'video-123', s3Key: 'videos/test.mp4' });
    });

    it('writes the scalar fields and the probe JSON', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData);

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: null,
        width: 1920,
        height: 1080,
        probeData,
      });
    });

    it('omits probeData when not supplied (failure-only persist)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', {
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: 'ffprobe exited with code 1',
      });

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: 'ffprobe exited with code 1',
      });
    });

    it('writes a null probeData as a DB null', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', {
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeData: null,
      });

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeData: null,
      });
    });

    it('wraps a connection failure as a DataError', async () => {
      vi.mocked(prisma.video.updateMany).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(
        VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData)
      ).rejects.toBeInstanceOf(DataError);
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/repositories/video-repository.spec.ts
  ```

  Expected failure: TS/type error on the `SaveProbeResultData` import (does not exist
  yet) and `VideoRepository.saveProbeResult is not a function`.

- [ ] **Step 4: Define `SaveProbeResultData`.** In `src/lib/types/domain/video.ts`, add
      after the `UpdateVideoData` type:

  ```ts
  /**
   * Repository payload for persisting one ffprobe pass onto a `Video` row.
   * `probedAt` is always stamped; the optional scalar fields mirror
   * `NormalizedProbe` (`@/lib/video-probe/normalize`); `probeData` carries the
   * redacted raw ffprobe JSON (already JSON-safe). A failed probe persists only
   * `probedAt` + `probeError`.
   */
  export interface SaveProbeResultData {
    probedAt: Date;
    probeError?: string | null;
    probeData?: unknown;
    container?: string | null;
    width?: number | null;
    height?: number | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    bitrateKbps?: number | null;
    frameRate?: number | null;
    audioChannels?: number | null;
    audioSampleRateHz?: number | null;
    colorSpace?: string | null;
    colorPrimaries?: string | null;
    colorTransfer?: string | null;
    sourceCreatedAt?: Date | null;
    encoder?: string | null;
  }
  ```

- [ ] **Step 5: Implement `saveProbeResult`.** In
      `src/lib/repositories/video-repository.ts`:

  (a) extend the domain type import:

  ```ts
  import type {
    CreateVideoData,
    SaveProbeResultData,
    UpdateVideoData,
    Video,
    VideoCountFilters,
    VideoListFilters,
  } from '@/lib/types/domain/video';
  ```

  (b) add below `toPrismaUpdate`:

  ```ts
  /**
   * The redacted probe JSON arrives as `unknown` (a JSON.parse product, so it is
   * JSON-safe by construction); narrow it for Prisma's Json column input.
   */
  const toPrismaJson = (value: unknown): Prisma.InputJsonValue | null =>
    value === null || value === undefined ? null : (value as Prisma.InputJsonValue);
  ```

  (c) add this method to the `VideoRepository` class (after `update`):

  ```ts
    /**
     * Persist one ffprobe pass, guarded against the replaced-file race: the
     * update matches on BOTH the id and the s3Key that was actually probed, so
     * a stale probe of a file replaced mid-flight writes zero rows. Returns
     * whether a row was written.
     */
    static async saveProbeResult(
      videoId: string,
      probedS3Key: string,
      data: SaveProbeResultData
    ): Promise<boolean> {
      const { probeData, ...scalars } = data;
      const result = await runQuery(() =>
        prisma.video.updateMany({
          where: { id: videoId, s3Key: probedS3Key },
          data: {
            ...scalars,
            ...(probeData !== undefined ? { probeData: toPrismaJson(probeData) } : {}),
          },
        })
      );
      return result.count > 0;
    }
  ```

- [ ] **Step 6: Run expecting PASS** —

  ```bash
  pnpm exec vitest run src/lib/repositories/video-repository.spec.ts src/lib/utils/s3-client.spec.ts
  ```

- [ ] **Step 7: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/utils/s3-client.ts src/lib/utils/s3-client.spec.ts src/lib/types/domain/video.ts src/lib/repositories/video-repository.ts src/lib/repositories/video-repository.spec.ts
  git commit -m "feat(videos): ✨ probe presign + save"
  ```

---

### Task 5: `VideoProbeService.probeAndPersist`

> **Ordering gate:** requires Part B's `src/lib/services/video-enrichment-fixture.ts`
> to exist (exports `videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown }`).
> Typecheck fails without it. Do not create that file here — Part B owns it.

**Files:**

- Create `src/lib/services/video-probe-service.ts`
- Create (test) `src/lib/services/video-probe-service.spec.ts`

**Interfaces:**

- Consumes:
  - `VideoRepository.findById(id: string): Promise<Video | null>` and
    `VideoRepository.saveProbeResult(videoId: string, probedS3Key: string, data: SaveProbeResultData): Promise<boolean>`
    from `@/lib/repositories/video-repository`.
  - `generatePresignedProbeUrl(s3Key: string): Promise<string>` from `@/lib/utils/s3-client`.
  - `probeUrl(url: string): Promise<ProbeUrlResult>` from `@/lib/video-probe/ffprobe`.
  - `normalizeProbe(raw: unknown): NormalizedProbe` and
    `redactProbeJson(raw: unknown, s3Key: string): unknown` from `@/lib/video-probe/normalize`.
  - `videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown }` from
    `@/lib/services/video-enrichment-fixture` (Part B).
- Produces: `VideoProbeService.probeAndPersist(videoId: string): Promise<void>` in
  `@/lib/services/video-probe-service` — consumed by `kickPostSaveEnrichment` and by
  Part B/C (manual Re-run action).

- [ ] **Step 1: Write the failing service spec.** Create
      `src/lib/services/video-probe-service.spec.ts` (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { loggers } from '@/lib/utils/logger';
  import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
  import { probeUrl } from '@/lib/video-probe/ffprobe';
  import { normalizeProbe, redactProbeJson } from '@/lib/video-probe/normalize';

  import { VideoProbeService } from './video-probe-service';

  vi.mock('server-only', () => ({}));

  vi.mock('@/lib/repositories/video-repository', () => ({
    VideoRepository: { findById: vi.fn(), saveProbeResult: vi.fn() },
  }));

  const fixtureNormalized = {
    container: 'mov,mp4',
    width: 1280,
    height: 720,
    videoCodec: 'h264',
    audioCodec: 'aac',
    bitrateKbps: 2500,
    frameRate: 30,
    audioChannels: 2,
    audioSampleRateHz: 44100,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    sourceCreatedAt: null,
    encoder: 'fixture',
  };

  vi.mock('@/lib/services/video-enrichment-fixture', () => ({
    videoProbeFixture: {
      normalized: {
        container: 'mov,mp4',
        width: 1280,
        height: 720,
        videoCodec: 'h264',
        audioCodec: 'aac',
        bitrateKbps: 2500,
        frameRate: 30,
        audioChannels: 2,
        audioSampleRateHz: 44100,
        colorSpace: 'bt709',
        colorPrimaries: 'bt709',
        colorTransfer: 'bt709',
        sourceCreatedAt: null,
        encoder: 'fixture',
      },
      probeData: { format: { filename: 'fixture.mp4' } },
    },
  }));

  vi.mock('@/lib/utils/s3-client', () => ({ generatePresignedProbeUrl: vi.fn() }));

  vi.mock('@/lib/utils/logger', () => ({
    loggers: {
      media: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
  }));

  vi.mock('@/lib/video-probe/ffprobe', () => ({ probeUrl: vi.fn() }));

  vi.mock('@/lib/video-probe/normalize', () => ({
    normalizeProbe: vi.fn(),
    redactProbeJson: vi.fn(),
  }));

  const videoId = '507f1f77bcf86cd799439011';
  const s3Key = `media/videos/${videoId}/clip.mp4`;
  const presignedUrl = `https://bucket.s3.amazonaws.com/${s3Key}?X-Amz-Signature=deadbeef`;
  const rawProbe = { format: { filename: presignedUrl } };
  const normalized = { ...fixtureNormalized, encoder: 'Lavf60.3.100' };
  const redacted = { format: { filename: s3Key } };

  beforeEach(() => {
    vi.mocked(VideoRepository.findById).mockResolvedValue({ id: videoId, s3Key } as never);
    vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(true);
    vi.mocked(generatePresignedProbeUrl).mockResolvedValue(presignedUrl);
    vi.mocked(probeUrl).mockResolvedValue({ ok: true, raw: rawProbe });
    vi.mocked(normalizeProbe).mockReturnValue(normalized);
    vi.mocked(redactProbeJson).mockReturnValue(redacted);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('VideoProbeService.probeAndPersist', () => {
    it('skips (and persists nothing) when the video does not exist', async () => {
      vi.mocked(VideoRepository.findById).mockResolvedValue(null);

      await VideoProbeService.probeAndPersist(videoId);

      expect(VideoRepository.saveProbeResult).not.toHaveBeenCalled();
    });

    it('presigns the stored s3Key', async () => {
      await VideoProbeService.probeAndPersist(videoId);

      expect(generatePresignedProbeUrl).toHaveBeenCalledWith(s3Key);
    });

    it('probes the presigned URL', async () => {
      await VideoProbeService.probeAndPersist(videoId);

      expect(probeUrl).toHaveBeenCalledWith(presignedUrl);
    });

    it('redacts the raw JSON against the probed s3Key', async () => {
      await VideoProbeService.probeAndPersist(videoId);

      expect(redactProbeJson).toHaveBeenCalledWith(rawProbe, s3Key);
    });

    it('persists the normalized fields plus the redacted JSON on success', async () => {
      await VideoProbeService.probeAndPersist(videoId);

      expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(
        videoId,
        s3Key,
        expect.objectContaining({
          probedAt: expect.any(Date),
          probeError: null,
          probeData: redacted,
          ...normalized,
        })
      );
    });

    it('persists probedAt + probeError only when the probe fails', async () => {
      vi.mocked(probeUrl).mockResolvedValue({ ok: false, error: 'ffprobe exited with code 1' });

      await VideoProbeService.probeAndPersist(videoId);

      expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(videoId, s3Key, {
        probedAt: expect.any(Date),
        probeError: 'ffprobe exited with code 1',
      });
    });

    it('does not normalize when the probe fails', async () => {
      vi.mocked(probeUrl).mockResolvedValue({ ok: false, error: 'boom' });

      await VideoProbeService.probeAndPersist(videoId);

      expect(normalizeProbe).not.toHaveBeenCalled();
    });

    it('warns instead of throwing when the write loses the replaced-file race', async () => {
      vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(false);

      await VideoProbeService.probeAndPersist(videoId);

      expect(loggers.media.warn).toHaveBeenCalledWith(
        'Video probe result discarded: file replaced during probe',
        { videoId }
      );
    });

    it('never throws when presigning fails, and persists the failure', async () => {
      vi.mocked(generatePresignedProbeUrl).mockRejectedValue(
        new Error('AWS credentials not configured')
      );

      await VideoProbeService.probeAndPersist(videoId);

      expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(videoId, s3Key, {
        probedAt: expect.any(Date),
        probeError: 'AWS credentials not configured',
      });
    });

    it('never throws when the lookup itself fails', async () => {
      vi.mocked(VideoRepository.findById).mockRejectedValue(new Error('db down'));

      await expect(VideoProbeService.probeAndPersist(videoId)).resolves.toBeUndefined();
    });

    it('never throws when even the failure persist fails', async () => {
      vi.mocked(generatePresignedProbeUrl).mockRejectedValue(new Error('presign down'));
      vi.mocked(VideoRepository.saveProbeResult).mockRejectedValue(new Error('db down'));

      await expect(VideoProbeService.probeAndPersist(videoId)).resolves.toBeUndefined();
    });

    it('never logs the presigned URL', async () => {
      vi.mocked(VideoRepository.saveProbeResult).mockResolvedValue(false);

      await VideoProbeService.probeAndPersist(videoId);

      expect(JSON.stringify(vi.mocked(loggers.media.warn).mock.calls)).not.toContain('X-Amz-');
    });

    it('persists the fixture without spawning ffprobe in fake mode', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

      await VideoProbeService.probeAndPersist(videoId);

      expect(probeUrl).not.toHaveBeenCalled();
    });

    it('does not presign in fake mode', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

      await VideoProbeService.probeAndPersist(videoId);

      expect(generatePresignedProbeUrl).not.toHaveBeenCalled();
    });

    it('persists the fixture data in fake mode', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

      await VideoProbeService.probeAndPersist(videoId);

      expect(VideoRepository.saveProbeResult).toHaveBeenCalledWith(
        videoId,
        s3Key,
        expect.objectContaining({
          probedAt: expect.any(Date),
          probeError: null,
          probeData: { format: { filename: 'fixture.mp4' } },
          ...fixtureNormalized,
        })
      );
    });
  });
  ```

- [ ] **Step 2: Run expecting FAIL** —

  ```bash
  pnpm exec vitest run src/lib/services/video-probe-service.spec.ts
  ```

  Expected failure: `Failed to load ./video-probe-service` (module does not exist).

- [ ] **Step 3: Implement the service.** Create `src/lib/services/video-probe-service.ts`
      (complete file):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { videoProbeFixture } from '@/lib/services/video-enrichment-fixture';
  import type { SaveProbeResultData } from '@/lib/types/domain/video';
  import { loggers } from '@/lib/utils/logger';
  import { generatePresignedProbeUrl } from '@/lib/utils/s3-client';
  import { probeUrl } from '@/lib/video-probe/ffprobe';
  import {
    normalizeProbe,
    redactProbeJson,
    type NormalizedProbe,
  } from '@/lib/video-probe/normalize';

  const logger = loggers.media;

  /** Safe, always-string rendering of an unknown error (URLs never pass through here). */
  const toMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /** Assemble the success payload: stamped time + normalized scalars + raw JSON. */
  const buildSuccessData = (
    normalized: NormalizedProbe,
    probeData: unknown
  ): SaveProbeResultData => ({
    probedAt: new Date(),
    probeError: null,
    probeData,
    ...normalized,
  });

  /** Best-effort failure persist — a probe must never take the save flow down. */
  const persistFailure = async (videoId: string, s3Key: string, message: string): Promise<void> => {
    try {
      await VideoRepository.saveProbeResult(videoId, s3Key, {
        probedAt: new Date(),
        probeError: message,
      });
    } catch (error) {
      logger.warn('Failed to persist video probe error', { videoId, error: toMessage(error) });
    }
  };

  /**
   * Presign → probe → normalize/redact → persist for one video. In fake mode
   * (`BIO_GENERATOR_FAKE=true` — E2E and local dev without real media/ffprobe)
   * the deterministic fixture is persisted instead of spawning ffprobe.
   */
  const runProbe = async (videoId: string, s3Key: string): Promise<void> => {
    if (process.env.BIO_GENERATOR_FAKE === 'true') {
      await VideoRepository.saveProbeResult(
        videoId,
        s3Key,
        buildSuccessData(videoProbeFixture.normalized, videoProbeFixture.probeData)
      );
      return;
    }

    const url = await generatePresignedProbeUrl(s3Key);
    const result = await probeUrl(url);

    if (!result.ok) {
      await persistFailure(videoId, s3Key, result.error);
      return;
    }

    const persisted = await VideoRepository.saveProbeResult(
      videoId,
      s3Key,
      buildSuccessData(normalizeProbe(result.raw), redactProbeJson(result.raw, s3Key))
    );
    if (!persisted) {
      logger.warn('Video probe result discarded: file replaced during probe', { videoId });
    }
  };

  /**
   * ffprobe pipeline for uploaded videos. Kicked after create / file replacement
   * (never awaited by the admin's save) and by the manual admin Re-run.
   *
   * Guarantees: never throws — failures persist `probedAt` + `probeError` so the
   * admin technical-metadata card can surface them; the s3Key-conditional write
   * in the repository discards stale results for replaced files; the presigned
   * URL is never logged and never leaves the server.
   */
  export class VideoProbeService {
    static async probeAndPersist(videoId: string): Promise<void> {
      let s3Key: string | null = null;
      try {
        const video = await VideoRepository.findById(videoId);
        if (!video) {
          logger.warn('Video probe skipped: video not found', { videoId });
          return;
        }
        s3Key = video.s3Key;
        await runProbe(videoId, video.s3Key);
      } catch (error) {
        logger.warn('Video probe failed', { videoId, error: toMessage(error) });
        if (s3Key !== null) {
          await persistFailure(videoId, s3Key, toMessage(error));
        }
      }
    }
  }
  ```

- [ ] **Step 4: Run expecting PASS** —

  ```bash
  pnpm exec vitest run src/lib/services/video-probe-service.spec.ts
  ```

- [ ] **Step 5: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/services/video-probe-service.ts src/lib/services/video-probe-service.spec.ts
  git commit -m "feat(videos): ✨ video probe service"
  ```

---

### Task 6: `kickPostSaveEnrichment` + create/update action wiring

> **Ordering gate:** requires Part B's `src/lib/services/video-enrichment-service.ts`
> (class `VideoEnrichmentService` with static
> `syncVideoArtists(videoId: string, artistString: string): Promise<void>` and
> `runEnrichmentJob(videoId: string): Promise<void>`). Consume only — do not create it.

**Files:**

- Modify `src/lib/actions/video-action-helpers.ts` — add `kickPostSaveEnrichment`.
- Modify (test) `src/lib/actions/video-action-helpers.spec.ts`.
- Modify `src/lib/actions/create-video-action.ts` — `after()` kick post-success.
- Modify (test) `src/lib/actions/create-video-action.spec.ts`.
- Modify `src/lib/actions/update-video-action.ts` — conditional `after()` kick.
- Modify (test) `src/lib/actions/update-video-action.spec.ts`.

**Interfaces:**

- Consumes: `VideoEnrichmentService.syncVideoArtists` / `runEnrichmentJob`
  (`@/lib/services/video-enrichment-service`, Part B);
  `VideoProbeService.probeAndPersist(videoId: string): Promise<void>`
  (`@/lib/services/video-probe-service`); `after` from `next/server` (pattern proven in
  `src/lib/actions/generate-artist-bio-action.ts`); `VideoCategory` from
  `@/lib/types/domain/video`.
- Produces:
  `kickPostSaveEnrichment({ videoId, artist, category, reProbe }: KickPostSaveEnrichmentInput): Promise<void>`
  and `interface KickPostSaveEnrichmentInput { videoId: string; artist: string;
category: VideoCategory; reProbe: boolean }` in `@/lib/actions/video-action-helpers` —
  also consumed by Part B/C for any manual re-run surface.
- Update-path semantics (deviation note 3 in the header): the kick is scheduled only when
  `artistChanged || s3KeyReplaced`; `reProbe = s3KeyReplaced`; the kick's own
  `category === 'MUSIC'` gate then yields exactly
  `MUSIC && (artistChanged || s3KeyReplaced) → runEnrichmentJob`. A file-only
  replacement re-runs the (idempotent) artist sync as a side effect of the fixed
  signature.

- [ ] **Step 1: Write the failing helper spec additions.** In
      `src/lib/actions/video-action-helpers.spec.ts`:

  (a) add to the imports (after the existing `s3-key-utils` import):

  ```ts
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  ```

  and add `kickPostSaveEnrichment` to the `./video-action-helpers` import list.

  (b) add the module mocks (after `vi.mock('@/lib/utils/s3-key-utils');`):

  ```ts
  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
  }));
  vi.mock('@/lib/services/video-probe-service', () => ({
    VideoProbeService: { probeAndPersist: vi.fn() },
  }));
  ```

  (c) append at the end of the file:

  ```ts
  describe('kickPostSaveEnrichment', () => {
    const kickInput = {
      videoId,
      artist: 'Ceschi feat. Sage Francis',
      category: 'MUSIC' as const,
      reProbe: true,
    };

    beforeEach(() => {
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
      vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
      vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
    });

    it('syncs video artists from the artist string', async () => {
      await kickPostSaveEnrichment(kickInput);

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
        videoId,
        'Ceschi feat. Sage Francis'
      );
    });

    it('probes when reProbe is true', async () => {
      await kickPostSaveEnrichment(kickInput);

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });

    it('skips the probe when reProbe is false', async () => {
      await kickPostSaveEnrichment({ ...kickInput, reProbe: false });

      expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
    });

    it('dispatches the enrichment job for a MUSIC video', async () => {
      await kickPostSaveEnrichment(kickInput);

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
    });

    it('does not dispatch the enrichment job for an INFORMATIONAL video', async () => {
      await kickPostSaveEnrichment({ ...kickInput, category: 'INFORMATIONAL' });

      expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    });

    it('runs the sync before the probe and the probe before the job', async () => {
      await kickPostSaveEnrichment(kickInput);

      const syncOrder = vi.mocked(VideoEnrichmentService.syncVideoArtists).mock
        .invocationCallOrder[0];
      const probeOrder = vi.mocked(VideoProbeService.probeAndPersist).mock.invocationCallOrder[0];
      const jobOrder = vi.mocked(VideoEnrichmentService.runEnrichmentJob).mock
        .invocationCallOrder[0];
      expect([syncOrder < probeOrder, probeOrder < jobOrder]).toEqual([true, true]);
    });

    it('still probes when the artist sync fails', async () => {
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('sync down'));

      await kickPostSaveEnrichment(kickInput);

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });

    it('still dispatches the job when the probe fails', async () => {
      vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('probe down'));

      await kickPostSaveEnrichment(kickInput);

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
    });

    it('never throws even when every stage fails', async () => {
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('a'));
      vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(Error('b'));
      vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockRejectedValue(Error('c'));

      await expect(kickPostSaveEnrichment(kickInput)).resolves.toBeUndefined();
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/actions/video-action-helpers.spec.ts
  ```

  Expected failure: `kickPostSaveEnrichment` is not exported by
  `./video-action-helpers`.

- [ ] **Step 2: Implement the helper.** In `src/lib/actions/video-action-helpers.ts`:

  (a) add the imports (`VideoCategory` joins the existing domain type import):

  ```ts
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  import type {
    CreateVideoData,
    UpdateVideoData,
    Video,
    VideoCategory,
  } from '@/lib/types/domain/video';
  import { loggers } from '@/lib/utils/logger';
  ```

  (b) add at the end of the file:

  ```ts
  const logger = loggers.media;

  /** Safe, always-string rendering of an unknown error. */
  const toMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /** Input for the post-save enrichment kick (runs inside `after()`). */
  export interface KickPostSaveEnrichmentInput {
    videoId: string;
    /** The admin-entered display artist string — the source of the artist sync. */
    artist: string;
    category: VideoCategory;
    /** Probe (or re-probe) the file — true on create and on file replacement. */
    reProbe: boolean;
  }

  /**
   * Post-save enrichment kick: sync `VideoArtist` links from the artist string,
   * probe the file when it is new/replaced, then dispatch the async web
   * enrichment for MUSIC videos. Each stage is independently best-effort — a
   * failure is logged and the remaining stages still run. Never throws, so the
   * admin's already-successful save can never be failed retroactively by
   * background work.
   */
  export const kickPostSaveEnrichment = async ({
    videoId,
    artist,
    category,
    reProbe,
  }: KickPostSaveEnrichmentInput): Promise<void> => {
    try {
      await VideoEnrichmentService.syncVideoArtists(videoId, artist);
    } catch (error) {
      logger.warn('Post-save video artist sync failed', { videoId, error: toMessage(error) });
    }

    if (reProbe) {
      try {
        await VideoProbeService.probeAndPersist(videoId);
      } catch (error) {
        logger.warn('Post-save video probe failed', { videoId, error: toMessage(error) });
      }
    }

    if (category === 'MUSIC') {
      try {
        await VideoEnrichmentService.runEnrichmentJob(videoId);
      } catch (error) {
        logger.warn('Post-save enrichment dispatch failed', { videoId, error: toMessage(error) });
      }
    }
  };
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run src/lib/actions/video-action-helpers.spec.ts
  ```

- [ ] **Step 3: Write the failing create-action spec additions.** In
      `src/lib/actions/create-video-action.spec.ts`:

  (a) add imports (after the `verifyS3ObjectExists` import):

  ```ts
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  ```

  (b) add after `vi.mock('@/lib/utils/s3-client');`:

  ```ts
  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
  }));
  vi.mock('@/lib/services/video-probe-service', () => ({
    VideoProbeService: { probeAndPersist: vi.fn() },
  }));

  // Capture the after() callback so tests can run the "background" kick on demand.
  let afterCallback: (() => Promise<void>) | null = null;
  vi.mock('next/server', () => ({
    after: (cb: () => Promise<void>) => {
      afterCallback = cb;
    },
  }));
  ```

  (c) extend the existing top-level `beforeEach` with:

  ```ts
  afterCallback = null;
  vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
  ```

  (d) append a new describe inside `describe('createVideoAction', …)`:

  ```ts
  describe('Post-save enrichment kick', () => {
    it('schedules the kick via after() on success', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());

      expect(afterCallback).toBeTypeOf('function');
    });

    it('does not schedule the kick when creation fails', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockResolvedValue({
        success: false,
        error: 'boom',
      } as never);

      await createVideoAction(initialFormState, buildFormData());

      expect(afterCallback).toBeNull();
    });

    it('does not schedule the kick when S3 confirmation fails', async () => {
      mockParsedSuccess();
      vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

      await createVideoAction(initialFormState, buildFormData());

      expect(afterCallback).toBeNull();
    });

    it('syncs video artists from the submitted artist string', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());
      await afterCallback?.();

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(videoId, 'The Band');
    });

    it('probes the new upload', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });

    it('dispatches web enrichment for a MUSIC video', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
    });

    it('does not dispatch web enrichment for an INFORMATIONAL video', async () => {
      mockParsedSuccess({ ...parsedData, category: 'INFORMATIONAL' });

      await createVideoAction(initialFormState, buildFormData());
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    });

    it('still probes when the artist sync fails', async () => {
      mockParsedSuccess();
      vi.mocked(VideoEnrichmentService.syncVideoArtists).mockRejectedValue(Error('sync down'));

      await createVideoAction(initialFormState, buildFormData());
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/actions/create-video-action.spec.ts
  ```

  Expected failure: `afterCallback` stays `null` (`expected null to be of type
'function'`) — the action never calls `after()` yet.

- [ ] **Step 4: Wire the create action.** In `src/lib/actions/create-video-action.ts`:

  (a) add the imports:

  ```ts
  import { after } from 'next/server';
  ```

  and extend the helpers import:

  ```ts
  import {
    buildVideoCreateInput,
    confirmVideoUpload,
    kickPostSaveEnrichment,
    VIDEO_PERMITTED_FIELD_NAMES,
  } from './video-action-helpers';
  ```

  (b) in `runVideoCreate`, replace

  ```ts
  revalidatePath('/admin/videos');
  if (response.success) {
    revalidatePath('/videos');
  }
  ```

  with

  ```ts
  revalidatePath('/admin/videos');
  if (response.success) {
    revalidatePath('/videos');
    // Post-save enrichment (artist sync → probe → MUSIC web enrichment)
    // runs after the response so the admin's save returns immediately.
    after(() =>
      kickPostSaveEnrichment({
        videoId: response.data.id,
        artist: data.artist,
        category: data.category,
        reProbe: true,
      })
    );
  }
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run src/lib/actions/create-video-action.spec.ts
  ```

- [ ] **Step 5: Write the failing update-action spec additions.** In
      `src/lib/actions/update-video-action.spec.ts`:

  (a) add imports (after the `s3-key-utils` import):

  ```ts
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  ```

  (b) add after `vi.mock('@/lib/utils/s3-key-utils');`:

  ```ts
  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
  }));
  vi.mock('@/lib/services/video-probe-service', () => ({
    VideoProbeService: { probeAndPersist: vi.fn() },
  }));

  // Capture the after() callback so tests can run the "background" kick on demand.
  let afterCallback: (() => Promise<void>) | null = null;
  vi.mock('next/server', () => ({
    after: (cb: () => Promise<void>) => {
      afterCallback = cb;
    },
  }));
  ```

  (c) extend the existing top-level `beforeEach` (it already starts with
  `vi.resetAllMocks()`) with:

  ```ts
  afterCallback = null;
  vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
  ```

  (d) append a new describe inside `describe('updateVideoAction', …)` — note
  `parsedData.artist === currentVideo.artist === 'The Band'` and
  `parsedData.s3Key === currentS3Key`, so the unmodified `parsedData` is the
  "nothing enrichment-relevant changed" case:

  ```ts
  describe('Post-update enrichment kick', () => {
    it('does not schedule a kick when nothing enrichment-relevant changed', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('schedules a kick when the artist string changed', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeTypeOf('function');
    });

    it('re-syncs artists with the new artist string', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(videoId, 'New Band');
    });

    it('does not re-probe on an artist-only change', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
    });

    it('re-probes when the video file was replaced', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });

    it('re-dispatches enrichment for a MUSIC video on file replacement', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
    });

    it('does not dispatch enrichment for an INFORMATIONAL video', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band', category: 'INFORMATIONAL' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    });

    it('does not schedule a kick when the update fails', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'nope',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });
  });
  ```

  Run expecting FAIL:

  ```bash
  pnpm exec vitest run src/lib/actions/update-video-action.spec.ts
  ```

  Expected failure: `schedules a kick when the artist string changed` fails
  (`afterCallback` stays `null`).

- [ ] **Step 6: Wire the update action.** In `src/lib/actions/update-video-action.ts`:

  (a) add the import:

  ```ts
  import { after } from 'next/server';
  ```

  and extend the helpers import:

  ```ts
  import {
    buildVideoUpdateInput,
    confirmVideoUpload,
    deleteReplacedVideoAssets,
    kickPostSaveEnrichment,
    VIDEO_PERMITTED_FIELD_NAMES,
  } from './video-action-helpers';
  ```

  (b) add this helper above `runVideoUpdate` (extracted up front to respect the
  complexity cap):

  ```ts
  /**
   * Schedule the post-update enrichment kick when the update changed something
   * enrichment cares about: an artist-string change re-syncs `VideoArtist`
   * links, a file replacement re-probes, and — via the kick's own category
   * gate — a MUSIC video with either change re-dispatches the async web
   * enrichment. The sync also runs on a file-only replacement; it is
   * idempotent. No-op when nothing relevant changed.
   */
  const scheduleUpdateEnrichment = (
    current: Video,
    data: VideoFormData,
    s3KeyReplaced: boolean
  ): void => {
    const artistChanged = data.artist !== current.artist;
    if (!artistChanged && !s3KeyReplaced) return;

    after(() =>
      kickPostSaveEnrichment({
        videoId: current.id,
        artist: data.artist,
        category: data.category,
        reProbe: s3KeyReplaced,
      })
    );
  };
  ```

  (c) in `runVideoUpdate`, replace

  ```ts
  if (response.success) {
    // Delete the replaced objects only after the DB row is confirmed updated.
    deleteReplacedVideoAssets(current, data, s3KeyReplaced);
    revalidatePath('/admin/videos');
    revalidatePath('/videos');
  }
  ```

  with

  ```ts
  if (response.success) {
    // Delete the replaced objects only after the DB row is confirmed updated.
    deleteReplacedVideoAssets(current, data, s3KeyReplaced);
    revalidatePath('/admin/videos');
    revalidatePath('/videos');
    scheduleUpdateEnrichment(current, data, s3KeyReplaced);
  }
  ```

  Run expecting PASS:

  ```bash
  pnpm exec vitest run src/lib/actions/update-video-action.spec.ts
  ```

- [ ] **Step 7: Run the full action suite** (regression guard for the untouched tests,
      which now execute with the `after`-less `next/server` mock replaced):

  ```bash
  pnpm exec vitest run src/lib/actions/create-video-action.spec.ts src/lib/actions/update-video-action.spec.ts src/lib/actions/video-action-helpers.spec.ts
  ```

  Expect: all green.

- [ ] **Step 8: Full gate, then commit** —

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/actions/video-action-helpers.ts src/lib/actions/video-action-helpers.spec.ts src/lib/actions/create-video-action.ts src/lib/actions/create-video-action.spec.ts src/lib/actions/update-video-action.ts src/lib/actions/update-video-action.spec.ts
  git commit -m "feat(videos): ✨ post-save enrichment kick"
  ```

---

## Execution summary (Part A)

| #   | Task                                                            | Commit                                        |
| --- | --------------------------------------------------------------- | --------------------------------------------- |
| 1   | Prisma schema + domain types + wire schema + strip lists        | `feat(videos): ✨ probe schema, types, wire`  |
| 2   | feat.-split artist-name util                                    | `feat(utils): ✨ split featured artists util` |
| 3   | ffprobe spawn wrapper + normalize/redact                        | `feat(videos): ✨ ffprobe probe pipeline`     |
| 4   | probe presign util + `saveProbeResult`                          | `feat(videos): ✨ probe presign + save`       |
| 5   | `VideoProbeService.probeAndPersist` (needs Part B fixture)      | `feat(videos): ✨ video probe service`        |
| 6   | `kickPostSaveEnrichment` + action wiring (needs Part B service) | `feat(videos): ✨ post-save enrichment kick`  |

# Video Metadata Enrichment — Implementation Plan, Part B (Tasks 7–15)

> **Ticket:** feat/video-metadata-enrichment · **Spec:** `docs/superpowers/specs/2026-07-11-video-metadata-enrichment-design.md`
> **Scope of this part:** repositories + enrichment-state methods; validation schemas; fixtures; `VideoEnrichmentService`; API routes + rate-limit tiers + query key; run/apply server actions; bio-generator Lambda `video-enrichment` mode.

## Overview

Part B builds the server spine of the video-enrichment pipeline by cloning the proven artist-bio async pipeline (`bio-generation-*`): Prisma repositories over the Part A models, Zod wire contracts, a service that dispatches a fire-and-forget Lambda `Event` invoke with a single-use job token, token-guarded callback/progress routes that always answer 202, admin server actions to trigger runs and apply suggestions, and a new `task: 'video-enrichment'` mode in the existing `bio-generator/` Lambda that reuses its MusicBrainz/Wikidata/Serper/Gemini clients.

**Execution rules (apply to every task):**

- Work from the worktree root: `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat+video-metadata-enrichment`. Tasks 14–15 run their gates inside `bio-generator/` (separate pnpm workspace; its `package.json` has **no** `typecheck` script — use `pnpm exec tsc --noEmit` there; unit tests via `pnpm run test:run`).
- Every NEW source file (web **and** bio-generator — bio-generator sources carry the identical header, verified) starts with the MPL header from `HEADER.txt`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  ```

  Node-environment route/action specs put `// @vitest-environment node` on line 1, header after (matches `bio-generation/callback/route.spec.ts`).

- TDD: each cycle below is write failing test → run (expect FAIL, reason given) → minimal implementation → run (expect PASS). Full gate before each commit: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` (web tasks) or `cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run` (Lambda tasks).
- `describe`/`it`/`expect`/`vi` are globals — never imported. `vi.mock('server-only', () => ({}))` in every spec whose module graph pulls `server-only`. Arrow functions, named exports, no `any`/`!`/suppressions, explicit return types, complexity ≤ 10.
- Commit subjects ≤ 50 chars including the gitmoji; never commit to `main`; no AI attribution.

**Consumed from Part A (must already be on the branch — do not redefine):**

- Prisma models/fields: `Video.enrichmentStatus/enrichmentError/enrichmentStartedAt/enrichmentJobToken/enrichmentProgress(Json)/enrichedAt`; `VideoArtist` (role `PRIMARY|FEATURED`, `sortOrder`, `@@unique([videoId, artistId])`); `VideoEnrichmentSuggestion` (`videoId`, `artistId?`, `field`, `value`, `confidence`, `sources Json`, `note?`, `status`, `appliedAt?`, `appliedBy?`, timestamps).
- `splitFeaturedArtists(artist: string): SplitArtistName[]` (`{ name, role: 'primary' | 'featured' }`) from `@/utils/artist-name-split`.
- `VideoProbeService.probeAndPersist(videoId: string): Promise<void>` from `@/lib/services/video-probe-service`.
- `NormalizedProbe` from `@/lib/video-probe/normalize`; `VideoArtistRecord` from `@/lib/types/domain/video-artist`.

**Produced here (Part C depends on these exact names):** see the per-task **Interfaces** blocks.

---

### Task 7: Repositories + enrichment-state methods

**Files:**

- Create: `src/lib/types/domain/video-enrichment.ts`
- Create: `src/lib/repositories/video-artist-repository.ts` + `video-artist-repository.spec.ts`
- Create: `src/lib/repositories/video-enrichment-suggestion-repository.ts` + `video-enrichment-suggestion-repository.spec.ts`
- Modify: `src/lib/repositories/video-repository.ts` + `video-repository.spec.ts`

**Interfaces:**

- Consumes: `prisma` (`@/lib/prisma`), `runQuery` (`./_internal/map-prisma-error`), `AssertExact` (`./_internal/drift`), `Json` (`@/lib/types/domain/shared`), `VideoCategory` (`@/lib/types/domain/video`), Part A Prisma models.
- Produces:
  - `VideoArtistRepository.replaceForVideo(videoId: string, rows: ReadonlyArray<{ artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number }>): Promise<void>` (deleteMany then createMany, one transaction)
  - `VideoArtistRepository.findByVideoId(videoId: string): Promise<VideoArtistWithArtist[]>`
  - `VideoArtistRepository.deleteByVideoId(videoId: string): Promise<void>`
  - `interface VideoArtistWithArtist { artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number; artist: { displayName: string | null; firstName: string; middleName: string | null; surname: string; akaNames: string | null; bornOn: Date | null } }`
  - `VideoEnrichmentSuggestionRepository.replacePending(videoId: string, rows: CreateSuggestionRow[]): Promise<void>`, `.findByVideoId(videoId: string): Promise<VideoEnrichmentSuggestionRecord[]>`, `.findById(id: string): Promise<VideoEnrichmentSuggestionRecord | null>`, `.markApplied(id: string, userId: string): Promise<boolean>`, `.markDismissed(id: string): Promise<boolean>`, `.findExistingFacts(videoId: string): Promise<Array<{ artistId: string | null; field: string; value: string }>>`, `.deletePendingForArtists(videoId: string, artistIds: string[]): Promise<void>`
  - `VideoRepository.setEnrichmentStatus(videoId: string, status: 'pending' | 'processing' | 'succeeded' | 'failed', opts?: { error?: string | null }): Promise<void>`, `.setEnrichmentJobToken(videoId: string, token: string | null): Promise<void>`, `.claimEnrichmentJobToken(videoId: string, token: string): Promise<boolean>`, `.setEnrichmentProgress(videoId: string, progress: unknown): Promise<void>`, `.getEnrichmentState(videoId: string): Promise<VideoEnrichmentState | null>`
  - Domain types `VideoEnrichmentSuggestionRecord`, `CreateSuggestionRow`, `VideoEnrichmentState` in `src/lib/types/domain/video-enrichment.ts`.

**Steps:**

- [ ] **7.1 Write the failing VideoArtistRepository spec.** Create `src/lib/repositories/video-artist-repository.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { prisma } from '@/lib/prisma';

  import { VideoArtistRepository } from './video-artist-repository';

  vi.mock('server-only', () => ({}));

  vi.mock('@/lib/prisma', () => {
    const videoArtist = { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() };
    return {
      prisma: {
        videoArtist,
        $transaction: vi.fn(
          async (fn: (tx: { videoArtist: typeof videoArtist }) => Promise<unknown>) =>
            fn({ videoArtist })
        ),
      },
    };
  });

  const VIDEO_ID = 'f'.repeat(24);
  const ARTIST_ID = 'a'.repeat(24);

  describe('VideoArtistRepository', () => {
    describe('replaceForVideo', () => {
      it('deletes the existing join rows then bulk-creates the new batch', async () => {
        vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 2 });
        vi.mocked(prisma.videoArtist.createMany).mockResolvedValue({ count: 2 });

        await VideoArtistRepository.replaceForVideo(VIDEO_ID, [
          { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
          { artistId: 'b'.repeat(24), role: 'FEATURED', sortOrder: 1 },
        ]);

        expect(prisma.videoArtist.deleteMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID },
        });
        expect(prisma.videoArtist.createMany).toHaveBeenCalledWith({
          data: [
            { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0, videoId: VIDEO_ID },
            { artistId: 'b'.repeat(24), role: 'FEATURED', sortOrder: 1, videoId: VIDEO_ID },
          ],
        });
      });

      it('skips createMany for an empty batch', async () => {
        vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 1 });

        await VideoArtistRepository.replaceForVideo(VIDEO_ID, []);

        expect(prisma.videoArtist.createMany).not.toHaveBeenCalled();
      });
    });

    describe('findByVideoId', () => {
      it('selects the identity projection ordered by sortOrder', async () => {
        const row = {
          artistId: ARTIST_ID,
          role: 'PRIMARY',
          sortOrder: 0,
          artist: {
            displayName: 'Ceschi',
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: null,
            bornOn: null,
          },
        };
        vi.mocked(prisma.videoArtist.findMany).mockResolvedValue([row] as never);

        const result = await VideoArtistRepository.findByVideoId(VIDEO_ID);

        expect(result).toEqual([row]);
        expect(prisma.videoArtist.findMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID },
          orderBy: { sortOrder: 'asc' },
          select: {
            artistId: true,
            role: true,
            sortOrder: true,
            artist: {
              select: {
                displayName: true,
                firstName: true,
                middleName: true,
                surname: true,
                akaNames: true,
                bornOn: true,
              },
            },
          },
        });
      });
    });

    describe('deleteByVideoId', () => {
      it('deletes every join row for the video', async () => {
        vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 3 });

        await VideoArtistRepository.deleteByVideoId(VIDEO_ID);

        expect(prisma.videoArtist.deleteMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID },
        });
      });
    });
  });
  ```

- [ ] **7.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-artist-repository.spec.ts
  ```

  Expected failure: `Failed to resolve import "./video-artist-repository"` (module does not exist yet).

- [ ] **7.3 Implement the domain types + VideoArtistRepository.** Create `src/lib/types/domain/video-enrichment.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import type { Json } from '@/lib/types/domain/shared';
  import type { VideoCategory } from '@/lib/types/domain/video';

  /**
   * Hand-written, Prisma-free mirror of the `VideoEnrichmentSuggestion` model.
   * Drift-checked against its Prisma payload in
   * `video-enrichment-suggestion-repository.ts`.
   */
  export interface VideoEnrichmentSuggestionRecord {
    id: string;
    videoId: string;
    /** Null for the video-level `releasedOn` suggestion. */
    artistId: string | null;
    field: string;
    value: string;
    confidence: string;
    /** `Array<{ url, label? }>` as persisted JSON; parsed defensively on read. */
    sources: Json;
    note: string | null;
    status: string;
    appliedAt: Date | null;
    appliedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  /** One suggestion row to insert as `pending` (id/status/timestamps are DB-owned). */
  export interface CreateSuggestionRow {
    artistId: string | null;
    field: string;
    value: string;
    confidence: string;
    sources: Json;
    note: string | null;
  }

  /**
   * Projection for the enrichment job lifecycle plus the video context the
   * dispatch payload and status endpoint need.
   */
  export interface VideoEnrichmentState {
    id: string;
    enrichmentStatus: string | null;
    enrichmentError: string | null;
    enrichmentStartedAt: Date | null;
    enrichmentJobToken: string | null;
    enrichmentProgress: Json | null;
    enrichedAt: Date | null;
    category: VideoCategory;
    artist: string;
    title: string;
    releasedOn: Date;
    s3Key: string;
  }
  ```

  Create `src/lib/repositories/video-artist-repository.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import { prisma } from '@/lib/prisma';

  import { runQuery } from './_internal/map-prisma-error';

  /** Artist identity projection joined onto each VideoArtist row for enrichment. */
  export interface VideoArtistWithArtist {
    artistId: string;
    role: 'PRIMARY' | 'FEATURED';
    sortOrder: number;
    artist: {
      displayName: string | null;
      firstName: string;
      middleName: string | null;
      surname: string;
      akaNames: string | null;
      bornOn: Date | null;
    };
  }

  /** The artist columns enrichment compares suggestions against. */
  const artistIdentitySelect = {
    displayName: true,
    firstName: true,
    middleName: true,
    surname: true,
    akaNames: true,
    bornOn: true,
  } as const;

  /**
   * Data-access layer for the `VideoArtist` join model. The only layer that
   * touches Prisma for video-artist links; every call is wrapped in `runQuery`
   * so callers see vendor-neutral `DataError`s.
   */
  export class VideoArtistRepository {
    /**
     * Replace a video's artist links in one transaction: delete the existing
     * rows, then bulk-create the new batch (single `createMany` — never
     * concurrent `create`s, which race Prisma's read-back on fresh collections).
     */
    static async replaceForVideo(
      videoId: string,
      rows: ReadonlyArray<{ artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number }>
    ): Promise<void> {
      await runQuery(() =>
        prisma.$transaction(async (tx) => {
          await tx.videoArtist.deleteMany({ where: { videoId } });
          if (rows.length > 0) {
            await tx.videoArtist.createMany({
              data: rows.map((row) => ({ ...row, videoId })),
            });
          }
        })
      );
    }

    /** List a video's artist links (sortOrder asc) with the identity projection. */
    static async findByVideoId(videoId: string): Promise<VideoArtistWithArtist[]> {
      return runQuery(() =>
        prisma.videoArtist.findMany({
          where: { videoId },
          orderBy: { sortOrder: 'asc' },
          select: {
            artistId: true,
            role: true,
            sortOrder: true,
            artist: { select: artistIdentitySelect },
          },
        })
      );
    }

    /** Delete every artist link for a video (video hard-delete cleanup). */
    static async deleteByVideoId(videoId: string): Promise<void> {
      await runQuery(() => prisma.videoArtist.deleteMany({ where: { videoId } }));
    }
  }
  ```

- [ ] **7.4 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-artist-repository.spec.ts
  ```

- [ ] **7.5 Write the failing VideoEnrichmentSuggestionRepository spec.** Create `src/lib/repositories/video-enrichment-suggestion-repository.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { prisma } from '@/lib/prisma';
  import type { CreateSuggestionRow } from '@/lib/types/domain/video-enrichment';

  import { VideoEnrichmentSuggestionRepository } from './video-enrichment-suggestion-repository';

  vi.mock('server-only', () => ({}));

  vi.mock('@/lib/prisma', () => {
    const videoEnrichmentSuggestion = {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    };
    return {
      prisma: {
        videoEnrichmentSuggestion,
        $transaction: vi.fn(
          async (
            fn: (tx: {
              videoEnrichmentSuggestion: typeof videoEnrichmentSuggestion;
            }) => Promise<unknown>
          ) => fn({ videoEnrichmentSuggestion })
        ),
      },
    };
  });

  const VIDEO_ID = 'f'.repeat(24);
  const ARTIST_ID = 'a'.repeat(24);
  const SUGGESTION_ID = 'c'.repeat(24);

  const row: CreateSuggestionRow = {
    artistId: ARTIST_ID,
    field: 'bornOn',
    value: '1985-03-15',
    confidence: 'high',
    sources: [{ url: 'https://musicbrainz.org/artist/x' }],
    note: null,
  };

  describe('VideoEnrichmentSuggestionRepository', () => {
    describe('replacePending', () => {
      it('deletes only the pending rows then bulk-creates the batch as pending', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 1 });
        vi.mocked(prisma.videoEnrichmentSuggestion.createMany).mockResolvedValue({ count: 1 });

        await VideoEnrichmentSuggestionRepository.replacePending(VIDEO_ID, [row]);

        expect(prisma.videoEnrichmentSuggestion.deleteMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID, status: 'pending' },
        });
        expect(prisma.videoEnrichmentSuggestion.createMany).toHaveBeenCalledWith({
          data: [{ ...row, videoId: VIDEO_ID, status: 'pending' }],
        });
      });

      it('skips createMany for an empty batch', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 0 });

        await VideoEnrichmentSuggestionRepository.replacePending(VIDEO_ID, []);

        expect(prisma.videoEnrichmentSuggestion.createMany).not.toHaveBeenCalled();
      });
    });

    describe('findByVideoId', () => {
      it('lists the video rows ordered by createdAt asc', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.findMany).mockResolvedValue([] as never);

        await VideoEnrichmentSuggestionRepository.findByVideoId(VIDEO_ID);

        expect(prisma.videoEnrichmentSuggestion.findMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID },
          orderBy: { createdAt: 'asc' },
        });
      });
    });

    describe('findById', () => {
      it('returns the row when found', async () => {
        const stored = { id: SUGGESTION_ID, status: 'pending' };
        vi.mocked(prisma.videoEnrichmentSuggestion.findUnique).mockResolvedValue(stored as never);

        const result = await VideoEnrichmentSuggestionRepository.findById(SUGGESTION_ID);

        expect(result).toEqual(stored);
      });

      it('returns null when missing', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.findUnique).mockResolvedValue(null);

        const result = await VideoEnrichmentSuggestionRepository.findById(SUGGESTION_ID);

        expect(result).toBeNull();
      });
    });

    describe('markApplied', () => {
      it('conditionally flips a pending row to applied with the audit fields', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 1 });

        const result = await VideoEnrichmentSuggestionRepository.markApplied(
          SUGGESTION_ID,
          'user-1'
        );

        expect(result).toBe(true);
        expect(prisma.videoEnrichmentSuggestion.updateMany).toHaveBeenCalledWith({
          where: { id: SUGGESTION_ID, status: 'pending' },
          data: { status: 'applied', appliedAt: expect.any(Date), appliedBy: 'user-1' },
        });
      });

      it('returns false when the row was already resolved', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 0 });

        const result = await VideoEnrichmentSuggestionRepository.markApplied(
          SUGGESTION_ID,
          'user-1'
        );

        expect(result).toBe(false);
      });
    });

    describe('markDismissed', () => {
      it('conditionally flips a pending row to dismissed', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 1 });

        const result = await VideoEnrichmentSuggestionRepository.markDismissed(SUGGESTION_ID);

        expect(result).toBe(true);
        expect(prisma.videoEnrichmentSuggestion.updateMany).toHaveBeenCalledWith({
          where: { id: SUGGESTION_ID, status: 'pending' },
          data: { status: 'dismissed' },
        });
      });

      it('returns false when the row was already resolved', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.updateMany).mockResolvedValue({ count: 0 });

        const result = await VideoEnrichmentSuggestionRepository.markDismissed(SUGGESTION_ID);

        expect(result).toBe(false);
      });
    });

    describe('findExistingFacts', () => {
      it('projects applied and dismissed facts only', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.findMany).mockResolvedValue([] as never);

        await VideoEnrichmentSuggestionRepository.findExistingFacts(VIDEO_ID);

        expect(prisma.videoEnrichmentSuggestion.findMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID, status: { in: ['applied', 'dismissed'] } },
          select: { artistId: true, field: true, value: true },
        });
      });
    });

    describe('deletePendingForArtists', () => {
      it('deletes pending rows scoped to the detached artist ids', async () => {
        vi.mocked(prisma.videoEnrichmentSuggestion.deleteMany).mockResolvedValue({ count: 1 });

        await VideoEnrichmentSuggestionRepository.deletePendingForArtists(VIDEO_ID, [ARTIST_ID]);

        expect(prisma.videoEnrichmentSuggestion.deleteMany).toHaveBeenCalledWith({
          where: { videoId: VIDEO_ID, status: 'pending', artistId: { in: [ARTIST_ID] } },
        });
      });

      it('is a no-op for an empty artist list', async () => {
        await VideoEnrichmentSuggestionRepository.deletePendingForArtists(VIDEO_ID, []);

        expect(prisma.videoEnrichmentSuggestion.deleteMany).not.toHaveBeenCalled();
      });
    });
  });
  ```

- [ ] **7.6 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-enrichment-suggestion-repository.spec.ts
  ```

  Expected failure: `Failed to resolve import "./video-enrichment-suggestion-repository"`.

- [ ] **7.7 Implement VideoEnrichmentSuggestionRepository.** Create `src/lib/repositories/video-enrichment-suggestion-repository.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import { prisma } from '@/lib/prisma';
  import type {
    CreateSuggestionRow,
    VideoEnrichmentSuggestionRecord,
  } from '@/lib/types/domain/video-enrichment';

  import { runQuery } from './_internal/map-prisma-error';

  import type { AssertExact } from './_internal/drift';
  import type { Prisma } from '@prisma/client';

  // Compile-time drift guard: fails `pnpm run typecheck` if the hand-written
  // domain record diverges from the Prisma scalar payload (same idiom as
  // `video-repository.ts`). If this errors, align the mirror in
  // `@/lib/types/domain/video-enrichment` with `prisma/schema.prisma`.
  type _SuggestionDrift = AssertExact<
    VideoEnrichmentSuggestionRecord,
    Prisma.VideoEnrichmentSuggestionGetPayload<Record<string, never>>
  >;
  const _suggestionDrift: _SuggestionDrift = true;

  /**
   * Data-access layer for the `VideoEnrichmentSuggestion` model. Re-runs replace
   * only PENDING rows — applied/dismissed rows survive as an audit trail and
   * fence re-discovered facts (see `findExistingFacts`).
   */
  export class VideoEnrichmentSuggestionRepository {
    /** Replace the video's pending rows with a fresh batch in one transaction. */
    static async replacePending(videoId: string, rows: CreateSuggestionRow[]): Promise<void> {
      await runQuery(() =>
        prisma.$transaction(async (tx) => {
          await tx.videoEnrichmentSuggestion.deleteMany({
            where: { videoId, status: 'pending' },
          });
          if (rows.length > 0) {
            await tx.videoEnrichmentSuggestion.createMany({
              data: rows.map((row) => ({ ...row, videoId, status: 'pending' })),
            });
          }
        })
      );
    }

    /** All suggestion rows for a video, oldest first. */
    static async findByVideoId(videoId: string): Promise<VideoEnrichmentSuggestionRecord[]> {
      return runQuery(() =>
        prisma.videoEnrichmentSuggestion.findMany({
          where: { videoId },
          orderBy: { createdAt: 'asc' },
        })
      );
    }

    /** One suggestion row by id, or null. */
    static async findById(id: string): Promise<VideoEnrichmentSuggestionRecord | null> {
      return runQuery(() => prisma.videoEnrichmentSuggestion.findUnique({ where: { id } }));
    }

    /**
     * Atomically flip a PENDING row to applied, stamping the audit fields.
     * Returns true iff THIS caller won (updateMany count > 0) — a concurrent
     * apply/dismiss of the same row loses.
     */
    static async markApplied(id: string, userId: string): Promise<boolean> {
      const result = await runQuery(() =>
        prisma.videoEnrichmentSuggestion.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'applied', appliedAt: new Date(), appliedBy: userId },
        })
      );
      return result.count > 0;
    }

    /** Atomically flip a PENDING row to dismissed. True iff this caller won. */
    static async markDismissed(id: string): Promise<boolean> {
      const result = await runQuery(() =>
        prisma.videoEnrichmentSuggestion.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'dismissed' },
        })
      );
      return result.count > 0;
    }

    /** Applied/dismissed facts that fence re-discovered suggestions on re-run. */
    static async findExistingFacts(
      videoId: string
    ): Promise<Array<{ artistId: string | null; field: string; value: string }>> {
      return runQuery(() =>
        prisma.videoEnrichmentSuggestion.findMany({
          where: { videoId, status: { in: ['applied', 'dismissed'] } },
          select: { artistId: true, field: true, value: true },
        })
      );
    }

    /** Drop pending rows for artists detached by an artist-string re-sync. */
    static async deletePendingForArtists(videoId: string, artistIds: string[]): Promise<void> {
      if (artistIds.length === 0) return;
      await runQuery(() =>
        prisma.videoEnrichmentSuggestion.deleteMany({
          where: { videoId, status: 'pending', artistId: { in: artistIds } },
        })
      );
    }
  }
  ```

- [ ] **7.8 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-enrichment-suggestion-repository.spec.ts
  ```

- [ ] **7.9 Write the failing VideoRepository enrichment-state tests.** In `src/lib/repositories/video-repository.spec.ts`, first extend the prisma mock factory — replace:

  ```ts
  vi.mock('@/lib/prisma', () => ({
    prisma: {
      video: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    },
  }));
  ```

  with:

  ```ts
  vi.mock('@/lib/prisma', () => ({
    prisma: {
      video: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    },
  }));
  ```

  Then append inside the top-level `describe('VideoRepository', ...)` block (after the `delete` describe):

  ```ts
  describe('setEnrichmentStatus', () => {
    it('stamps enrichmentStartedAt when flipping to processing', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'processing');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'processing', enrichmentStartedAt: expect.any(Date) },
      });
    });

    it('clears progress and error when flipping to pending', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'pending');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'pending', enrichmentProgress: null, enrichmentError: null },
      });
    });

    it('stamps enrichedAt when flipping to succeeded', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'succeeded', { error: null });

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: {
          enrichmentStatus: 'succeeded',
          enrichmentError: null,
          enrichedAt: expect.any(Date),
        },
      });
    });

    it('writes the provided error when flipping to failed', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'failed', { error: 'boom' });

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'failed', enrichmentError: 'boom' },
      });
    });
  });

  describe('setEnrichmentJobToken', () => {
    it('stores the per-job token', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentJobToken('video-123', 'token-1');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentJobToken: 'token-1' },
      });
    });

    it('clears the token with null', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentJobToken('video-123', null);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentJobToken: null },
      });
    });
  });

  describe('claimEnrichmentJobToken', () => {
    it('claims atomically iff the token matches a processing job', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 });

      const result = await VideoRepository.claimEnrichmentJobToken('video-123', 'token-1');

      expect(result).toBe(true);
      expect(prisma.video.updateMany).toHaveBeenCalledWith({
        where: { id: 'video-123', enrichmentJobToken: 'token-1', enrichmentStatus: 'processing' },
        data: { enrichmentJobToken: null },
      });
    });

    it('returns false when another caller already claimed', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 0 });

      const result = await VideoRepository.claimEnrichmentJobToken('video-123', 'token-1');

      expect(result).toBe(false);
    });
  });

  describe('setEnrichmentProgress', () => {
    it('persists the checkpoint payload', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);
      const checkpoint = { stage: 'musicbrainz', at: '2026-07-12T00:00:00.000Z' };

      await VideoRepository.setEnrichmentProgress('video-123', checkpoint);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentProgress: checkpoint },
      });
    });
  });

  describe('getEnrichmentState', () => {
    it('selects the enrichment lifecycle projection', async () => {
      vi.mocked(prisma.video.findUnique).mockResolvedValue(null);

      await VideoRepository.getEnrichmentState('video-123');

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        select: {
          id: true,
          enrichmentStatus: true,
          enrichmentError: true,
          enrichmentStartedAt: true,
          enrichmentJobToken: true,
          enrichmentProgress: true,
          enrichedAt: true,
          category: true,
          artist: true,
          title: true,
          releasedOn: true,
          s3Key: true,
        },
      });
    });
  });
  ```

- [ ] **7.10 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-repository.spec.ts
  ```

  Expected failure: `TypeError: VideoRepository.setEnrichmentStatus is not a function` (and siblings).

- [ ] **7.11 Implement the VideoRepository additions.** In `src/lib/repositories/video-repository.ts`, extend the domain-type imports:

  ```ts
  import type {
    CreateVideoData,
    UpdateVideoData,
    Video,
    VideoCountFilters,
    VideoListFilters,
  } from '@/lib/types/domain/video';
  import type { VideoEnrichmentState } from '@/lib/types/domain/video-enrichment';
  ```

  and append these methods inside `class VideoRepository` (after `delete`):

  ```ts
    /**
     * Update the async enrichment lifecycle fields. `error` is only written when
     * explicitly provided. Flipping to `pending` clears the previous run's
     * progress AND error (a fresh trigger must never surface stale state);
     * `processing` stamps `enrichmentStartedAt` for stale-job detection;
     * `succeeded` stamps `enrichedAt`.
     */
    static async setEnrichmentStatus(
      videoId: string,
      status: 'pending' | 'processing' | 'succeeded' | 'failed',
      opts: { error?: string | null } = {}
    ): Promise<void> {
      await runQuery(() =>
        prisma.video.update({
          where: { id: videoId },
          data: {
            enrichmentStatus: status,
            ...(opts.error !== undefined ? { enrichmentError: opts.error } : {}),
            ...(status === 'pending' ? { enrichmentProgress: null, enrichmentError: null } : {}),
            ...(status === 'processing' ? { enrichmentStartedAt: new Date() } : {}),
            ...(status === 'succeeded' ? { enrichedAt: new Date() } : {}),
          },
        })
      );
    }

    /** Set (or clear, with null) the per-job async-callback token. */
    static async setEnrichmentJobToken(videoId: string, token: string | null): Promise<void> {
      await runQuery(() =>
        prisma.video.update({ where: { id: videoId }, data: { enrichmentJobToken: token } })
      );
    }

    /**
     * Atomically claim the enrichment job iff the stored token matches AND the
     * job is still processing, clearing the single-use token so only ONE
     * concurrent callback wins (mirrors `ArtistRepository.claimBioJobToken`).
     */
    static async claimEnrichmentJobToken(videoId: string, token: string): Promise<boolean> {
      const result = await runQuery(() =>
        prisma.video.updateMany({
          where: { id: videoId, enrichmentJobToken: token, enrichmentStatus: 'processing' },
          data: { enrichmentJobToken: null },
        })
      );
      return result.count === 1;
    }

    /** Persist the latest enrichment progress checkpoint (validated upstream). */
    static async setEnrichmentProgress(videoId: string, progress: unknown): Promise<void> {
      await runQuery(() =>
        prisma.video.update({
          where: { id: videoId },
          data: { enrichmentProgress: progress as Prisma.InputJsonValue },
        })
      );
    }

    /** Read the enrichment lifecycle + dispatch context, or null when missing. */
    static async getEnrichmentState(videoId: string): Promise<VideoEnrichmentState | null> {
      return runQuery(() =>
        prisma.video.findUnique({
          where: { id: videoId },
          select: {
            id: true,
            enrichmentStatus: true,
            enrichmentError: true,
            enrichmentStartedAt: true,
            enrichmentJobToken: true,
            enrichmentProgress: true,
            enrichedAt: true,
            category: true,
            artist: true,
            title: true,
            releasedOn: true,
            s3Key: true,
          },
        })
      );
    }
  ```

  Note: `Prisma` is already imported as a type in this file; `Prisma.InputJsonValue` is a type-only use, so the `import type { Prisma }` stays valid.

- [ ] **7.12 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/repositories/video-repository.spec.ts
  ```

- [ ] **7.13 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/types/domain/video-enrichment.ts src/lib/repositories/
  git commit -m "feat(videos): ✨ enrichment repositories"
  ```

---

### Task 8: Validation schemas + wire contracts

**Files:**

- Modify: `src/lib/validation/bio-generation-schema.ts` (export the shared `objectId`/`httpUrl` helpers — additive)
- Create: `src/lib/validation/video-enrichment-schema.ts` + `video-enrichment-schema.spec.ts`

**Interfaces:**

- Consumes: `objectIdSchema`, `httpUrlSchema`, `STALE_JOB_MS` from `./bio-generation-schema`; `zod`.
- Produces (all from `@/lib/validation/video-enrichment-schema`):
  - `VIDEO_SUGGESTION_FIELDS = ['firstName','middleName','surname','akaNames','bornOn','displayName','releasedOn'] as const`
  - `SUGGESTION_CONFIDENCES = ['high','medium','low'] as const`
  - `ENRICHMENT_STATUSES = ['pending','processing','succeeded','failed'] as const` (+ `EnrichmentStatus`)
  - `isInFlightEnrichmentStatus(status: string | null | undefined): boolean`
  - `VIDEO_PROGRESS_STAGES = ['musicbrainz','wikidata','web-search','adjudicating','finalizing'] as const`
  - `videoSuggestionSchema`, `videoEnrichmentDataSchema`, `videoEnrichmentResultSchema`, `videoEnrichmentCallbackSchema`, `videoEnrichmentProgressSchema`, `videoEnrichmentProgressPostSchema`, `videoEnrichmentStatusResponseSchema` (THE wire shape), `applyVideoSuggestionInputSchema`
  - Types: `VideoSuggestion`, `VideoEnrichmentData`, `VideoEnrichmentResult`, `VideoEnrichmentProgress`, `VideoEnrichmentStatusResult`, `ApplyVideoSuggestionInput`, `RunVideoEnrichmentActionResult`, `ApplyVideoSuggestionActionResult`
  - Re-export: `STALE_JOB_MS`

**Steps:**

- [ ] **8.1 Write the failing schema spec.** Create `src/lib/validation/video-enrichment-schema.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import {
    applyVideoSuggestionInputSchema,
    ENRICHMENT_STATUSES,
    isInFlightEnrichmentStatus,
    STALE_JOB_MS,
    VIDEO_PROGRESS_STAGES,
    VIDEO_SUGGESTION_FIELDS,
    videoEnrichmentCallbackSchema,
    videoEnrichmentDataSchema,
    videoEnrichmentProgressPostSchema,
    videoEnrichmentStatusResponseSchema,
    videoSuggestionSchema,
  } from './video-enrichment-schema';

  const OBJECT_ID = 'a'.repeat(24);

  const validSuggestion = {
    field: 'bornOn',
    value: '1985-03-15',
    confidence: 'high',
    sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
    note: 'From MusicBrainz life-span.',
  };

  const validData = {
    artists: [{ artistId: OBJECT_ID, suggestions: [validSuggestion] }],
    video: {
      releasedOn: {
        value: '2020-06-01',
        confidence: 'medium',
        sources: [{ url: 'https://example.com/premiere' }],
      },
    },
    model: 'gemini-2.5-flash',
  };

  describe('video-enrichment-schema', () => {
    it('pins the suggestion field whitelist', () => {
      expect(VIDEO_SUGGESTION_FIELDS).toEqual([
        'firstName',
        'middleName',
        'surname',
        'akaNames',
        'bornOn',
        'displayName',
        'releasedOn',
      ]);
    });

    it('pins the enrichment lifecycle statuses', () => {
      expect(ENRICHMENT_STATUSES).toEqual(['pending', 'processing', 'succeeded', 'failed']);
    });

    it('pins the progress stages in timeline order', () => {
      expect(VIDEO_PROGRESS_STAGES).toEqual([
        'musicbrainz',
        'wikidata',
        'web-search',
        'adjudicating',
        'finalizing',
      ]);
    });

    it('re-exports the 17-minute stale-job window', () => {
      expect(STALE_JOB_MS).toBe(17 * 60 * 1000);
    });

    describe('isInFlightEnrichmentStatus', () => {
      it('treats pending as in flight', () => {
        expect(isInFlightEnrichmentStatus('pending')).toBe(true);
      });

      it('treats processing as in flight', () => {
        expect(isInFlightEnrichmentStatus('processing')).toBe(true);
      });

      it('treats succeeded as terminal', () => {
        expect(isInFlightEnrichmentStatus('succeeded')).toBe(false);
      });

      it('treats null as not in flight', () => {
        expect(isInFlightEnrichmentStatus(null)).toBe(false);
      });
    });

    describe('videoSuggestionSchema', () => {
      it('accepts a fully-populated suggestion', () => {
        expect(videoSuggestionSchema.safeParse(validSuggestion).success).toBe(true);
      });

      it('rejects a value longer than 500 characters', () => {
        const parsed = videoSuggestionSchema.safeParse({
          ...validSuggestion,
          value: 'x'.repeat(501),
        });
        expect(parsed.success).toBe(false);
      });

      it('rejects a non-http(s) source URL', () => {
        const parsed = videoSuggestionSchema.safeParse({
          ...validSuggestion,
          sources: [{ url: 'javascript:alert(1)' }],
        });
        expect(parsed.success).toBe(false);
      });

      it('rejects more than 10 sources', () => {
        const sources = Array.from({ length: 11 }, (_, i) => ({ url: `https://e.com/${i}` }));
        expect(videoSuggestionSchema.safeParse({ ...validSuggestion, sources }).success).toBe(
          false
        );
      });
    });

    describe('videoEnrichmentDataSchema', () => {
      it('accepts the full payload with a video-level release date', () => {
        expect(videoEnrichmentDataSchema.safeParse(validData).success).toBe(true);
      });

      it('rejects a malformed artistId', () => {
        const parsed = videoEnrichmentDataSchema.safeParse({
          ...validData,
          artists: [{ artistId: 'nope', suggestions: [] }],
        });
        expect(parsed.success).toBe(false);
      });

      it('rejects more than 12 suggestions per artist', () => {
        const suggestions = Array.from({ length: 13 }, () => validSuggestion);
        const parsed = videoEnrichmentDataSchema.safeParse({
          ...validData,
          artists: [{ artistId: OBJECT_ID, suggestions }],
        });
        expect(parsed.success).toBe(false);
      });
    });

    describe('videoEnrichmentCallbackSchema', () => {
      it('accepts an ok result envelope', () => {
        const parsed = videoEnrichmentCallbackSchema.safeParse({
          jobToken: 't',
          result: { ok: true, data: validData },
        });
        expect(parsed.success).toBe(true);
      });

      it('accepts a failure envelope', () => {
        const parsed = videoEnrichmentCallbackSchema.safeParse({
          jobToken: 't',
          result: { ok: false, error: 'boom' },
        });
        expect(parsed.success).toBe(true);
      });

      it('rejects an empty jobToken', () => {
        const parsed = videoEnrichmentCallbackSchema.safeParse({
          jobToken: '',
          result: { ok: false, error: 'boom' },
        });
        expect(parsed.success).toBe(false);
      });
    });

    describe('videoEnrichmentProgressPostSchema', () => {
      it('accepts a checkpoint without at (server stamps it)', () => {
        const parsed = videoEnrichmentProgressPostSchema.safeParse({
          jobToken: 't',
          stage: 'wikidata',
          counts: { artists: 2 },
        });
        expect(parsed.success).toBe(true);
      });

      it('rejects an unknown stage', () => {
        const parsed = videoEnrichmentProgressPostSchema.safeParse({
          jobToken: 't',
          stage: 'drafting',
        });
        expect(parsed.success).toBe(false);
      });
    });

    describe('videoEnrichmentStatusResponseSchema', () => {
      it('accepts the assembled wire shape', () => {
        const parsed = videoEnrichmentStatusResponseSchema.safeParse({
          status: 'succeeded',
          error: null,
          progress: null,
          enrichedAt: '2026-07-12T00:00:00.000Z',
          currentReleasedOn: '2021-04-09',
          artists: [
            {
              artistId: OBJECT_ID,
              displayName: 'Ceschi',
              role: 'PRIMARY',
              current: {
                firstName: 'Francisco',
                middleName: null,
                surname: 'Ramos',
                akaNames: null,
                displayName: 'Ceschi',
                bornOn: null,
              },
            },
          ],
          suggestions: [
            {
              id: OBJECT_ID,
              artistId: OBJECT_ID,
              field: 'bornOn',
              value: '1985-03-15',
              confidence: 'high',
              sources: [{ url: 'https://musicbrainz.org/artist/x' }],
              note: null,
              status: 'pending',
            },
          ],
        });
        expect(parsed.success).toBe(true);
      });
    });

    describe('applyVideoSuggestionInputSchema', () => {
      it('accepts an apply op with a null expectedCurrent', () => {
        const parsed = applyVideoSuggestionInputSchema.safeParse({
          suggestionId: OBJECT_ID,
          op: 'apply',
          expectedCurrent: null,
        });
        expect(parsed.success).toBe(true);
      });

      it('accepts a dismiss op without expectedCurrent', () => {
        const parsed = applyVideoSuggestionInputSchema.safeParse({
          suggestionId: OBJECT_ID,
          op: 'dismiss',
        });
        expect(parsed.success).toBe(true);
      });

      it('rejects an unknown op', () => {
        const parsed = applyVideoSuggestionInputSchema.safeParse({
          suggestionId: OBJECT_ID,
          op: 'revert',
        });
        expect(parsed.success).toBe(false);
      });
    });
  });
  ```

- [ ] **8.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/validation/video-enrichment-schema.spec.ts
  ```

  Expected failure: `Failed to resolve import "./video-enrichment-schema"`.

- [ ] **8.3 Export the shared helpers from the bio schema.** In `src/lib/validation/bio-generation-schema.ts` replace:

  ```ts
  const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

  // z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
  // scheme so a reference link can never become a script-bearing href.
  const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');
  ```

  with:

  ```ts
  const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

  /** Shared 24-hex Mongo ObjectId schema, reused by sibling validation modules. */
  export const objectIdSchema = objectId;

  // z.string().url() accepts javascript:/data: URLs; require an explicit http(s)
  // scheme so a reference link can never become a script-bearing href.
  const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');

  /** Shared http(s)-only URL schema, reused by sibling validation modules. */
  export const httpUrlSchema = httpUrl;
  ```

- [ ] **8.4 Implement the video-enrichment schema.** Create `src/lib/validation/video-enrichment-schema.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { z } from 'zod';

  import { httpUrlSchema, objectIdSchema } from './bio-generation-schema';

  /**
   * The only artist/video fields a suggestion may target. `suggestion.field`
   * always maps through an explicit whitelist switch downstream — never a
   * dynamic Prisma key.
   */
  export const VIDEO_SUGGESTION_FIELDS = [
    'firstName',
    'middleName',
    'surname',
    'akaNames',
    'bornOn',
    'displayName',
    'releasedOn',
  ] as const;
  export type VideoSuggestionField = (typeof VIDEO_SUGGESTION_FIELDS)[number];

  /**
   * Confidence rubric (see the design spec): high = MusicBrainz ≥95 + Wikidata
   * corroboration of the specific fact + music-occupation gate; medium =
   * structured-source but not fully corroborated; low = web/LLM-only.
   */
  export const SUGGESTION_CONFIDENCES = ['high', 'medium', 'low'] as const;
  export type SuggestionConfidence = (typeof SUGGESTION_CONFIDENCES)[number];

  /** Async enrichment lifecycle states (null = never enriched). */
  export const ENRICHMENT_STATUSES = ['pending', 'processing', 'succeeded', 'failed'] as const;
  export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

  /** In-flight states — polling continues only while the job is one of these. */
  export const isInFlightEnrichmentStatus = (status: string | null | undefined): boolean =>
    status === 'pending' || status === 'processing';

  /**
   * Ordered stages the Lambda checkpoints through. Wire contract with
   * `bio-generator/src/types.ts` `VIDEO_PROGRESS_STAGES` — keep in lockstep
   * (the two projects cannot share a module).
   */
  export const VIDEO_PROGRESS_STAGES = [
    'musicbrainz',
    'wikidata',
    'web-search',
    'adjudicating',
    'finalizing',
  ] as const;
  export type VideoProgressStage = (typeof VIDEO_PROGRESS_STAGES)[number];

  /** One provenance link backing a suggestion. */
  export const videoSuggestionSourceSchema = z.object({
    url: httpUrlSchema,
    label: z.string().max(200).optional(),
  });

  /** One reviewable fact the Lambda proposes for an artist (or the video). */
  export const videoSuggestionSchema = z.object({
    field: z.enum(VIDEO_SUGGESTION_FIELDS),
    value: z.string().min(1).max(500),
    confidence: z.enum(SUGGESTION_CONFIDENCES),
    sources: z.array(videoSuggestionSourceSchema).max(10),
    note: z.string().max(500).optional(),
  });
  export type VideoSuggestion = z.infer<typeof videoSuggestionSchema>;

  /**
   * The successful payload the Lambda returns. Kept in lockstep with
   * `bio-generator/src/types.ts` `videoEnrichmentResultSchema` — validated at
   * the callback boundary so a malformed Lambda response is never trusted.
   */
  export const videoEnrichmentDataSchema = z.object({
    artists: z
      .array(
        z.object({
          artistId: objectIdSchema,
          suggestions: z.array(videoSuggestionSchema).max(12),
        })
      )
      .max(10),
    video: z
      .object({ releasedOn: videoSuggestionSchema.omit({ field: true }).optional() })
      .optional(),
    model: z.string().max(100),
  });
  export type VideoEnrichmentData = z.infer<typeof videoEnrichmentDataSchema>;

  /** Discriminated result envelope so the callback can branch cheaply. */
  export const videoEnrichmentResultSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: videoEnrichmentDataSchema }),
    z.object({ ok: z.literal(false), error: z.string().max(2000) }),
  ]);
  export type VideoEnrichmentResult = z.infer<typeof videoEnrichmentResultSchema>;

  /** Body the Lambda POSTs to the async completion callback route. */
  export const videoEnrichmentCallbackSchema = z.object({
    jobToken: z.string().min(1),
    result: videoEnrichmentResultSchema,
  });
  export type VideoEnrichmentCallback = z.infer<typeof videoEnrichmentCallbackSchema>;

  /**
   * A single progress checkpoint as persisted on the video and served by the
   * status endpoint. `at` is server-stamped on write.
   */
  export const videoEnrichmentProgressSchema = z.object({
    stage: z.enum(VIDEO_PROGRESS_STAGES),
    counts: z.record(z.string(), z.number().int().min(0)).optional(),
    at: z.string().datetime(),
  });
  export type VideoEnrichmentProgress = z.infer<typeof videoEnrichmentProgressSchema>;

  /**
   * Body the Lambda POSTs to the progress route. `at` is accepted for forward
   * compatibility but IGNORED — the server stamps its own time on write (the
   * shared Lambda progress helper does not send it, mirroring the bio channel).
   */
  export const videoEnrichmentProgressPostSchema = z.object({
    jobToken: z.string().min(1),
    stage: z.enum(VIDEO_PROGRESS_STAGES),
    counts: z.record(z.string(), z.number().int().min(0)).optional(),
    at: z.string().datetime().optional(),
  });
  export type VideoEnrichmentProgressPost = z.infer<typeof videoEnrichmentProgressPostSchema>;

  /** Wire schema for GET /api/videos/[id]/enrichment — THE pinned status shape. */
  export const videoEnrichmentStatusResponseSchema = z.object({
    status: z.enum(ENRICHMENT_STATUSES).nullable(),
    error: z.string().nullable(),
    progress: videoEnrichmentProgressSchema.nullable(),
    enrichedAt: z.string().nullable(),
    /** The admin-entered release date, day precision (YYYY-MM-DD). */
    currentReleasedOn: z.string(),
    artists: z.array(
      z.object({
        artistId: z.string(),
        displayName: z.string(),
        role: z.enum(['PRIMARY', 'FEATURED']),
        current: z.object({
          firstName: z.string(),
          middleName: z.string().nullable(),
          surname: z.string(),
          akaNames: z.string().nullable(),
          displayName: z.string().nullable(),
          bornOn: z.string().nullable(),
        }),
      })
    ),
    suggestions: z.array(
      z.object({
        id: z.string(),
        artistId: z.string().nullable(),
        field: z.enum(VIDEO_SUGGESTION_FIELDS),
        value: z.string(),
        confidence: z.enum(SUGGESTION_CONFIDENCES),
        sources: z.array(videoSuggestionSourceSchema),
        note: z.string().nullable(),
        status: z.enum(['pending', 'applied', 'dismissed']),
      })
    ),
  });
  export type VideoEnrichmentStatusResult = z.infer<typeof videoEnrichmentStatusResponseSchema>;

  /** Admin input for the apply/dismiss Server Action. */
  export const applyVideoSuggestionInputSchema = z.object({
    suggestionId: objectIdSchema,
    op: z.enum(['apply', 'dismiss']),
    /**
     * Optimistic-concurrency guard: the current value the admin saw (dates as
     * YYYY-MM-DD, strings trimmed; null = "field was empty"). Omitted = skip
     * the drift check.
     */
    expectedCurrent: z.string().max(500).nullable().optional(),
  });
  export type ApplyVideoSuggestionInput = z.infer<typeof applyVideoSuggestionInputSchema>;

  /** Result of triggering async enrichment (mirrors GenerateArtistBioActionResult). */
  export type RunVideoEnrichmentActionResult =
    | { success: true; status: EnrichmentStatus }
    | { success: false; error: string };

  /** Result of applying/dismissing one suggestion. */
  export type ApplyVideoSuggestionActionResult =
    | { success: true; op: 'apply' | 'dismiss' }
    | { success: false; error: string };

  export { STALE_JOB_MS } from './bio-generation-schema';
  ```

- [ ] **8.5 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/validation/video-enrichment-schema.spec.ts src/lib/validation/bio-generation-schema.spec.ts
  ```

  (The second path guards the additive bio-schema edit; if no such spec exists, drop it from the command.)

- [ ] **8.6 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/validation/
  git commit -m "feat(videos): ✨ enrichment zod schemas"
  ```

---

### Task 9: Deterministic probe + enrichment fixtures

**Files:**

- Create: `src/lib/services/video-enrichment-fixture.ts` + `video-enrichment-fixture.spec.ts`

**Interfaces:**

- Consumes: `NormalizedProbe` from `@/lib/video-probe/normalize` (Part A), `VideoEnrichmentData` from `@/lib/validation/video-enrichment-schema`.
- Produces:
  - `videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown }`
  - `videoEnrichmentFixture(input: { artists: Array<{ artistId: string }> }): VideoEnrichmentData`

**Steps:**

- [ ] **9.1 Write the failing fixture spec.** Create `src/lib/services/video-enrichment-fixture.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { videoEnrichmentDataSchema } from '@/lib/validation/video-enrichment-schema';

  import { videoEnrichmentFixture, videoProbeFixture } from './video-enrichment-fixture';

  const ARTIST_ID = 'a'.repeat(24);
  const OTHER_ID = 'b'.repeat(24);

  describe('videoProbeFixture', () => {
    it('describes a deterministic 1080p h264/aac mp4', () => {
      expect(videoProbeFixture.normalized).toMatchObject({
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
      });
    });

    it('keeps the raw probeData filename as a bare s3 key (no presigned URL)', () => {
      expect(JSON.stringify(videoProbeFixture.probeData)).not.toContain('X-Amz-');
    });
  });

  describe('videoEnrichmentFixture', () => {
    it('validates against the enrichment data schema', () => {
      const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

      expect(videoEnrichmentDataSchema.safeParse(data).success).toBe(true);
    });

    it('emits a high-confidence bornOn and a medium akaNames per artist', () => {
      const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

      expect(data.artists[0].suggestions).toEqual([
        expect.objectContaining({ field: 'bornOn', value: '1985-03-15', confidence: 'high' }),
        expect.objectContaining({ field: 'akaNames', value: 'E2E Alias', confidence: 'medium' }),
      ]);
    });

    it('emits one fixture row set per supplied artist', () => {
      const data = videoEnrichmentFixture({
        artists: [{ artistId: ARTIST_ID }, { artistId: OTHER_ID }],
      });

      expect(data.artists.map(({ artistId }) => artistId)).toEqual([ARTIST_ID, OTHER_ID]);
    });

    it('emits a medium-confidence video release date of 2020-06-01', () => {
      const data = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

      expect(data.video?.releasedOn).toMatchObject({ value: '2020-06-01', confidence: 'medium' });
    });

    it('is deterministic across calls', () => {
      const a = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });
      const b = videoEnrichmentFixture({ artists: [{ artistId: ARTIST_ID }] });

      expect(a).toEqual(b);
    });
  });
  ```

- [ ] **9.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/services/video-enrichment-fixture.spec.ts
  ```

  Expected failure: `Failed to resolve import "./video-enrichment-fixture"`.

- [ ] **9.3 Implement the fixtures.** Create `src/lib/services/video-enrichment-fixture.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import type { NormalizedProbe } from '@/lib/video-probe/normalize';
  import type { VideoEnrichmentData } from '@/lib/validation/video-enrichment-schema';

  /**
   * Deterministic ffprobe result used when `BIO_GENERATOR_FAKE=true` (E2E and
   * local dev without ffprobe/S3). A plain 1080p h264/aac MP4; the raw
   * `probeData` filename is a bare s3Key — never a presigned URL — mirroring the
   * production redaction contract (no `X-Amz-` substring may survive).
   */
  export const videoProbeFixture: { normalized: NormalizedProbe; probeData: unknown } = {
    normalized: {
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrateKbps: 4800,
      frameRate: 23.976,
      audioChannels: 2,
      audioSampleRateHz: 48000,
      colorSpace: 'bt709',
      colorPrimaries: 'bt709',
      colorTransfer: 'bt709',
      sourceCreatedAt: new Date('2020-05-30T12:00:00.000Z'),
      encoder: 'Lavf60.16.100',
      durationSeconds: 245,
    },
    probeData: {
      format: {
        filename: 'media/videos/e2e-fixture.mp4',
        format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
        duration: '245.000000',
        bit_rate: '4800000',
        tags: { encoder: 'Lavf60.16.100', creation_time: '2020-05-30T12:00:00.000000Z' },
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          r_frame_rate: '24000/1001',
          color_space: 'bt709',
          color_primaries: 'bt709',
          color_transfer: 'bt709',
        },
        { codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000' },
      ],
    },
  };

  /** The deterministic sources every fixture suggestion cites. */
  const FIXTURE_MB_SOURCE = {
    url: 'https://musicbrainz.org/artist/e2e-fixture',
    label: 'MusicBrainz',
  } as const;
  const FIXTURE_WD_SOURCE = { url: 'https://www.wikidata.org/wiki/Q0', label: 'Wikidata' } as const;

  /**
   * Deterministic enrichment result used when `BIO_GENERATOR_FAKE=true`. Emits,
   * per artist: a high-confidence bornOn (1985-03-15) and a medium-confidence
   * akaNames ('E2E Alias'); plus a medium-confidence video release date
   * (2020-06-01) so E2E can assert the full run → suggest → apply flow.
   */
  export const videoEnrichmentFixture = (input: {
    artists: Array<{ artistId: string }>;
  }): VideoEnrichmentData => ({
    artists: input.artists.map(({ artistId }) => ({
      artistId,
      suggestions: [
        {
          field: 'bornOn',
          value: '1985-03-15',
          confidence: 'high',
          sources: [FIXTURE_MB_SOURCE, FIXTURE_WD_SOURCE],
          note: 'Deterministic fixture fact (E2E).',
        },
        {
          field: 'akaNames',
          value: 'E2E Alias',
          confidence: 'medium',
          sources: [FIXTURE_MB_SOURCE],
          note: 'Deterministic fixture alias (E2E).',
        },
      ],
    })),
    video: {
      releasedOn: {
        value: '2020-06-01',
        confidence: 'medium',
        sources: [{ url: 'https://musicbrainz.org/release/e2e-fixture', label: 'MusicBrainz' }],
        note: 'Deterministic fixture release date (E2E).',
      },
    },
    model: 'fake/deterministic',
  });
  ```

  > **Alignment note:** the `normalized` literal above matches the spec's normalized-field list. If Part A's `NormalizedProbe` names/types any key differently (e.g. no `durationSeconds`, or `sourceCreatedAt` as string), `pnpm run typecheck` fails here — adjust ONLY the literal's keys to satisfy the real type; keep every value deterministic.

- [ ] **9.4 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/services/video-enrichment-fixture.spec.ts
  ```

- [ ] **9.5 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/services/video-enrichment-fixture.ts src/lib/services/video-enrichment-fixture.spec.ts
  git commit -m "feat(videos): ✨ enrichment fixtures"
  ```

---

### Task 10: VideoEnrichmentService (+ shared base-URL extraction)

**Files:**

- Create: `src/lib/utils/enrichment-base-url.ts` + `enrichment-base-url.spec.ts`
- Modify: `src/lib/services/bio-generation-service.ts` (swap `resolveBioBaseUrl` for the shared util — behavior-preserving)
- Create: `src/lib/services/video-enrichment-service.ts` + `video-enrichment-service.spec.ts`

**Interfaces:**

- Consumes: `VideoRepository` enrichment methods, `VideoArtistRepository`, `VideoEnrichmentSuggestionRepository` (Task 7); `ArtistService.findOrCreateByName`; `splitFeaturedArtists` (Part A); `videoEnrichmentFixture` (Task 9); schema module (Task 8); `@aws-sdk/client-lambda`; env `BIO_GENERATOR_LAMBDA_NAME`, `NEXT_PUBLIC_BASE_URL`, `BIO_GENERATOR_FAKE`.
- Produces:
  - `resolveEnrichmentBaseUrl(): string | null` from `@/lib/utils/enrichment-base-url` (also consumed by the bio service)
  - `class VideoEnrichmentService` (static): `syncVideoArtists(videoId: string, artistString: string): Promise<void>`, `runEnrichmentJob(videoId: string): Promise<void>`, `getEnrichmentStatus(videoId: string): Promise<VideoEnrichmentStatusResult | null>`, `verifyAndClaimCallback(videoId: string, jobToken: string): Promise<boolean>`, `recordProgress(videoId: string, jobToken: string, checkpoint: { stage: VideoProgressStage; counts?: Record<string, number> }): Promise<void>`, `completeCallback(videoId: string, result: VideoEnrichmentResult): Promise<void>`
  - `interface VideoEnrichmentLambdaInput` (the invoke payload — mirrored by the Lambda's `videoEnrichmentInputSchema` in Task 14)

**Steps:**

- [ ] **10.1 Write the failing base-URL util spec.** Create `src/lib/utils/enrichment-base-url.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { resolveEnrichmentBaseUrl } from './enrichment-base-url';

  vi.mock('server-only', () => ({}));

  describe('resolveEnrichmentBaseUrl', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('returns the configured origin', () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');

      expect(resolveEnrichmentBaseUrl()).toBe('https://example.com');
    });

    it('trims a trailing slash', () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com/');

      expect(resolveEnrichmentBaseUrl()).toBe('https://example.com');
    });

    it('returns null when unconfigured', () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');

      expect(resolveEnrichmentBaseUrl()).toBeNull();
    });
  });
  ```

- [ ] **10.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/utils/enrichment-base-url.spec.ts
  ```

  Expected failure: `Failed to resolve import "./enrichment-base-url"`.

- [ ] **10.3 Implement the util and refactor the bio service onto it.** Create `src/lib/utils/enrichment-base-url.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  /**
   * Resolve the app's canonical public origin (`NEXT_PUBLIC_BASE_URL` — the same
   * env every publicly-reachable absolute link uses, e.g. email/notification
   * URLs), with any trailing slash trimmed so appended paths have exactly one
   * separator. Returns `null` when the base URL is unconfigured, so callers can
   * fail an async job rather than dispatch an un-answerable invoke (fake/E2E
   * paths never reach it). Both the bio and video enrichment pipelines derive
   * their callback/progress URLs from this base.
   */
  export const resolveEnrichmentBaseUrl = (): string | null => {
    const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
    return base ? base.replace(/\/$/, '') : null;
  };
  ```

  Then apply this exact refactor in `src/lib/services/bio-generation-service.ts`:

  1. Add to the `@/lib/utils` import block (alphabetical, next to the other utils):

     ```ts
     import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
     ```

  2. Delete the whole local helper (jsdoc + function):

     ```ts
     /**
      * Resolve the app's canonical public origin (`NEXT_PUBLIC_BASE_URL` — the same
      * env every publicly-reachable absolute link uses, e.g. email/notification
      * URLs), with any trailing slash trimmed so appended paths have exactly one
      * separator. Returns `null` when the base URL is unconfigured, so the caller can
      * fail the job rather than dispatch an un-answerable invoke (fake/E2E never
      * reach here). Both the completion callback and the progress channel derive
      * their absolute URLs from this base.
      */
     const resolveBioBaseUrl = (): string | null => {
       const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
       return base ? base.replace(/\/$/, '') : null;
     };
     ```

  3. In `dispatchGeneration`, replace the single call site:

     ```ts
     const base = resolveBioBaseUrl();
     ```

     with:

     ```ts
     const base = resolveEnrichmentBaseUrl();
     ```

  Behavior is byte-identical, so `src/lib/services/bio-generation-service.spec.ts` must stay green untouched.

- [ ] **10.4 Run the util spec + the bio service spec, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/utils/enrichment-base-url.spec.ts src/lib/services/bio-generation-service.spec.ts
  ```

- [ ] **10.5 Commit the extraction.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/utils/enrichment-base-url.ts src/lib/utils/enrichment-base-url.spec.ts src/lib/services/bio-generation-service.ts
  git commit -m "refactor(bio): ♻️ extract enrichment base URL"
  ```

- [ ] **10.6 Write the failing service spec.** Create `src/lib/services/video-enrichment-service.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
  import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { ArtistService } from '@/lib/services/artist-service';
  import type { VideoEnrichmentState } from '@/lib/types/domain/video-enrichment';
  import { splitFeaturedArtists } from '@/utils/artist-name-split';

  import { VideoEnrichmentService } from './video-enrichment-service';

  import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';

  vi.mock('server-only', () => ({}));

  const sendMock = vi.hoisted(() => vi.fn());
  vi.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: class {
      send = sendMock;
    },
    InvokeCommand: class {
      constructor(
        readonly input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array }
      ) {}
    },
  }));
  vi.mock('@smithy/node-http-handler', () => ({ NodeHttpHandler: class {} }));

  vi.mock('@/lib/repositories/video-repository', () => ({
    VideoRepository: {
      getEnrichmentState: vi.fn(),
      setEnrichmentStatus: vi.fn(),
      setEnrichmentJobToken: vi.fn(),
      claimEnrichmentJobToken: vi.fn(),
      setEnrichmentProgress: vi.fn(),
    },
  }));
  vi.mock('@/lib/repositories/video-artist-repository', () => ({
    VideoArtistRepository: {
      replaceForVideo: vi.fn(),
      findByVideoId: vi.fn(),
      deleteByVideoId: vi.fn(),
    },
  }));
  vi.mock('@/lib/repositories/video-enrichment-suggestion-repository', () => ({
    VideoEnrichmentSuggestionRepository: {
      replacePending: vi.fn(),
      findByVideoId: vi.fn(),
      findById: vi.fn(),
      markApplied: vi.fn(),
      markDismissed: vi.fn(),
      findExistingFacts: vi.fn(),
      deletePendingForArtists: vi.fn(),
    },
  }));
  vi.mock('@/lib/services/artist-service', () => ({
    ArtistService: { findOrCreateByName: vi.fn() },
  }));
  vi.mock('@/utils/artist-name-split', () => ({ splitFeaturedArtists: vi.fn() }));
  vi.mock('@/lib/utils/logger', () => ({
    loggers: new Proxy(
      {},
      { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
    ),
  }));

  const VIDEO_ID = 'f'.repeat(24);
  const ARTIST_ID = 'a'.repeat(24);
  const OTHER_ID = 'b'.repeat(24);

  const baseState = (overrides: Partial<VideoEnrichmentState> = {}): VideoEnrichmentState => ({
    id: VIDEO_ID,
    enrichmentStatus: null,
    enrichmentError: null,
    enrichmentStartedAt: null,
    enrichmentJobToken: null,
    enrichmentProgress: null,
    enrichedAt: null,
    category: 'MUSIC',
    artist: 'Ceschi',
    title: 'Bite Through Stone',
    releasedOn: new Date('2021-04-09T00:00:00.000Z'),
    s3Key: 'media/videos/abc.mp4',
    ...overrides,
  });

  const artistRow = (overrides: Partial<VideoArtistWithArtist> = {}): VideoArtistWithArtist => ({
    artistId: ARTIST_ID,
    role: 'PRIMARY',
    sortOrder: 0,
    artist: {
      displayName: 'Ceschi',
      firstName: 'Francisco',
      middleName: null,
      surname: 'Ramos',
      akaNames: null,
      bornOn: null,
    },
    ...overrides,
  });

  /** The InvokeCommand payload sent to the mocked Lambda client, parsed. */
  const sentPayload = (): Record<string, unknown> => {
    const command = sendMock.mock.calls[0][0] as { input: { Payload: Uint8Array } };
    return JSON.parse(Buffer.from(command.input.Payload).toString('utf8'));
  };

  beforeEach(() => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'bio-fn');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    vi.stubEnv('BIO_GENERATOR_FAKE', 'false');
    vi.mocked(VideoRepository.setEnrichmentStatus).mockResolvedValue(undefined);
    vi.mocked(VideoRepository.setEnrichmentJobToken).mockResolvedValue(undefined);
    vi.mocked(VideoRepository.setEnrichmentProgress).mockResolvedValue(undefined);
    vi.mocked(VideoArtistRepository.replaceForVideo).mockResolvedValue(undefined);
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);
    vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockResolvedValue(undefined);
    vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([]);
    vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([]);
    vi.mocked(VideoEnrichmentSuggestionRepository.deletePendingForArtists).mockResolvedValue(
      undefined
    );
    sendMock.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllEnvs());

  describe('syncVideoArtists', () => {
    it('creates a shell per split name and replaces the join rows in order', async () => {
      vi.mocked(splitFeaturedArtists).mockReturnValue([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sole', role: 'featured' },
      ]);
      vi.mocked(ArtistService.findOrCreateByName)
        .mockResolvedValueOnce({
          success: true,
          data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { id: OTHER_ID, displayName: 'Sole', firstName: 'Tim', surname: 'Holland' },
        });

      await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. Sole');

      expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
        { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
        { artistId: OTHER_ID, role: 'FEATURED', sortOrder: 1 },
      ]);
    });

    it('continues past a failed shell creation (best-effort)', async () => {
      vi.mocked(splitFeaturedArtists).mockReturnValue([
        { name: 'Ceschi', role: 'primary' },
        { name: 'Sole', role: 'featured' },
      ]);
      vi.mocked(ArtistService.findOrCreateByName)
        .mockResolvedValueOnce({ success: false, error: 'db down' })
        .mockResolvedValueOnce({
          success: true,
          data: { id: OTHER_ID, displayName: 'Sole', firstName: 'Tim', surname: 'Holland' },
        });

      await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. Sole');

      expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
        { artistId: OTHER_ID, role: 'FEATURED', sortOrder: 0 },
      ]);
    });

    it('dedupes a repeated artist so the unique join constraint cannot trip', async () => {
      vi.mocked(splitFeaturedArtists).mockReturnValue([
        { name: 'Ceschi', role: 'primary' },
        { name: 'CESCHI', role: 'featured' },
      ]);
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
      });

      await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi feat. CESCHI');

      expect(VideoArtistRepository.replaceForVideo).toHaveBeenCalledWith(VIDEO_ID, [
        { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
      ]);
    });

    it('drops pending suggestions for artists detached by the re-sync', async () => {
      vi.mocked(splitFeaturedArtists).mockReturnValue([{ name: 'Ceschi', role: 'primary' }]);
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
        artistRow(),
        artistRow({ artistId: OTHER_ID, sortOrder: 1, role: 'FEATURED' }),
      ]);
      vi.mocked(ArtistService.findOrCreateByName).mockResolvedValue({
        success: true,
        data: { id: ARTIST_ID, displayName: 'Ceschi', firstName: 'Francisco', surname: 'Ramos' },
      });

      await VideoEnrichmentService.syncVideoArtists(VIDEO_ID, 'Ceschi');

      expect(VideoEnrichmentSuggestionRepository.deletePendingForArtists).toHaveBeenCalledWith(
        VIDEO_ID,
        [OTHER_ID]
      );
    });
  });

  describe('runEnrichmentJob', () => {
    it('does nothing for an INFORMATIONAL video', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ category: 'INFORMATIONAL' })
      );

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
    });

    it('refuses to double-dispatch while a processing job is fresh', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'processing', enrichmentStartedAt: new Date() })
      );

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('completes in-process from the fixture on the fake path', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(
        VIDEO_ID,
        expect.arrayContaining([
          expect.objectContaining({ artistId: ARTIST_ID, field: 'bornOn', value: '1985-03-15' }),
        ])
      );
      expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'succeeded', {
        error: null,
      });
    });

    it('emits one synthetic progress checkpoint on the fake path', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(VideoRepository.setEnrichmentProgress).toHaveBeenCalledWith(
        VIDEO_ID,
        expect.objectContaining({ stage: 'musicbrainz' })
      );
    });

    it('stores a job token and fires an Event invoke with the callback URLs', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      const payload = sentPayload();
      const storedToken = vi.mocked(VideoRepository.setEnrichmentJobToken).mock.calls[0][1];
      expect(payload).toMatchObject({
        task: 'video-enrichment',
        videoId: VIDEO_ID,
        title: 'Bite Through Stone',
        artistDisplay: 'Ceschi',
        releasedOn: '2021-04-09',
        callbackUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/callback`,
        progressUrl: `https://example.com/api/videos/${VIDEO_ID}/enrichment/progress`,
        jobToken: storedToken,
      });
    });

    it('sends the linked artists with their known identity fields', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
        artistRow({
          artist: {
            displayName: 'Ceschi',
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: 'Ceschi Ramos',
            bornOn: new Date('1980-01-02T00:00:00.000Z'),
          },
        }),
      ]);

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(sentPayload().artists).toEqual([
        {
          artistId: ARTIST_ID,
          name: 'Ceschi',
          role: 'primary',
          known: {
            firstName: 'Francisco',
            surname: 'Ramos',
            displayName: 'Ceschi',
            akaNames: 'Ceschi Ramos',
            bornOn: '1980-01-02',
          },
        },
      ]);
    });

    it('fails the job and clears the token when the invoke throws', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
      sendMock.mockRejectedValue(new Error('network'));

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
        error: 'Failed to reach the enrichment generator',
      });
      expect(VideoRepository.setEnrichmentJobToken).toHaveBeenLastCalledWith(VIDEO_ID, null);
    });

    it('fails the job when the base URL is unconfigured', async () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);

      await VideoEnrichmentService.runEnrichmentJob(VIDEO_ID);

      expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
        error: 'Video enrichment callback URL is not configured',
      });
    });
  });

  describe('getEnrichmentStatus', () => {
    it('returns null for a missing video', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

      const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

      expect(result).toBeNull();
    });

    it('coerces a stale processing job to failed on read', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({
          enrichmentStatus: 'processing',
          enrichmentStartedAt: new Date(Date.now() - 18 * 60 * 1000),
        })
      );

      const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

      expect(result).toMatchObject({
        status: 'failed',
        error: 'Video enrichment timed out. Please try again.',
      });
    });

    it('assembles the wire shape with day-precision dates and suggestion rows', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({
          enrichmentStatus: 'succeeded',
          enrichedAt: new Date('2026-07-12T01:02:03.000Z'),
        })
      );
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
        artistRow({
          artist: {
            displayName: null,
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: null,
            bornOn: new Date('1980-01-02T00:00:00.000Z'),
          },
        }),
      ]);
      vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
        {
          id: 'c'.repeat(24),
          videoId: VIDEO_ID,
          artistId: ARTIST_ID,
          field: 'bornOn',
          value: '1985-03-15',
          confidence: 'high',
          sources: [{ url: 'https://musicbrainz.org/artist/x' }],
          note: null,
          status: 'pending',
          appliedAt: null,
          appliedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

      expect(result).toEqual({
        status: 'succeeded',
        error: null,
        progress: null,
        enrichedAt: '2026-07-12T01:02:03.000Z',
        currentReleasedOn: '2021-04-09',
        artists: [
          {
            artistId: ARTIST_ID,
            displayName: 'Francisco Ramos',
            role: 'PRIMARY',
            current: {
              firstName: 'Francisco',
              middleName: null,
              surname: 'Ramos',
              akaNames: null,
              displayName: null,
              bornOn: '1980-01-02',
            },
          },
        ],
        suggestions: [
          {
            id: 'c'.repeat(24),
            artistId: ARTIST_ID,
            field: 'bornOn',
            value: '1985-03-15',
            confidence: 'high',
            sources: [{ url: 'https://musicbrainz.org/artist/x' }],
            note: null,
            status: 'pending',
          },
        ],
      });
    });

    it('degrades malformed stored sources to an empty list', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'succeeded' })
      );
      vi.mocked(VideoEnrichmentSuggestionRepository.findByVideoId).mockResolvedValue([
        {
          id: 'c'.repeat(24),
          videoId: VIDEO_ID,
          artistId: ARTIST_ID,
          field: 'bornOn',
          value: '1985-03-15',
          confidence: 'high',
          sources: 'garbage',
          note: null,
          status: 'pending',
          appliedAt: null,
          appliedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await VideoEnrichmentService.getEnrichmentStatus(VIDEO_ID);

      expect(result?.suggestions[0].sources).toEqual([]);
    });
  });

  describe('verifyAndClaimCallback', () => {
    it('returns false on a token mismatch without attempting the claim', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
      );

      const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'forged');

      expect(result).toBe(false);
      expect(VideoRepository.claimEnrichmentJobToken).not.toHaveBeenCalled();
    });

    it('claims atomically when the token matches a processing job', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
      );
      vi.mocked(VideoRepository.claimEnrichmentJobToken).mockResolvedValue(true);

      const result = await VideoEnrichmentService.verifyAndClaimCallback(VIDEO_ID, 'stored');

      expect(result).toBe(true);
      expect(VideoRepository.claimEnrichmentJobToken).toHaveBeenCalledWith(VIDEO_ID, 'stored');
    });
  });

  describe('recordProgress', () => {
    it('stamps the checkpoint server-side when the token matches', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'processing', enrichmentJobToken: 'stored' })
      );

      await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', {
        stage: 'wikidata',
        counts: { artists: 1 },
      });

      expect(VideoRepository.setEnrichmentProgress).toHaveBeenCalledWith(VIDEO_ID, {
        stage: 'wikidata',
        counts: { artists: 1 },
        at: expect.any(String),
      });
    });

    it('writes nothing when the job is not processing', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'succeeded', enrichmentJobToken: 'stored' })
      );

      await VideoEnrichmentService.recordProgress(VIDEO_ID, 'stored', { stage: 'wikidata' });

      expect(VideoRepository.setEnrichmentProgress).not.toHaveBeenCalled();
    });
  });

  describe('completeCallback', () => {
    const okResult = (suggestionValue: string) => ({
      ok: true as const,
      data: {
        artists: [
          {
            artistId: ARTIST_ID,
            suggestions: [
              {
                field: 'bornOn' as const,
                value: suggestionValue,
                confidence: 'high' as const,
                sources: [{ url: 'https://musicbrainz.org/artist/x' }],
              },
            ],
          },
        ],
        model: 'gemini-2.5-flash',
      },
    });

    beforeEach(() => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow()]);
    });

    it('flips to failed on an error result', async () => {
      await VideoEnrichmentService.completeCallback(VIDEO_ID, { ok: false, error: 'boom' });

      expect(VideoRepository.setEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID, 'failed', {
        error: 'boom',
      });
    });

    it('persists new facts as pending and flips to succeeded', async () => {
      await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
        {
          artistId: ARTIST_ID,
          field: 'bornOn',
          value: '1985-03-15',
          confidence: 'high',
          sources: [{ url: 'https://musicbrainz.org/artist/x' }],
          note: null,
        },
      ]);
      expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'succeeded', {
        error: null,
      });
    });

    it('drops a suggestion equal to the current value at day precision', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
        artistRow({
          artist: {
            displayName: 'Ceschi',
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: null,
            bornOn: new Date('1985-03-15T00:00:00.000Z'),
          },
        }),
      ]);

      await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
    });

    it('fences a fact already applied or dismissed', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.findExistingFacts).mockResolvedValue([
        { artistId: ARTIST_ID, field: 'bornOn', value: '1985-03-15' },
      ]);

      await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
    });

    it('pre-merges an akaNames suggestion with the existing comma list', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([
        artistRow({
          artist: {
            displayName: 'Ceschi',
            firstName: 'Francisco',
            middleName: null,
            surname: 'Ramos',
            akaNames: 'Ceschi Ramos',
            bornOn: null,
          },
        }),
      ]);

      await VideoEnrichmentService.completeCallback(VIDEO_ID, {
        ok: true,
        data: {
          artists: [
            {
              artistId: ARTIST_ID,
              suggestions: [
                {
                  field: 'akaNames',
                  value: 'Ceschi Ramos, Francisco the Man',
                  confidence: 'medium',
                  sources: [{ url: 'https://musicbrainz.org/artist/x' }],
                },
              ],
            },
          ],
          model: 'gemini-2.5-flash',
        },
      });

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
        expect.objectContaining({
          field: 'akaNames',
          value: 'Ceschi Ramos, Francisco the Man',
        }),
      ]);
    });

    it('emits the release-date suggestion only when it differs from the admin date', async () => {
      await VideoEnrichmentService.completeCallback(VIDEO_ID, {
        ok: true,
        data: {
          artists: [],
          video: {
            releasedOn: {
              value: '2021-04-09',
              confidence: 'medium',
              sources: [{ url: 'https://example.com/premiere' }],
            },
          },
          model: 'gemini-2.5-flash',
        },
      });

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, []);
    });

    it('persists a differing release date as a video-level suggestion', async () => {
      await VideoEnrichmentService.completeCallback(VIDEO_ID, {
        ok: true,
        data: {
          artists: [],
          video: {
            releasedOn: {
              value: '2020-06-01',
              confidence: 'medium',
              sources: [{ url: 'https://example.com/premiere' }],
            },
          },
          model: 'gemini-2.5-flash',
        },
      });

      expect(VideoEnrichmentSuggestionRepository.replacePending).toHaveBeenCalledWith(VIDEO_ID, [
        expect.objectContaining({ artistId: null, field: 'releasedOn', value: '2020-06-01' }),
      ]);
    });

    it('flips to failed when persistence throws', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.replacePending).mockRejectedValue(
        new Error('db down')
      );

      await VideoEnrichmentService.completeCallback(VIDEO_ID, okResult('1985-03-15'));

      expect(VideoRepository.setEnrichmentStatus).toHaveBeenLastCalledWith(VIDEO_ID, 'failed', {
        error: 'db down',
      });
    });
  });
  ```

- [ ] **10.7 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/services/video-enrichment-service.spec.ts
  ```

  Expected failure: `Failed to resolve import "./video-enrichment-service"`.

- [ ] **10.8 Implement the service.** Create `src/lib/services/video-enrichment-service.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import 'server-only';

  import { randomUUID, timingSafeEqual } from 'node:crypto';

  import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
  import { NodeHttpHandler } from '@smithy/node-http-handler';

  import {
    VideoArtistRepository,
    type VideoArtistWithArtist,
  } from '@/lib/repositories/video-artist-repository';
  import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { ArtistService } from '@/lib/services/artist-service';
  import type { Json } from '@/lib/types/domain/shared';
  import type {
    CreateSuggestionRow,
    VideoEnrichmentState,
    VideoEnrichmentSuggestionRecord,
  } from '@/lib/types/domain/video-enrichment';
  import { splitFeaturedArtists } from '@/utils/artist-name-split';
  import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
  import { loggers } from '@/lib/utils/logger';
  import {
    ENRICHMENT_STATUSES,
    isInFlightEnrichmentStatus,
    STALE_JOB_MS,
    SUGGESTION_CONFIDENCES,
    VIDEO_SUGGESTION_FIELDS,
    videoEnrichmentProgressSchema,
    videoSuggestionSourceSchema,
    type EnrichmentStatus,
    type SuggestionConfidence,
    type VideoEnrichmentData,
    type VideoEnrichmentProgress,
    type VideoEnrichmentResult,
    type VideoEnrichmentStatusResult,
    type VideoProgressStage,
    type VideoSuggestion,
    type VideoSuggestionField,
  } from '@/lib/validation/video-enrichment-schema';
  import { z } from 'zod';

  import { videoEnrichmentFixture } from './video-enrichment-fixture';

  const logger = loggers.media;

  let lambdaClient: LambdaClient | null = null;

  /** Short timeout: the Event invoke returns 202 immediately (see bio service). */
  const INVOKE_REQUEST_TIMEOUT_MS = 30 * 1000;

  /** Error the status read attaches when coercing a stale in-flight job. */
  const STALE_JOB_ERROR = 'Video enrichment timed out. Please try again.';

  /** Hard cap mirrored by the Lambda's input schema (`artists: 1..10`). */
  const MAX_LAMBDA_ARTISTS = 10;

  const getLambdaClient = (): LambdaClient => {
    if (!lambdaClient) {
      lambdaClient = new LambdaClient({
        region: process.env.AWS_REGION || 'us-east-1',
        requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
      });
    }
    return lambdaClient;
  };

  /** Invoke payload for the bio-generator Lambda's `video-enrichment` task. */
  export interface VideoEnrichmentLambdaInput {
    task: 'video-enrichment';
    videoId: string;
    title: string;
    artistDisplay: string;
    releasedOn?: string;
    artists: Array<{
      artistId: string;
      name: string;
      role: 'primary' | 'featured';
      known?: {
        firstName?: string;
        middleName?: string;
        surname?: string;
        displayName?: string;
        akaNames?: string;
        bornOn?: string;
      };
    }>;
    callbackUrl?: string;
    progressUrl?: string;
    jobToken?: string;
  }

  /** YYYY-MM-DD for wire dates, or undefined. */
  const toIsoDate = (value: Date | null | undefined): string | undefined =>
    value ? value.toISOString().slice(0, 10) : undefined;

  /** Constant-time token comparison (see BioGenerationService.tokensMatch). */
  const tokensMatch = (a: string, b: string): boolean => {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  };

  /** The best display name for a linked artist (mirrors the bio derivation). */
  const displayNameFor = (row: VideoArtistWithArtist): string =>
    row.artist.displayName?.trim() || `${row.artist.firstName} ${row.artist.surname}`.trim();

  /** Map join rows onto the Lambda's `artists` payload, dropping empty knowns. */
  const toLambdaArtists = (rows: VideoArtistWithArtist[]): VideoEnrichmentLambdaInput['artists'] =>
    rows.slice(0, MAX_LAMBDA_ARTISTS).map((row) => {
      const known = {
        ...(row.artist.firstName ? { firstName: row.artist.firstName } : {}),
        ...(row.artist.middleName ? { middleName: row.artist.middleName } : {}),
        ...(row.artist.surname ? { surname: row.artist.surname } : {}),
        ...(row.artist.displayName ? { displayName: row.artist.displayName } : {}),
        ...(row.artist.akaNames ? { akaNames: row.artist.akaNames } : {}),
        ...(row.artist.bornOn ? { bornOn: toIsoDate(row.artist.bornOn) } : {}),
      };
      return {
        artistId: row.artistId,
        name: displayNameFor(row),
        role: row.role === 'PRIMARY' ? ('primary' as const) : ('featured' as const),
        ...(Object.keys(known).length > 0 ? { known } : {}),
      };
    });

  /** Narrow a stored status string to the lifecycle union (null when unknown). */
  const toEnrichmentStatus = (status: string | null): EnrichmentStatus | null =>
    status && (ENRICHMENT_STATUSES as readonly string[]).includes(status)
      ? (status as EnrichmentStatus)
      : null;

  /** True when a fresh (non-stale) job is already processing. */
  const isFreshlyProcessing = (state: VideoEnrichmentState): boolean => {
    if (state.enrichmentStatus !== 'processing') return false;
    const startedAt = state.enrichmentStartedAt?.getTime() ?? 0;
    return Date.now() - startedAt <= STALE_JOB_MS;
  };

  /** Parse a stored progress JSON into the validated shape, or null. */
  const parseStoredProgress = (value: Json | null): VideoEnrichmentProgress | null => {
    const parsed = videoEnrichmentProgressSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };

  const storedSourcesSchema = z.array(videoSuggestionSourceSchema);

  /** Map a stored suggestion row onto the wire shape (null = malformed row). */
  const toStatusSuggestion = (
    row: VideoEnrichmentSuggestionRecord
  ): VideoEnrichmentStatusResult['suggestions'][number] | null => {
    if (!(VIDEO_SUGGESTION_FIELDS as readonly string[]).includes(row.field)) return null;
    if (!(SUGGESTION_CONFIDENCES as readonly string[]).includes(row.confidence)) return null;
    if (!['pending', 'applied', 'dismissed'].includes(row.status)) return null;
    const sources = storedSourcesSchema.safeParse(row.sources);
    return {
      id: row.id,
      artistId: row.artistId,
      field: row.field as VideoSuggestionField,
      value: row.value,
      confidence: row.confidence as SuggestionConfidence,
      sources: sources.success ? sources.data : [],
      note: row.note,
      status: row.status as 'pending' | 'applied' | 'dismissed',
    };
  };

  /** Map a join row onto the wire artist shape with day-precision bornOn. */
  const toStatusArtist = (
    row: VideoArtistWithArtist
  ): VideoEnrichmentStatusResult['artists'][number] => ({
    artistId: row.artistId,
    displayName: displayNameFor(row),
    role: row.role,
    current: {
      firstName: row.artist.firstName,
      middleName: row.artist.middleName,
      surname: row.artist.surname,
      akaNames: row.artist.akaNames,
      displayName: row.artist.displayName,
      bornOn: toIsoDate(row.artist.bornOn) ?? null,
    },
  });

  // ---------------------------------------------------------------------------
  // Suggestion filtering (callback persistence)
  // ---------------------------------------------------------------------------

  /** Day-precision normalization for date-valued strings. */
  const normalizeDay = (value: string): string => value.trim().slice(0, 10);

  /** Case-insensitive trim normalization for text-valued strings. */
  const normalizeText = (value: string): string => value.trim().toLowerCase();

  /** The artist's current value for a suggestion field (null when unset). */
  const currentValueFor = (
    field: VideoSuggestionField,
    current: VideoArtistWithArtist['artist']
  ): string | null => {
    switch (field) {
      case 'firstName':
        return current.firstName;
      case 'middleName':
        return current.middleName;
      case 'surname':
        return current.surname;
      case 'akaNames':
        return current.akaNames;
      case 'displayName':
        return current.displayName;
      case 'bornOn':
        return toIsoDate(current.bornOn) ?? null;
      default:
        return null;
    }
  };

  /** True when the suggested value equals the current one (case-insensitive; day precision for dates). */
  const equalsCurrent = (
    field: VideoSuggestionField,
    value: string,
    current: VideoArtistWithArtist['artist']
  ): boolean => {
    const cur = currentValueFor(field, current);
    if (cur === null) return false;
    return field === 'bornOn'
      ? normalizeDay(cur) === normalizeDay(value)
      : normalizeText(cur) === normalizeText(value);
  };

  /** One applied/dismissed fact from a previous run. */
  type ExistingFact = { artistId: string | null; field: string; value: string };

  /** True when an identical fact was already applied or dismissed (re-run fence). */
  const matchesExistingFact = (
    facts: ExistingFact[],
    artistId: string | null,
    field: string,
    value: string
  ): boolean =>
    facts.some(
      (fact) =>
        fact.artistId === artistId &&
        fact.field === field &&
        normalizeText(fact.value) === normalizeText(value)
    );

  /**
   * Merge incoming aliases into the existing comma list, deduped
   * case-insensitively with the existing entries first — so applying the
   * suggestion replaces the field wholesale without losing current aliases.
   */
  const mergeAkaNames = (existing: string | null, incoming: string): string => {
    const parts = [existing ?? '', incoming]
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(part);
    }
    return merged.join(', ');
  };

  /** JSON-safe copy of a suggestion's sources for the Json column. */
  const toJsonSources = (sources: VideoSuggestion['sources']): Json =>
    sources.map(({ url, label }) => (label === undefined ? { url } : { url, label }));

  /** Prepare one artist suggestion for persistence, or null when filtered out. */
  const prepareSuggestion = (
    suggestion: VideoSuggestion,
    current: VideoArtistWithArtist['artist']
  ): Omit<CreateSuggestionRow, 'artistId'> | null => {
    if (suggestion.field === 'releasedOn') return null; // video-level only
    const value =
      suggestion.field === 'akaNames'
        ? mergeAkaNames(current.akaNames, suggestion.value)
        : suggestion.value.trim();
    if (!value) return null;
    if (equalsCurrent(suggestion.field, value, current)) return null;
    return {
      field: suggestion.field,
      value,
      confidence: suggestion.confidence,
      sources: toJsonSources(suggestion.sources),
      note: suggestion.note ?? null,
    };
  };

  /** Grouped inputs for {@link buildPendingRows} (stays under max-params). */
  interface BuildPendingRowsInput {
    data: VideoEnrichmentData;
    state: VideoEnrichmentState;
    rows: VideoArtistWithArtist[];
    facts: ExistingFact[];
  }

  /**
   * Convert the Lambda's validated payload into pending suggestion rows:
   * drop facts equal to current values, fence facts already applied/dismissed,
   * pre-merge akaNames, and emit the video-level release date only when it
   * differs (day precision) from the admin-entered date.
   */
  const buildPendingRows = ({
    data,
    state,
    rows,
    facts,
  }: BuildPendingRowsInput): CreateSuggestionRow[] => {
    const byArtistId = new Map(rows.map((row) => [row.artistId, row.artist]));
    const out: CreateSuggestionRow[] = [];
    for (const artist of data.artists) {
      const current = byArtistId.get(artist.artistId);
      if (!current) continue; // detached since dispatch
      for (const suggestion of artist.suggestions) {
        const prepared = prepareSuggestion(suggestion, current);
        if (!prepared) continue;
        if (matchesExistingFact(facts, artist.artistId, prepared.field, prepared.value)) continue;
        out.push({ artistId: artist.artistId, ...prepared });
      }
    }
    const releasedOn = data.video?.releasedOn;
    if (
      releasedOn &&
      normalizeDay(releasedOn.value) !== toIsoDate(state.releasedOn) &&
      !matchesExistingFact(facts, null, 'releasedOn', releasedOn.value)
    ) {
      out.push({
        artistId: null,
        field: 'releasedOn',
        value: normalizeDay(releasedOn.value),
        confidence: releasedOn.confidence,
        sources: toJsonSources(releasedOn.sources),
        note: releasedOn.note ?? null,
      });
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Job dispatch helpers
  // ---------------------------------------------------------------------------

  /** Fake/E2E path: one synthetic checkpoint, then persist the fixture. */
  const runFakeEnrichment = async (
    videoId: string,
    rows: VideoArtistWithArtist[]
  ): Promise<void> => {
    await VideoRepository.setEnrichmentProgress(videoId, {
      stage: 'musicbrainz',
      counts: { artists: rows.length },
      at: new Date().toISOString(),
    });
    const data = videoEnrichmentFixture({
      artists: rows.map(({ artistId }) => ({ artistId })),
    });
    await VideoEnrichmentService.completeCallback(videoId, { ok: true, data });
  };

  /** Real path: mint a token, store it, fire the fire-and-forget Event invoke. */
  const dispatchEnrichment = async (
    state: VideoEnrichmentState,
    rows: VideoArtistWithArtist[]
  ): Promise<void> => {
    const base = resolveEnrichmentBaseUrl();
    if (!base) {
      await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
        error: 'Video enrichment callback URL is not configured',
      });
      return;
    }
    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
        error: 'Video enrichment is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      });
      return;
    }
    if (rows.length === 0) {
      await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
        error: 'No linked artists to enrich.',
      });
      return;
    }

    const jobToken = randomUUID();
    await VideoRepository.setEnrichmentJobToken(state.id, jobToken);
    const input: VideoEnrichmentLambdaInput = {
      task: 'video-enrichment',
      videoId: state.id,
      title: state.title,
      artistDisplay: state.artist,
      releasedOn: toIsoDate(state.releasedOn),
      artists: toLambdaArtists(rows),
      callbackUrl: `${base}/api/videos/${state.id}/enrichment/callback`,
      progressUrl: `${base}/api/videos/${state.id}/enrichment/progress`,
      jobToken,
    };
    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(input)),
      });
      await getLambdaClient().send(command);
    } catch (error) {
      logger.error('video_enrichment_invoke_failed', error);
      await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
        error: 'Failed to reach the enrichment generator',
      });
      await VideoRepository.setEnrichmentJobToken(state.id, null);
    }
  };

  /**
   * Service boundary for async video-metadata enrichment. Clones the proven
   * artist-bio pipeline: fire-and-forget Lambda `Event` invoke, single-use
   * per-job token, token-guarded callback/progress channels, and read-time
   * stale-job coercion. In E2E/local dev (`BIO_GENERATOR_FAKE=true`) the run
   * completes in-process from a deterministic fixture.
   */
  export class VideoEnrichmentService {
    /**
     * Split the admin-entered artist string on feat.-markers, find-or-create an
     * Artist shell per name (best-effort — a failed shell is logged and
     * skipped), replace the video's join rows, and drop pending suggestions for
     * artists the re-sync detached (applied/dismissed rows survive as audit).
     */
    static async syncVideoArtists(videoId: string, artistString: string): Promise<void> {
      const parts = splitFeaturedArtists(artistString);
      const previous = await VideoArtistRepository.findByVideoId(videoId);
      const rows: Array<{ artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number }> = [];
      for (const part of parts) {
        try {
          const found = await ArtistService.findOrCreateByName(part.name);
          if (!found.success) {
            logger.warn('video_artist_shell_failed', {
              videoId,
              name: part.name,
              error: found.error,
            });
            continue;
          }
          if (rows.some((row) => row.artistId === found.data.id)) continue;
          rows.push({
            artistId: found.data.id,
            role: part.role === 'primary' ? 'PRIMARY' : 'FEATURED',
            sortOrder: rows.length,
          });
        } catch (error) {
          logger.warn('video_artist_shell_failed', {
            videoId,
            name: part.name,
            error: String(error),
          });
        }
      }
      await VideoArtistRepository.replaceForVideo(videoId, rows);
      const kept = new Set(rows.map((row) => row.artistId));
      const detached = previous
        .map((row) => row.artistId)
        .filter((artistId) => !kept.has(artistId));
      await VideoEnrichmentSuggestionRepository.deletePendingForArtists(videoId, detached);
    }

    /**
     * Run enrichment as a background job. MUSIC-only (others return silently);
     * refuses to double-dispatch while a non-stale job is already `processing`
     * (a `pending` handoff from the trigger action proceeds). The fake/E2E path
     * finishes in-process; the real path fires an Event invoke and leaves the
     * video `processing` for the callback to complete. Never throws — it runs
     * via `after()`, where an unhandled rejection would be lost.
     */
    static async runEnrichmentJob(videoId: string): Promise<void> {
      try {
        const state = await VideoRepository.getEnrichmentState(videoId);
        if (!state || state.category !== 'MUSIC' || isFreshlyProcessing(state)) return;

        await VideoRepository.setEnrichmentStatus(videoId, 'processing', { error: null });
        const rows = await VideoArtistRepository.findByVideoId(videoId);

        if (process.env.BIO_GENERATOR_FAKE === 'true') {
          await runFakeEnrichment(videoId, rows);
          return;
        }
        await dispatchEnrichment(state, rows);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Video enrichment failed unexpectedly.';
        await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: message });
      }
    }

    /**
     * Read the polled enrichment status: 17-minute read-time stale coercion
     * (mirrors the bio pipeline — non-persistent, a late callback can still
     * claim), fresh artist current values, and all suggestion rows. Returns
     * null when the video does not exist.
     */
    static async getEnrichmentStatus(videoId: string): Promise<VideoEnrichmentStatusResult | null> {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state) return null;
      const rows = await VideoArtistRepository.findByVideoId(videoId);
      const stored = await VideoEnrichmentSuggestionRepository.findByVideoId(videoId);

      const rawStatus = toEnrichmentStatus(state.enrichmentStatus);
      const startedAtMs = state.enrichmentStartedAt?.getTime();
      const isStale =
        isInFlightEnrichmentStatus(rawStatus) &&
        startedAtMs !== undefined &&
        Date.now() - startedAtMs > STALE_JOB_MS;
      const status = isStale ? 'failed' : rawStatus;
      const error = isStale ? STALE_JOB_ERROR : (state.enrichmentError ?? null);
      const progress = isInFlightEnrichmentStatus(status)
        ? parseStoredProgress(state.enrichmentProgress)
        : null;

      return {
        status,
        error,
        progress,
        enrichedAt: state.enrichedAt ? state.enrichedAt.toISOString() : null,
        currentReleasedOn: toIsoDate(state.releasedOn) ?? '',
        artists: rows.map(toStatusArtist),
        suggestions: stored
          .map(toStatusSuggestion)
          .filter((row): row is VideoEnrichmentStatusResult['suggestions'][number] => row !== null),
      };
    }

    /**
     * Verify an async completion callback and atomically claim the single-use
     * job token (constant-time compare, then a conditional updateMany that
     * clears the token). Returns false — without touching the token — when the
     * video is missing, the job is not processing, no token is stored, the
     * token mismatches, or another callback already claimed it.
     */
    static async verifyAndClaimCallback(videoId: string, jobToken: string): Promise<boolean> {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state || state.enrichmentStatus !== 'processing' || !state.enrichmentJobToken) {
        return false;
      }
      if (!tokensMatch(state.enrichmentJobToken, jobToken)) {
        return false; // never attempt the claim on a mismatched/forged callback
      }
      return VideoRepository.claimEnrichmentJobToken(videoId, jobToken);
    }

    /**
     * Record a per-stage checkpoint. VERIFIES the per-job token but NEVER
     * claims it (claiming is exclusive to the callback). Writes only while the
     * job is `processing`; the server stamps `at` so the client cannot forge
     * checkpoint times. Errors are logged, never thrown.
     */
    static async recordProgress(
      videoId: string,
      jobToken: string,
      checkpoint: { stage: VideoProgressStage; counts?: Record<string, number> }
    ): Promise<void> {
      try {
        const state = await VideoRepository.getEnrichmentState(videoId);
        if (!state?.enrichmentJobToken) return;
        if (!tokensMatch(state.enrichmentJobToken, jobToken)) return;
        if (state.enrichmentStatus !== 'processing') return;
        await VideoRepository.setEnrichmentProgress(videoId, {
          ...checkpoint,
          at: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('video_enrichment_progress_failed', error);
      }
    }

    /**
     * Complete a claimed job: a non-ok result flips to `failed`; an ok result
     * filters/fences/merges the suggestions (see {@link buildPendingRows}),
     * replaces the pending rows, and flips to `succeeded`. Never throws — it
     * runs post-response via `after()`.
     */
    static async completeCallback(videoId: string, result: VideoEnrichmentResult): Promise<void> {
      if (!result.ok) {
        await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: result.error });
        return;
      }
      try {
        const state = await VideoRepository.getEnrichmentState(videoId);
        if (!state) return;
        const rows = await VideoArtistRepository.findByVideoId(videoId);
        const facts = await VideoEnrichmentSuggestionRepository.findExistingFacts(videoId);
        const pending = buildPendingRows({ data: result.data, state, rows, facts });
        await VideoEnrichmentSuggestionRepository.replacePending(videoId, pending);
        await VideoRepository.setEnrichmentStatus(videoId, 'succeeded', { error: null });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Video enrichment persistence failed.';
        await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: message });
      }
    }
  }
  ```

  Note on import order: `pnpm run lint` auto-sorts; let it fix ordering rather than hand-tuning.

- [ ] **10.9 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/services/video-enrichment-service.spec.ts
  ```

- [ ] **10.10 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/services/video-enrichment-service.ts src/lib/services/video-enrichment-service.spec.ts
  git commit -m "feat(videos): ✨ enrichment service"
  ```

---

### Task 11: API routes + rate-limit tiers + query key

**Files:**

- Modify: `src/lib/config/rate-limit-tiers.ts`
- Modify: `src/lib/query-keys.ts`
- Create: `src/app/api/videos/[id]/enrichment/route.ts` + `route.spec.ts`
- Create: `src/app/api/videos/[id]/enrichment/callback/route.ts` + `route.spec.ts`
- Create: `src/app/api/videos/[id]/enrichment/progress/route.ts` + `route.spec.ts`

**Interfaces:**

- Consumes: `VideoEnrichmentService` (Task 10), `videoEnrichmentCallbackSchema` / `videoEnrichmentProgressPostSchema` (Task 8), `withAdmin` (`@/lib/decorators/with-auth`), `withRateLimit` (`@/lib/decorators/with-rate-limit`), `rateLimit` (`@/lib/utils/rate-limit`), `loggers`.
- Produces:
  - `videoEnrichmentCallbackLimiter` + `VIDEO_ENRICHMENT_CALLBACK_LIMIT = 20`; `videoEnrichmentProgressLimiter` + `VIDEO_ENRICHMENT_PROGRESS_LIMIT = 60` (from `@/lib/config/rate-limit-tiers`)
  - `queryKeys.videos.enrichment: (id: string) => [...queryKeys.videos.all, 'enrichment', id] as const`
  - `GET /api/videos/[id]/enrichment` (admin, force-dynamic, 404 on null, 500 on throw)
  - `POST /api/videos/[id]/enrichment/callback` (rate-limited, 512 KB cap → 413, Zod → 400, verify+claim, persist in `after()`, always 202 otherwise)
  - `POST /api/videos/[id]/enrichment/progress` (rate-limited, 4 KB cap → 413, everything else 202, verify-never-claim)

**Steps:**

- [ ] **11.1 Write the failing GET status route spec.** Create `src/app/api/videos/[id]/enrichment/route.spec.ts`:

  ```ts
  // @vitest-environment node
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { NextRequest } from 'next/server';

  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';

  import { GET } from './route';

  vi.mock('server-only', () => ({}));

  vi.mock('@/lib/decorators/with-auth', () => ({
    withAdmin: (handler: unknown) => handler,
  }));

  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: { getEnrichmentStatus: vi.fn() },
  }));

  const VIDEO_ID = 'f'.repeat(24);
  const request = new NextRequest(`http://localhost/api/videos/${VIDEO_ID}/enrichment`);
  const context = { params: Promise.resolve({ id: VIDEO_ID }) };

  const status = {
    status: 'processing',
    error: null,
    progress: null,
    enrichedAt: null,
    currentReleasedOn: '2021-04-09',
    artists: [],
    suggestions: [],
  };

  describe('GET /api/videos/[id]/enrichment', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns the enrichment status for the video', async () => {
      vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockResolvedValue(status as never);

      const response = await GET(request, context);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(status);
      expect(VideoEnrichmentService.getEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID);
    });

    it('returns 404 when the video does not exist', async () => {
      vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockResolvedValue(null);

      const response = await GET(request, context);

      expect(response.status).toBe(404);
    });

    it('returns 500 when the service throws', async () => {
      vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockRejectedValue(new Error('down'));

      const response = await GET(request, context);

      expect(response.status).toBe(500);
    });
  });
  ```

- [ ] **11.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment/route.spec.ts"
  ```

  Expected failure: `Failed to resolve import "./route"`.

- [ ] **11.3 Implement the tiers, query key, and GET route.** Append to `src/lib/config/rate-limit-tiers.ts`:

  ```ts
  /**
   * Video-enrichment completion callback (server-to-server) — 20 requests per
   * minute. One legitimate POST per dispatched job; the modest cap absorbs
   * Lambda retries while blunting a flood of forged completion callbacks.
   */
  export const videoEnrichmentCallbackLimiter = rateLimit({
    interval: 60 * 1000,
    uniqueTokenPerInterval: 500,
  });
  export const VIDEO_ENRICHMENT_CALLBACK_LIMIT = 20;

  /**
   * Video-enrichment progress channel (server-to-server) — 60 requests per
   * minute. A run POSTs one checkpoint per stage (5 stages), so the higher cap
   * absorbs the cadence plus Lambda retries. Verify-only — it never claims the
   * job token.
   */
  export const videoEnrichmentProgressLimiter = rateLimit({
    interval: 60 * 1000,
    uniqueTokenPerInterval: 500,
  });
  export const VIDEO_ENRICHMENT_PROGRESS_LIMIT = 60;
  ```

  In `src/lib/query-keys.ts`, inside the `videos` block, replace:

  ```ts
      detail: (id: string) => [...queryKeys.videos.all, 'detail', id] as const,
  ```

  with:

  ```ts
      detail: (id: string) => [...queryKeys.videos.all, 'detail', id] as const,
      /** Enrichment status poll — its own key so applies never reset `videos.detail`. */
      enrichment: (id: string) => [...queryKeys.videos.all, 'enrichment', id] as const,
  ```

  Create `src/app/api/videos/[id]/enrichment/route.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import type { NextRequest } from 'next/server';
  import { NextResponse } from 'next/server';

  import { withAdmin } from '@/lib/decorators/with-auth';
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { loggers } from '@/lib/utils/logger';

  export const dynamic = 'force-dynamic';

  /**
   * GET /api/videos/[id]/enrichment
   * Admin-only. Returns the async enrichment status for a video — lifecycle,
   * latest progress checkpoint, fresh artist current values, and all suggestion
   * rows. The admin edit page polls this on its own query key (never
   * `videos.detail`, which would reset the edit form).
   */
  export const GET = withAdmin(
    async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
      try {
        const { id } = await params;

        const status = await VideoEnrichmentService.getEnrichmentStatus(id);
        if (!status) {
          return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        return NextResponse.json(status);
      } catch (error) {
        loggers.media.error('Video enrichment status error', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }
  );
  ```

- [ ] **11.4 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment/route.spec.ts"
  ```

- [ ] **11.5 Write the failing callback route spec.** Create `src/app/api/videos/[id]/enrichment/callback/route.spec.ts` (adapted from the bio callback spec — same scaffold, video service):

  ```ts
  // @vitest-environment node
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { NextRequest } from 'next/server';

  import { POST } from './route';

  const limiterCheckMock = vi.hoisted(() => vi.fn());
  const afterMock = vi.hoisted(() => vi.fn());
  const verifyAndClaimCallbackMock = vi.hoisted(() => vi.fn());
  const completeCallbackMock = vi.hoisted(() => vi.fn());

  // A next/server stub that mirrors the global setup but also exposes `after`,
  // capturing its callback so the "background" work can be run on demand.
  vi.mock('next/server', () => {
    class MockNextRequest extends Request {
      nextUrl: URL;
      constructor(url: string | URL, options?: RequestInit) {
        super(url, options);
        this.nextUrl = new URL(url);
      }
    }
    class MockNextResponse extends Response {}
    Object.assign(MockNextResponse, {
      json: (data: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        json: async () => data,
      }),
    });
    return {
      NextRequest: MockNextRequest,
      NextResponse: MockNextResponse,
      after: (cb: () => Promise<void>) => afterMock(cb),
    };
  });

  vi.mock('@/lib/config/rate-limit-tiers', () => ({
    videoEnrichmentCallbackLimiter: { check: limiterCheckMock },
    VIDEO_ENRICHMENT_CALLBACK_LIMIT: 20,
  }));

  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: {
      verifyAndClaimCallback: (id: string, token: string) => verifyAndClaimCallbackMock(id, token),
      completeCallback: (id: string, result: unknown) => completeCallbackMock(id, result),
    },
  }));

  vi.mock('@/lib/utils/logger', () => ({
    loggers: new Proxy(
      {},
      { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
    ),
  }));

  const VIDEO_ID = 'f'.repeat(24);
  const ARTIST_ID = 'a'.repeat(24);

  const validBody = {
    jobToken: 'stored-token',
    result: {
      ok: true,
      data: {
        artists: [
          {
            artistId: ARTIST_ID,
            suggestions: [
              {
                field: 'bornOn',
                value: '1985-03-15',
                confidence: 'high',
                sources: [{ url: 'https://musicbrainz.org/artist/x' }],
              },
            ],
          },
        ],
        model: 'gemini-2.5-flash',
      },
    },
  };

  const buildRequest = (body: string): NextRequest =>
    new NextRequest(`http://localhost:3000/api/videos/${VIDEO_ID}/enrichment/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.7' },
      body,
    });

  const callRoute = (body: string) =>
    POST(buildRequest(body), { params: Promise.resolve({ id: VIDEO_ID }) });

  beforeEach(() => {
    limiterCheckMock.mockReset().mockResolvedValue(undefined);
    afterMock.mockReset();
    verifyAndClaimCallbackMock.mockReset();
    completeCallbackMock.mockReset().mockResolvedValue(undefined);
  });

  describe('POST /api/videos/[id]/enrichment/callback', () => {
    it('returns 202 when the token claim succeeds', async () => {
      verifyAndClaimCallbackMock.mockResolvedValue(true);

      const response = await callRoute(JSON.stringify(validBody));

      expect(response.status).toBe(202);
    });

    it('runs completeCallback in the background after a successful claim', async () => {
      verifyAndClaimCallbackMock.mockResolvedValue(true);

      await callRoute(JSON.stringify(validBody));
      await afterMock.mock.calls[0][0]();

      expect(completeCallbackMock).toHaveBeenCalledWith(VIDEO_ID, validBody.result);
    });

    it('returns 202 when the token claim fails (anti-enumeration)', async () => {
      verifyAndClaimCallbackMock.mockResolvedValue(false);

      const response = await callRoute(JSON.stringify(validBody));

      expect(response.status).toBe(202);
    });

    it('does not schedule background work when the token claim fails', async () => {
      verifyAndClaimCallbackMock.mockResolvedValue(false);

      await callRoute(JSON.stringify(validBody));

      expect(afterMock).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON with 400', async () => {
      const response = await callRoute('{not json');

      expect(response.status).toBe(400);
    });

    it('rejects an oversized body with 413', async () => {
      const oversized = JSON.stringify({ ...validBody, jobToken: 'x'.repeat(600 * 1024) });

      const response = await callRoute(oversized);

      expect(response.status).toBe(413);
    });

    it('rejects a body that fails the schema with 400', async () => {
      const response = await callRoute(JSON.stringify({ jobToken: '' }));

      expect(response.status).toBe(400);
    });

    it('does not claim when the schema rejects the body', async () => {
      await callRoute(JSON.stringify({ jobToken: '' }));

      expect(verifyAndClaimCallbackMock).not.toHaveBeenCalled();
    });

    it('returns 429 when the rate limit is exceeded', async () => {
      limiterCheckMock.mockRejectedValue(new Error('rate limited'));

      const response = await callRoute(JSON.stringify(validBody));

      expect(response.status).toBe(429);
    });
  });
  ```

- [ ] **11.6 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment/callback/route.spec.ts"
  ```

  Expected failure: `Failed to resolve import "./route"`.

- [ ] **11.7 Implement the callback route.** Create `src/app/api/videos/[id]/enrichment/callback/route.ts` (complete adapted copy of the bio callback route — no slug/revalidation: enrichment writes only suggestion rows, and the admin page must NOT have `videos.detail` invalidated while the form is mounted):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { after, NextResponse } from 'next/server';
  import type { NextRequest } from 'next/server';

  import {
    VIDEO_ENRICHMENT_CALLBACK_LIMIT,
    videoEnrichmentCallbackLimiter,
  } from '@/lib/config/rate-limit-tiers';
  import { withRateLimit } from '@/lib/decorators/with-rate-limit';
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { videoEnrichmentCallbackSchema } from '@/lib/validation/video-enrichment-schema';

  export const dynamic = 'force-dynamic';

  // Suggestions are small rows (≤10 artists × ≤12 facts), but keep parity with
  // the bio callback cap so a drifted Lambda payload is rejected, not truncated.
  const MAX_BODY_BYTES = 512 * 1024;

  /**
   * POST /api/videos/[id]/enrichment/callback
   * The out-of-band completion endpoint the bio-generator Lambda POSTs its
   * video-enrichment result to. Verifies the single-use job token, then runs
   * the suggestion persistence post-response via `after()`. Always answers 202
   * — never revealing whether the token matched — so the endpoint cannot be
   * used to enumerate jobs. No cache revalidation: the admin page polls the
   * enrichment query key, and touching `videos.detail` would reset the form.
   */
  export const POST = withRateLimit<{ id: string }>(
    videoEnrichmentCallbackLimiter,
    VIDEO_ENRICHMENT_CALLBACK_LIMIT
  )(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const parsed = videoEnrichmentCallbackSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid callback' }, { status: 400 });
    }

    const claimed = await VideoEnrichmentService.verifyAndClaimCallback(id, parsed.data.jobToken);
    if (claimed) {
      // Suggestion filtering/persistence runs post-response; the admin poll
      // surfaces completion.
      after(async () => {
        await VideoEnrichmentService.completeCallback(id, parsed.data.result);
      });
    }

    // Always 202 — never reveal whether the token matched (anti-enumeration).
    return new NextResponse(null, { status: 202 });
  });
  ```

- [ ] **11.8 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment/callback/route.spec.ts"
  ```

- [ ] **11.9 Write the failing progress route spec.** Create `src/app/api/videos/[id]/enrichment/progress/route.spec.ts`:

  ```ts
  // @vitest-environment node
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { NextRequest } from 'next/server';

  import { POST } from './route';

  const limiterCheckMock = vi.hoisted(() => vi.fn());
  const recordProgressMock = vi.hoisted(() => vi.fn());

  vi.mock('next/server', () => {
    class MockNextRequest extends Request {
      nextUrl: URL;
      constructor(url: string | URL, options?: RequestInit) {
        super(url, options);
        this.nextUrl = new URL(url);
      }
    }
    class MockNextResponse extends Response {}
    Object.assign(MockNextResponse, {
      json: (data: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        json: async () => data,
      }),
    });
    return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
  });

  vi.mock('@/lib/config/rate-limit-tiers', () => ({
    videoEnrichmentProgressLimiter: { check: limiterCheckMock },
    VIDEO_ENRICHMENT_PROGRESS_LIMIT: 60,
  }));

  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: {
      recordProgress: (id: string, token: string, checkpoint: unknown) =>
        recordProgressMock(id, token, checkpoint),
    },
  }));

  vi.mock('@/lib/utils/logger', () => ({
    loggers: new Proxy(
      {},
      { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
    ),
  }));

  const VIDEO_ID = 'f'.repeat(24);

  const buildRequest = (body: string): NextRequest =>
    new NextRequest(`http://localhost:3000/api/videos/${VIDEO_ID}/enrichment/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.7' },
      body,
    });

  const callRoute = (body: string) =>
    POST(buildRequest(body), { params: Promise.resolve({ id: VIDEO_ID }) });

  beforeEach(() => {
    limiterCheckMock.mockReset().mockResolvedValue(undefined);
    recordProgressMock.mockReset().mockResolvedValue(undefined);
  });

  describe('POST /api/videos/[id]/enrichment/progress', () => {
    it('records a valid checkpoint and answers 202', async () => {
      const response = await callRoute(
        JSON.stringify({ jobToken: 't', stage: 'wikidata', counts: { artists: 1 } })
      );

      expect(response.status).toBe(202);
      expect(recordProgressMock).toHaveBeenCalledWith(VIDEO_ID, 't', {
        stage: 'wikidata',
        counts: { artists: 1 },
      });
    });

    it('silently accepts malformed JSON with 202 (anti-enumeration)', async () => {
      const response = await callRoute('{not json');

      expect(response.status).toBe(202);
    });

    it('records nothing for a schema-rejected body but still answers 202', async () => {
      const response = await callRoute(JSON.stringify({ jobToken: 't', stage: 'drafting' }));

      expect(response.status).toBe(202);
      expect(recordProgressMock).not.toHaveBeenCalled();
    });

    it('rejects an oversized body with 413', async () => {
      const response = await callRoute(
        JSON.stringify({ jobToken: 'x'.repeat(5 * 1024), stage: 'wikidata' })
      );

      expect(response.status).toBe(413);
    });

    it('returns 429 when the rate limit is exceeded', async () => {
      limiterCheckMock.mockRejectedValue(new Error('rate limited'));

      const response = await callRoute(JSON.stringify({ jobToken: 't', stage: 'wikidata' }));

      expect(response.status).toBe(429);
    });
  });
  ```

- [ ] **11.10 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment/progress/route.spec.ts"
  ```

  Expected failure: `Failed to resolve import "./route"`.

- [ ] **11.11 Implement the progress route.** Create `src/app/api/videos/[id]/enrichment/progress/route.ts` (complete adapted copy of the bio progress route):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { NextResponse } from 'next/server';
  import type { NextRequest } from 'next/server';

  import {
    VIDEO_ENRICHMENT_PROGRESS_LIMIT,
    videoEnrichmentProgressLimiter,
  } from '@/lib/config/rate-limit-tiers';
  import { withRateLimit } from '@/lib/decorators/with-rate-limit';
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { loggers } from '@/lib/utils/logger';
  import { videoEnrichmentProgressPostSchema } from '@/lib/validation/video-enrichment-schema';

  export const dynamic = 'force-dynamic';

  // A checkpoint is a stage + a small counts map — kilobytes at most.
  const MAX_BODY_BYTES = 4 * 1024;

  /**
   * POST /api/videos/[id]/enrichment/progress
   * The out-of-band channel the bio-generator Lambda POSTs per-stage
   * video-enrichment checkpoints to. Mirrors the completion callback route,
   * with one crucial difference: it VERIFIES the per-job token but NEVER
   * claims it (claiming stays exclusive to the callback), so a stream of
   * progress POSTs can never consume the single-use token. Only an oversized
   * body is rejected (413); every other rejection — malformed JSON, schema
   * failure, bad token, non-processing status — answers 202 with no write
   * (anti-enumeration parity with the callback route).
   */
  export const POST = withRateLimit<{ id: string }>(
    videoEnrichmentProgressLimiter,
    VIDEO_ENRICHMENT_PROGRESS_LIMIT
  )(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      // Silently accept — never reveal a parse failure (anti-enumeration).
      return new NextResponse(null, { status: 202 });
    }

    const parsed = videoEnrichmentProgressPostSchema.safeParse(json);
    if (parsed.success) {
      const { jobToken, stage, counts } = parsed.data;
      // recordProgress verifies the token and no-ops on any gate failure; it
      // never throws, never claims the job, and stamps `at` server-side.
      await VideoEnrichmentService.recordProgress(id, jobToken, {
        stage,
        ...(counts ? { counts } : {}),
      });
    } else {
      // Log the Zod issue summary (code + path + message only — never the raw
      // body) so drifted Lambda payloads surface without leaking input data.
      loggers.media.warn('video_enrichment_progress_schema_rejected', {
        issues: parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })),
      });
    }

    // Always 202 — never reveal whether the checkpoint was recorded.
    return new NextResponse(null, { status: 202 });
  });
  ```

- [ ] **11.12 Run all three route specs, expect PASS.**

  ```bash
  pnpm exec vitest run "src/app/api/videos/[id]/enrichment"
  ```

- [ ] **11.13 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/config/rate-limit-tiers.ts src/lib/query-keys.ts "src/app/api/videos/[id]/enrichment"
  git commit -m "feat(videos): ✨ enrichment routes + tiers"
  ```

---

### Task 12: Run-enrichment server action

**Files:**

- Create: `src/lib/actions/run-video-enrichment-action.ts` + `run-video-enrichment-action.spec.ts`

**Interfaces:**

- Consumes: `requireRole` (`@/lib/utils/auth/require-role`), `logSecurityEvent` (`@/utils/audit-log` — event `'media.video.updated'` exists in the `AuditEvent` union), `VideoRepository.getEnrichmentState` + `.setEnrichmentStatus` (Task 7), `VideoProbeService.probeAndPersist` (Part A), `VideoEnrichmentService.runEnrichmentJob` (Task 10), `objectIdSchema`, `STALE_JOB_MS`, `isInFlightEnrichmentStatus`, `RunVideoEnrichmentActionResult` (Task 8), `after` (`next/server`).
- Produces: `runVideoEnrichmentAction(videoId: string): Promise<RunVideoEnrichmentActionResult>` — the result shape matches `generateArtistBioAction` exactly (`{ success: true; status } | { success: false; error }`).

**Steps:**

- [ ] **12.1 Write the failing action spec.** Create `src/lib/actions/run-video-enrichment-action.spec.ts`:

  ```ts
  // @vitest-environment node
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  import type { VideoEnrichmentState } from '@/lib/types/domain/video-enrichment';
  import { requireRole } from '@/lib/utils/auth/require-role';
  import { logSecurityEvent } from '@/utils/audit-log';

  import { runVideoEnrichmentAction } from './run-video-enrichment-action';

  const afterMock = vi.hoisted(() => vi.fn());

  vi.mock('server-only', () => ({}));
  vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => afterMock(cb) }));
  vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
  vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));
  vi.mock('@/lib/repositories/video-repository', () => ({
    VideoRepository: { getEnrichmentState: vi.fn(), setEnrichmentStatus: vi.fn() },
  }));
  vi.mock('@/lib/services/video-enrichment-service', () => ({
    VideoEnrichmentService: { runEnrichmentJob: vi.fn() },
  }));
  vi.mock('@/lib/services/video-probe-service', () => ({
    VideoProbeService: { probeAndPersist: vi.fn() },
  }));
  vi.mock('@/lib/utils/logger', () => ({
    loggers: new Proxy(
      {},
      { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
    ),
  }));

  const VIDEO_ID = 'f'.repeat(24);

  const baseState = (overrides: Partial<VideoEnrichmentState> = {}): VideoEnrichmentState => ({
    id: VIDEO_ID,
    enrichmentStatus: null,
    enrichmentError: null,
    enrichmentStartedAt: null,
    enrichmentJobToken: null,
    enrichmentProgress: null,
    enrichedAt: null,
    category: 'MUSIC',
    artist: 'Ceschi',
    title: 'Bite Through Stone',
    releasedOn: new Date('2021-04-09T00:00:00.000Z'),
    s3Key: 'media/videos/abc.mp4',
    ...overrides,
  });

  beforeEach(() => {
    afterMock.mockReset();
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: 'admin-1', role: 'admin' },
    } as never);
    vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(baseState());
    vi.mocked(VideoRepository.setEnrichmentStatus).mockResolvedValue(undefined);
    vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
    vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
  });

  describe('runVideoEnrichmentAction', () => {
    it('rejects when the caller is not an admin', async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

      await expect(runVideoEnrichmentAction(VIDEO_ID)).rejects.toThrow('Unauthorized');
    });

    it('rejects a malformed video id', async () => {
      const result = await runVideoEnrichmentAction('not-an-object-id');

      expect(result).toEqual({ success: false, error: 'Invalid video id.' });
    });

    it('returns an error when the video does not exist', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(null);

      const result = await runVideoEnrichmentAction(VIDEO_ID);

      expect(result).toEqual({ success: false, error: 'Video not found.' });
    });

    it('echoes a fresh in-flight status instead of double-triggering', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({ enrichmentStatus: 'processing', enrichmentStartedAt: new Date() })
      );

      const result = await runVideoEnrichmentAction(VIDEO_ID);

      expect(result).toEqual({ success: true, status: 'processing' });
      expect(VideoRepository.setEnrichmentStatus).not.toHaveBeenCalled();
    });

    it('supersedes a stale in-flight job', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockResolvedValue(
        baseState({
          enrichmentStatus: 'processing',
          enrichmentStartedAt: new Date(Date.now() - 18 * 60 * 1000),
        })
      );

      const result = await runVideoEnrichmentAction(VIDEO_ID);

      expect(result).toEqual({ success: true, status: 'pending' });
    });

    it('marks the job pending and schedules the probe + enrichment after the response', async () => {
      const result = await runVideoEnrichmentAction(VIDEO_ID);

      expect(result).toEqual({ success: true, status: 'pending' });
      expect(VideoRepository.setEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID, 'pending');
      await afterMock.mock.calls[0][0]();
      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(VIDEO_ID);
      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(VIDEO_ID);
    });

    it('still runs enrichment when the probe fails (probe never blocks)', async () => {
      vi.mocked(VideoProbeService.probeAndPersist).mockRejectedValue(new Error('ffprobe missing'));

      await runVideoEnrichmentAction(VIDEO_ID);
      await afterMock.mock.calls[0][0]();

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(VIDEO_ID);
    });

    it('audits the accepted trigger', async () => {
      await runVideoEnrichmentAction(VIDEO_ID);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.video.updated',
        userId: 'admin-1',
        metadata: { videoId: VIDEO_ID, action: 'enrichment-triggered' },
      });
    });

    it('returns a typed error when the state read throws', async () => {
      vi.mocked(VideoRepository.getEnrichmentState).mockRejectedValue(new Error('db down'));

      const result = await runVideoEnrichmentAction(VIDEO_ID);

      expect(result).toEqual({
        success: false,
        error: 'Video enrichment failed to start. Please try again.',
      });
    });
  });
  ```

- [ ] **12.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/actions/run-video-enrichment-action.spec.ts
  ```

  Expected failure: `Failed to resolve import "./run-video-enrichment-action"`.

- [ ] **12.3 Implement the action.** Create `src/lib/actions/run-video-enrichment-action.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use server';

  import 'server-only';

  import { after } from 'next/server';

  import { VideoRepository } from '@/lib/repositories/video-repository';
  import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
  import { VideoProbeService } from '@/lib/services/video-probe-service';
  import { requireRole } from '@/lib/utils/auth/require-role';
  import { loggers } from '@/lib/utils/logger';
  import { objectIdSchema } from '@/lib/validation/bio-generation-schema';
  import {
    isInFlightEnrichmentStatus,
    STALE_JOB_MS,
    type EnrichmentStatus,
    type RunVideoEnrichmentActionResult,
  } from '@/lib/validation/video-enrichment-schema';
  import { logSecurityEvent } from '@/utils/audit-log';

  const logger = loggers.media;

  /**
   * If an enrichment job is genuinely in flight (`pending`/`processing`) and not
   * yet stale, return that status so the caller echoes it instead of starting a
   * duplicate run; otherwise null (mirrors `resolveInFlightBioStatus`).
   */
  const resolveInFlightEnrichmentStatus = (state: {
    enrichmentStatus: string | null;
    enrichmentStartedAt: Date | null;
  }): EnrichmentStatus | null => {
    const inFlight = isInFlightEnrichmentStatus(state.enrichmentStatus);
    const startedAt = state.enrichmentStartedAt?.getTime() ?? 0;
    const isStale = Date.now() - startedAt > STALE_JOB_MS;
    if (inFlight && !isStale) {
      return state.enrichmentStatus === 'processing' ? 'processing' : 'pending';
    }
    return null;
  };

  /**
   * The heavy probe → enrich flow, run via `after()` once the response is sent.
   * The probe is best-effort — a failure is logged and never blocks enrichment
   * (probe errors persist on the video row for the admin to see). The service
   * gates MUSIC-only and records its own terminal status; neither call throws.
   */
  const runEnrichmentAfterResponse = async (videoId: string): Promise<void> => {
    try {
      await VideoProbeService.probeAndPersist(videoId);
    } catch (error) {
      logger.warn('video_probe_rerun_failed', { videoId, error: String(error) });
    }
    await VideoEnrichmentService.runEnrichmentJob(videoId);
  };

  /**
   * Triggers (or re-triggers) async probe + web enrichment for a video.
   * Admin-only. Marks the job `pending`, schedules the heavy work via `after()`,
   * and returns immediately; the admin page polls the enrichment endpoint. A
   * run already in flight (and not stale) is not duplicated.
   *
   * @param videoId - The video to probe and enrich.
   * @returns `{ success, status }` once accepted, or a typed error.
   */
  export const runVideoEnrichmentAction = async (
    videoId: string
  ): Promise<RunVideoEnrichmentActionResult> => {
    const session = await requireRole('admin');

    const parsedId = objectIdSchema.safeParse(videoId);
    if (!parsedId.success) {
      return { success: false, error: 'Invalid video id.' };
    }

    try {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state) {
        return { success: false, error: 'Video not found.' };
      }

      // Don't start a second run while one is genuinely in flight.
      const inFlightStatus = resolveInFlightEnrichmentStatus(state);
      if (inFlightStatus) {
        return { success: true, status: inFlightStatus };
      }

      await VideoRepository.setEnrichmentStatus(videoId, 'pending');

      after(() => runEnrichmentAfterResponse(videoId));

      // Audit the accepted trigger — completion is out-of-band (Lambda callback).
      logSecurityEvent({
        event: 'media.video.updated',
        userId: session.user.id,
        metadata: { videoId, action: 'enrichment-triggered' },
      });

      return { success: true, status: 'pending' };
    } catch (error) {
      logger.error('Unexpected error triggering video enrichment', {
        videoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: 'Video enrichment failed to start. Please try again.' };
    }
  };
  ```

- [ ] **12.4 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/actions/run-video-enrichment-action.spec.ts
  ```

- [ ] **12.5 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/actions/run-video-enrichment-action.ts src/lib/actions/run-video-enrichment-action.spec.ts
  git commit -m "feat(videos): ✨ run-enrichment action"
  ```

---

### Task 13: Apply/dismiss-suggestion server action (+ typed artist field write)

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts` + `artist-repository.spec.ts` (add `updateEnrichedField`)
- Modify: `src/lib/services/artist-service.ts` + `artist-service.spec.ts` (add `applyEnrichedField`)
- Create: `src/lib/actions/apply-video-suggestion-action.ts` + `apply-video-suggestion-action.spec.ts`

**Interfaces:**

- Consumes: `VideoEnrichmentSuggestionRepository` (Task 7), `VideoArtistRepository.findByVideoId` (Task 7), `applyVideoSuggestionInputSchema` + `ApplyVideoSuggestionActionResult` (Task 8), `requireRole`, `logSecurityEvent` (`'media.artist.updated'` / `'media.video.updated'`), `revalidatePath` (`next/cache`).
- Produces:
  - `ArtistRepository.updateEnrichedField(artistId: string, data: EnrichedArtistFieldUpdate, updatedBy: string): Promise<void>` with `interface EnrichedArtistFieldUpdate { firstName?: string; middleName?: string; surname?: string; akaNames?: string; displayName?: string; bornOn?: Date }`
  - `ArtistService.applyEnrichedField(artistId: string, field: 'firstName' | 'middleName' | 'surname' | 'akaNames' | 'displayName' | 'bornOn', value: string, updatedBy: string): Promise<void>` (bornOn → `new Date(value)`)
  - `applyVideoSuggestionAction(input: unknown): Promise<ApplyVideoSuggestionActionResult>`

**Steps:**

- [ ] **13.1 Write the failing repository test.** In `src/lib/repositories/artist-repository.spec.ts`, append inside the top-level `describe` (the file already mocks `@/lib/prisma`; if `artist.update` is not yet in its mock factory, add `update: vi.fn()` there):

  ```ts
  describe('updateEnrichedField', () => {
    it('writes the single typed field plus the auditing updatedBy', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);

      await ArtistRepository.updateEnrichedField(
        'a'.repeat(24),
        { bornOn: new Date('1985-03-15T00:00:00.000Z') },
        'admin-1'
      );

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a'.repeat(24) },
        data: { bornOn: new Date('1985-03-15T00:00:00.000Z'), updatedBy: 'admin-1' },
      });
    });
  });
  ```

- [ ] **13.2 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts
  ```

  Expected failure: `TypeError: ArtistRepository.updateEnrichedField is not a function`.

- [ ] **13.3 Implement the repository method.** In `src/lib/repositories/artist-repository.ts`, add above the class (next to the other exported interfaces):

  ```ts
  /**
   * The one-field update shapes the enrichment Apply flow may write. A
   * suggestion's `field` maps onto this through an explicit whitelist switch in
   * `ArtistService.applyEnrichedField` — never a dynamic Prisma key.
   */
  export interface EnrichedArtistFieldUpdate {
    firstName?: string;
    middleName?: string;
    surname?: string;
    akaNames?: string;
    displayName?: string;
    bornOn?: Date;
  }
  ```

  and add inside `class ArtistRepository` (after `connectToRelease`):

  ```ts
    /** Applies one whitelisted enriched field, stamping `updatedBy` for audit. */
    static async updateEnrichedField(
      artistId: string,
      data: EnrichedArtistFieldUpdate,
      updatedBy: string
    ): Promise<void> {
      await runQuery(() =>
        prisma.artist.update({ where: { id: artistId }, data: { ...data, updatedBy } })
      );
    }
  ```

- [ ] **13.4 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts
  ```

- [ ] **13.5 Write the failing service test.** In `src/lib/services/artist-service.spec.ts`, append inside the top-level `describe` (the file already mocks `@/lib/repositories/artist-repository`; add `updateEnrichedField: vi.fn()` to the `ArtistRepository` mock factory):

  ```ts
  describe('applyEnrichedField', () => {
    it('maps a text field through the whitelist switch', async () => {
      vi.mocked(ArtistRepository.updateEnrichedField).mockResolvedValue(undefined);

      await ArtistService.applyEnrichedField('a'.repeat(24), 'surname', 'Ramos', 'admin-1');

      expect(ArtistRepository.updateEnrichedField).toHaveBeenCalledWith(
        'a'.repeat(24),
        { surname: 'Ramos' },
        'admin-1'
      );
    });

    it('parses bornOn into a Date', async () => {
      vi.mocked(ArtistRepository.updateEnrichedField).mockResolvedValue(undefined);

      await ArtistService.applyEnrichedField('a'.repeat(24), 'bornOn', '1985-03-15', 'admin-1');

      expect(ArtistRepository.updateEnrichedField).toHaveBeenCalledWith(
        'a'.repeat(24),
        { bornOn: new Date('1985-03-15') },
        'admin-1'
      );
    });
  });
  ```

- [ ] **13.6 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/services/artist-service.spec.ts
  ```

  Expected failure: `TypeError: ArtistService.applyEnrichedField is not a function`.

- [ ] **13.7 Implement the service method.** In `src/lib/services/artist-service.ts`, extend the repository import:

  ```ts
  import {
    ArtistRepository,
    type BioImageRehostRow,
    type EnrichedArtistFieldUpdate,
  } from '@/lib/repositories/artist-repository';
  ```

  add the whitelist union + builder above the class (module scope):

  ```ts
  /** The artist fields a video-enrichment suggestion may apply. */
  export type ArtistEnrichedField =
    | 'firstName'
    | 'middleName'
    | 'surname'
    | 'akaNames'
    | 'displayName'
    | 'bornOn';

  /**
   * Explicit whitelist switch mapping a suggestion field onto a typed one-field
   * update — never a dynamic key. `bornOn` values arrive as YYYY-MM-DD and
   * parse as UTC midnight.
   */
  const buildEnrichedFieldUpdate = (
    field: ArtistEnrichedField,
    value: string
  ): EnrichedArtistFieldUpdate => {
    switch (field) {
      case 'firstName':
        return { firstName: value };
      case 'middleName':
        return { middleName: value };
      case 'surname':
        return { surname: value };
      case 'akaNames':
        return { akaNames: value };
      case 'displayName':
        return { displayName: value };
      case 'bornOn':
        return { bornOn: new Date(value) };
    }
  };
  ```

  and add inside `class ArtistService` (after `existsById`):

  ```ts
    /**
     * Applies one admin-approved enrichment suggestion to the artist record
     * through the field whitelist. Throws on a repository failure — the calling
     * action maps that to a typed error.
     */
    static async applyEnrichedField(
      artistId: string,
      field: ArtistEnrichedField,
      value: string,
      updatedBy: string
    ): Promise<void> {
      await ArtistRepository.updateEnrichedField(
        artistId,
        buildEnrichedFieldUpdate(field, value),
        updatedBy
      );
    }
  ```

- [ ] **13.8 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/services/artist-service.spec.ts
  ```

- [ ] **13.9 Write the failing action spec.** Create `src/lib/actions/apply-video-suggestion-action.spec.ts`:

  ```ts
  // @vitest-environment node
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { revalidatePath } from 'next/cache';

  import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
  import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
  import { ArtistService } from '@/lib/services/artist-service';
  import type { VideoEnrichmentSuggestionRecord } from '@/lib/types/domain/video-enrichment';
  import { requireRole } from '@/lib/utils/auth/require-role';
  import { logSecurityEvent } from '@/utils/audit-log';

  import { applyVideoSuggestionAction } from './apply-video-suggestion-action';

  vi.mock('server-only', () => ({}));
  vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
  vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
  vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));
  vi.mock('@/lib/repositories/video-enrichment-suggestion-repository', () => ({
    VideoEnrichmentSuggestionRepository: {
      findById: vi.fn(),
      markApplied: vi.fn(),
      markDismissed: vi.fn(),
    },
  }));
  vi.mock('@/lib/repositories/video-artist-repository', () => ({
    VideoArtistRepository: { findByVideoId: vi.fn() },
  }));
  vi.mock('@/lib/services/artist-service', () => ({
    ArtistService: { applyEnrichedField: vi.fn() },
  }));
  vi.mock('@/lib/utils/logger', () => ({
    loggers: new Proxy(
      {},
      { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
    ),
  }));

  const VIDEO_ID = 'f'.repeat(24);
  const ARTIST_ID = 'a'.repeat(24);
  const SUGGESTION_ID = 'c'.repeat(24);

  const suggestion = (
    overrides: Partial<VideoEnrichmentSuggestionRecord> = {}
  ): VideoEnrichmentSuggestionRecord => ({
    id: SUGGESTION_ID,
    videoId: VIDEO_ID,
    artistId: ARTIST_ID,
    field: 'bornOn',
    value: '1985-03-15',
    confidence: 'high',
    sources: [],
    note: null,
    status: 'pending',
    appliedAt: null,
    appliedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const artistRow = {
    artistId: ARTIST_ID,
    role: 'PRIMARY' as const,
    sortOrder: 0,
    artist: {
      displayName: 'Ceschi',
      firstName: 'Francisco',
      middleName: null,
      surname: 'Ramos',
      akaNames: null,
      bornOn: new Date('1980-01-02T00:00:00.000Z'),
    },
  };

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as never);
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(suggestion());
    vi.mocked(VideoEnrichmentSuggestionRepository.markApplied).mockResolvedValue(true);
    vi.mocked(VideoEnrichmentSuggestionRepository.markDismissed).mockResolvedValue(true);
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow]);
    vi.mocked(ArtistService.applyEnrichedField).mockResolvedValue(undefined);
  });

  describe('applyVideoSuggestionAction', () => {
    it('rejects invalid input', async () => {
      const result = await applyVideoSuggestionAction({ suggestionId: 'nope', op: 'apply' });

      expect(result).toEqual({ success: false, error: 'Invalid suggestion request.' });
    });

    it('dismisses a pending suggestion', async () => {
      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'dismiss',
      });

      expect(result).toEqual({ success: true, op: 'dismiss' });
      expect(VideoEnrichmentSuggestionRepository.markDismissed).toHaveBeenCalledWith(SUGGESTION_ID);
    });

    it('reports an already-resolved dismiss', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.markDismissed).mockResolvedValue(false);

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'dismiss',
      });

      expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
    });

    it('applies a pending artist suggestion through the field whitelist', async () => {
      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({ success: true, op: 'apply' });
      expect(ArtistService.applyEnrichedField).toHaveBeenCalledWith(
        ARTIST_ID,
        'bornOn',
        '1985-03-15',
        'admin-1'
      );
      expect(VideoEnrichmentSuggestionRepository.markApplied).toHaveBeenCalledWith(
        SUGGESTION_ID,
        'admin-1'
      );
    });

    it('refuses to server-apply a releasedOn suggestion (client-side only)', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
        suggestion({ artistId: null, field: 'releasedOn', value: '2020-06-01' })
      );

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({
        success: false,
        error: 'The release date applies in the edit form, not on the server.',
      });
      expect(ArtistService.applyEnrichedField).not.toHaveBeenCalled();
    });

    it('refuses a non-pending suggestion', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
        suggestion({ status: 'applied' })
      );

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
    });

    it('conflicts when expectedCurrent no longer matches (day-precision dates)', async () => {
      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
        expectedCurrent: '1979-12-31',
      });

      expect(result).toEqual({
        success: false,
        error: 'The current value has changed — review before applying.',
      });
      expect(ArtistService.applyEnrichedField).not.toHaveBeenCalled();
    });

    it('applies when expectedCurrent matches the current value', async () => {
      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
        expectedCurrent: '1980-01-02',
      });

      expect(result).toEqual({ success: true, op: 'apply' });
    });

    it('conflicts when expectedCurrent is null but the field now has a value', async () => {
      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
        expectedCurrent: null,
      });

      expect(result).toEqual({
        success: false,
        error: 'The current value has changed — review before applying.',
      });
    });

    it('errors when the artist is no longer linked to the video', async () => {
      vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({
        success: false,
        error: 'Artist is no longer linked to this video.',
      });
    });

    it('reports already-resolved when the atomic markApplied loses the race', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.markApplied).mockResolvedValue(false);

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
    });

    it('audits and revalidates the admin paths after an apply', async () => {
      await applyVideoSuggestionAction({ suggestionId: SUGGESTION_ID, op: 'apply' });

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.artist.updated',
        userId: 'admin-1',
        metadata: {
          artistId: ARTIST_ID,
          videoId: VIDEO_ID,
          field: 'bornOn',
          action: 'enrichment-suggestion-applied',
        },
      });
      expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
    });

    it('returns a typed error when a repository throws', async () => {
      vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockRejectedValue(
        new Error('db down')
      );

      const result = await applyVideoSuggestionAction({
        suggestionId: SUGGESTION_ID,
        op: 'apply',
      });

      expect(result).toEqual({
        success: false,
        error: 'Suggestion update failed. Please try again.',
      });
    });
  });
  ```

- [ ] **13.10 Run it, expect FAIL.**

  ```bash
  pnpm exec vitest run src/lib/actions/apply-video-suggestion-action.spec.ts
  ```

  Expected failure: `Failed to resolve import "./apply-video-suggestion-action"`.

- [ ] **13.11 Implement the action.** Create `src/lib/actions/apply-video-suggestion-action.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use server';

  import 'server-only';

  import { revalidatePath } from 'next/cache';

  import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
  import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
  import { ArtistService, type ArtistEnrichedField } from '@/lib/services/artist-service';
  import type { VideoEnrichmentSuggestionRecord } from '@/lib/types/domain/video-enrichment';
  import { requireRole } from '@/lib/utils/auth/require-role';
  import { loggers } from '@/lib/utils/logger';
  import {
    applyVideoSuggestionInputSchema,
    type ApplyVideoSuggestionActionResult,
  } from '@/lib/validation/video-enrichment-schema';
  import { logSecurityEvent } from '@/utils/audit-log';

  import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';

  const logger = loggers.media;

  const ALREADY_RESOLVED: ApplyVideoSuggestionActionResult = {
    success: false,
    error: 'Suggestion was already resolved.',
  };

  const CURRENT_DRIFTED: ApplyVideoSuggestionActionResult = {
    success: false,
    error: 'The current value has changed — review before applying.',
  };

  /** The artist fields the server may apply (releasedOn stays client-side). */
  const ARTIST_FIELDS: readonly ArtistEnrichedField[] = [
    'firstName',
    'middleName',
    'surname',
    'akaNames',
    'displayName',
    'bornOn',
  ];

  /** Narrow a stored suggestion field to the applyable whitelist, or null. */
  const toArtistField = (field: string): ArtistEnrichedField | null =>
    (ARTIST_FIELDS as readonly string[]).includes(field) ? (field as ArtistEnrichedField) : null;

  /** The artist's current value for a field, normalized for comparison
   *  (dates → YYYY-MM-DD, strings trimmed; null when unset/blank). */
  const normalizedCurrentValue = (
    field: ArtistEnrichedField,
    current: VideoArtistWithArtist['artist']
  ): string | null => {
    if (field === 'bornOn') {
      return current.bornOn ? current.bornOn.toISOString().slice(0, 10) : null;
    }
    const raw =
      field === 'firstName'
        ? current.firstName
        : field === 'middleName'
          ? current.middleName
          : field === 'surname'
            ? current.surname
            : field === 'akaNames'
              ? current.akaNames
              : current.displayName;
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  };

  /**
   * Optimistic-concurrency check: with `expectedCurrent` provided (null =
   * "field was empty"), the normalized current value must still match; when
   * omitted (undefined), the check is skipped.
   */
  const hasCurrentDrift = (
    field: ArtistEnrichedField,
    current: VideoArtistWithArtist['artist'],
    expectedCurrent: string | null | undefined
  ): boolean => {
    if (expectedCurrent === undefined) return false;
    const actual = normalizedCurrentValue(field, current);
    const expected = expectedCurrent === null ? null : expectedCurrent.trim() || null;
    return actual !== expected;
  };

  const revalidateSuggestionPaths = (): void => {
    revalidatePath('/admin/videos');
    revalidatePath('/admin/artists');
  };

  const dismissSuggestion = async (
    suggestionId: string,
    userId: string
  ): Promise<ApplyVideoSuggestionActionResult> => {
    const dismissed = await VideoEnrichmentSuggestionRepository.markDismissed(suggestionId);
    if (!dismissed) return ALREADY_RESOLVED;
    logSecurityEvent({
      event: 'media.video.updated',
      userId,
      metadata: { suggestionId, action: 'enrichment-suggestion-dismissed' },
    });
    revalidateSuggestionPaths();
    return { success: true, op: 'dismiss' };
  };

  /** Load + gate the pending suggestion, its whitelist field, and artist id. */
  const loadApplicableSuggestion = async (
    suggestionId: string
  ): Promise<
    | {
        ok: true;
        suggestion: VideoEnrichmentSuggestionRecord;
        field: ArtistEnrichedField;
        artistId: string;
      }
    | { ok: false; result: ApplyVideoSuggestionActionResult }
  > => {
    const suggestion = await VideoEnrichmentSuggestionRepository.findById(suggestionId);
    if (!suggestion || suggestion.status !== 'pending') {
      return { ok: false, result: ALREADY_RESOLVED };
    }
    if (suggestion.field === 'releasedOn') {
      return {
        ok: false,
        result: {
          success: false,
          error: 'The release date applies in the edit form, not on the server.',
        },
      };
    }
    const field = toArtistField(suggestion.field);
    const { artistId } = suggestion;
    if (!field || !artistId) {
      return { ok: false, result: { success: false, error: 'Unsupported suggestion field.' } };
    }
    return { ok: true, suggestion, field, artistId };
  };

  const applySuggestion = async (
    suggestionId: string,
    expectedCurrent: string | null | undefined,
    userId: string
  ): Promise<ApplyVideoSuggestionActionResult> => {
    const loaded = await loadApplicableSuggestion(suggestionId);
    if (!loaded.ok) return loaded.result;
    const { suggestion, field, artistId } = loaded;

    const rows = await VideoArtistRepository.findByVideoId(suggestion.videoId);
    const current = rows.find((row) => row.artistId === artistId)?.artist;
    if (!current) {
      return { success: false, error: 'Artist is no longer linked to this video.' };
    }
    if (hasCurrentDrift(field, current, expectedCurrent)) {
      return CURRENT_DRIFTED;
    }

    await ArtistService.applyEnrichedField(artistId, field, suggestion.value, userId);
    const applied = await VideoEnrichmentSuggestionRepository.markApplied(suggestionId, userId);
    if (!applied) return ALREADY_RESOLVED;

    logSecurityEvent({
      event: 'media.artist.updated',
      userId,
      metadata: {
        artistId,
        videoId: suggestion.videoId,
        field,
        action: 'enrichment-suggestion-applied',
      },
    });
    revalidateSuggestionPaths();
    return { success: true, op: 'apply' };
  };

  /**
   * Applies or dismisses one enrichment suggestion. Admin-only. Applies go
   * through the artist field whitelist with an `expectedCurrent`
   * optimistic-concurrency guard; the video-level release date is never
   * server-applied (it flows into the RHF edit form instead, because a
   * `videos.detail` refetch would wipe dirty edits).
   *
   * @param input - `{ suggestionId, op, expectedCurrent? }` (Zod-validated).
   */
  export const applyVideoSuggestionAction = async (
    input: unknown
  ): Promise<ApplyVideoSuggestionActionResult> => {
    const session = await requireRole('admin');

    const parsed = applyVideoSuggestionInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Invalid suggestion request.' };
    }
    const { suggestionId, op, expectedCurrent } = parsed.data;

    try {
      return op === 'dismiss'
        ? await dismissSuggestion(suggestionId, session.user.id)
        : await applySuggestion(suggestionId, expectedCurrent, session.user.id);
    } catch (error) {
      logger.error('Unexpected error applying video suggestion', {
        suggestionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: 'Suggestion update failed. Please try again.' };
    }
  };
  ```

  If ESLint's `complexity` rule (cap 10) flags `normalizedCurrentValue`'s ternary chain, replace it with a `switch (field)` — same mapping, one `case` per field.

- [ ] **13.12 Run it, expect PASS.**

  ```bash
  pnpm exec vitest run src/lib/actions/apply-video-suggestion-action.spec.ts
  ```

- [ ] **13.13 Gate + commit.**

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add src/lib/repositories/artist-repository.ts src/lib/repositories/artist-repository.spec.ts src/lib/services/artist-service.ts src/lib/services/artist-service.spec.ts src/lib/actions/apply-video-suggestion-action.ts src/lib/actions/apply-video-suggestion-action.spec.ts
  git commit -m "feat(videos): ✨ apply-suggestion action"
  ```

---

### Task 14: Lambda — schemas + identity/web-search client extensions

All work in the `bio-generator/` workspace (own lockfile, own vitest). Gates: `cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run` (there is no `typecheck` script — verified in `bio-generator/package.json`). Root web gates are untouched by this task.

**Files:**

- Modify: `bio-generator/src/types.ts` + `types.spec.ts` (video schemas + `VIDEO_PROGRESS_STAGES`)
- Modify: `bio-generator/src/musicbrainz.ts` + `musicbrainz.spec.ts` (`searchArtistCandidates`, `lookupArtistIdentity`)
- Modify: `bio-generator/src/wikidata.ts` + `wikidata.spec.ts` (additive identity fields)
- Modify: `bio-generator/src/serper.ts` + `serper.spec.ts` (`searchSerperWeb`)

**Interfaces:**

- Consumes: existing `fetchWithRetry`/`sleep` (`./lib/http.js`), `logEvent`/`toErrorMessage` (`./lib/log.js`), `USER_AGENT`, existing private `collectRelations` in `musicbrainz.ts`.
- Produces:
  - `videoEnrichmentInputSchema` (`{ task: 'video-enrichment', videoId, title, artistDisplay, releasedOn?, artists: 1..10 of { artistId, name, role: 'primary'|'featured', known? }, callbackUrl?, progressUrl?, jobToken? }`) + `VideoEnrichmentInput`
  - `videoEnrichmentResultSchema` mirroring the web's `videoEnrichmentResultSchema` + `VideoEnrichmentData`/`VideoEnrichmentResult`/`VideoSuggestion` types; `VIDEO_PROGRESS_STAGES` + `VideoProgressStage`
  - `searchArtistCandidates(name: string, limit?: number, fetchFn?: FetchFn, options?: FetchRetryOptions): Promise<MusicBrainzArtistCandidate[]>` with `interface MusicBrainzArtistCandidate { mbid: string; name: string; score: number; sortName: string | null; aliases: string[] }`
  - `lookupArtistIdentity(mbid: string, fetchFn?: FetchFn, options?: FetchRetryOptions): Promise<MusicBrainzArtistIdentity | null>` with `interface MusicBrainzArtistIdentity { type: string | null; lifeSpanBegin: string | null; sortName: string | null; legalName: string | null; aliases: string[]; wikidataId: string | null }`
  - `WikidataData` gains `dateOfBirth?: { value: string; precision: number }`, `birthName?: string`, `aliases: string[]`, `entityLabel?: string`, `occupationIds: string[]`
  - `searchSerperWeb(query: string, apiKey: string, fetchFn?: FetchFn): Promise<SerperWebResult[]>` with `interface SerperWebResult { title: string; link: string; snippet: string; date?: string }` (never throws; `[]` on failure)

**Steps:**

- [ ] **14.1 Write the failing types tests.** Append to `bio-generator/src/types.spec.ts` (inside its top-level scope):

  ```ts
  describe('videoEnrichmentInputSchema', () => {
    const validInput = {
      task: 'video-enrichment',
      videoId: 'f'.repeat(24),
      title: 'Bite Through Stone',
      artistDisplay: 'Ceschi feat. Sole',
      releasedOn: '2021-04-09',
      artists: [
        {
          artistId: 'a'.repeat(24),
          name: 'Ceschi',
          role: 'primary',
          known: { firstName: 'Francisco', surname: 'Ramos', bornOn: '1980-01-02' },
        },
      ],
      callbackUrl: 'https://example.com/api/videos/x/enrichment/callback',
      progressUrl: 'https://example.com/api/videos/x/enrichment/progress',
      jobToken: 'token-1',
    };

    it('accepts a full video-enrichment event', () => {
      expect(videoEnrichmentInputSchema.safeParse(validInput).success).toBe(true);
    });

    it('rejects a missing task discriminator', () => {
      const { task: _task, ...rest } = validInput;
      expect(videoEnrichmentInputSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects an empty artists list', () => {
      expect(videoEnrichmentInputSchema.safeParse({ ...validInput, artists: [] }).success).toBe(
        false
      );
    });

    it('rejects more than 10 artists', () => {
      const artists = Array.from({ length: 11 }, (_, i) => ({
        artistId: `${i}`.padStart(24, '0'),
        name: `Artist ${i}`,
        role: 'featured',
      }));
      expect(videoEnrichmentInputSchema.safeParse({ ...validInput, artists }).success).toBe(false);
    });

    it('rejects an unknown role', () => {
      const artists = [{ artistId: 'a'.repeat(24), name: 'Ceschi', role: 'headliner' }];
      expect(videoEnrichmentInputSchema.safeParse({ ...validInput, artists }).success).toBe(false);
    });
  });

  describe('videoEnrichmentResultSchema', () => {
    it('accepts an ok envelope with suggestions', () => {
      const parsed = videoEnrichmentResultSchema.safeParse({
        ok: true,
        data: {
          artists: [
            {
              artistId: 'a'.repeat(24),
              suggestions: [
                {
                  field: 'bornOn',
                  value: '1985-03-15',
                  confidence: 'high',
                  sources: [{ url: 'https://musicbrainz.org/artist/x' }],
                },
              ],
            },
          ],
          model: 'gemini-2.5-flash',
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts a failure envelope', () => {
      expect(videoEnrichmentResultSchema.safeParse({ ok: false, error: 'boom' }).success).toBe(
        true
      );
    });
  });

  describe('VIDEO_PROGRESS_STAGES', () => {
    it('pins the stage order (wire contract with the web app)', () => {
      expect(VIDEO_PROGRESS_STAGES).toEqual([
        'musicbrainz',
        'wikidata',
        'web-search',
        'adjudicating',
        'finalizing',
      ]);
    });
  });
  ```

  Extend the spec's import from `./types.js` with `videoEnrichmentInputSchema, videoEnrichmentResultSchema, VIDEO_PROGRESS_STAGES`.

- [ ] **14.2 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/types.spec.ts
  ```

  Expected failure: `SyntaxError: The requested module './types.js' does not provide an export named 'videoEnrichmentInputSchema'`.

- [ ] **14.3 Implement the types additions.** Append to `bio-generator/src/types.ts` (after `bioProseSchema`/`ArtistFacts` — end of file):

  ```ts
  /**
   * Ordered stages the video-enrichment mode checkpoints through. Wire contract
   * with the web counterpart `VIDEO_PROGRESS_STAGES` in
   * `src/lib/validation/video-enrichment-schema.ts` — keep in lockstep (the two
   * projects cannot share a module).
   */
  export const VIDEO_PROGRESS_STAGES = [
    'musicbrainz',
    'wikidata',
    'web-search',
    'adjudicating',
    'finalizing',
  ] as const;

  /** A single video-enrichment checkpoint stage name. */
  export type VideoProgressStage = (typeof VIDEO_PROGRESS_STAGES)[number];

  /** Identity fields the web app already holds for a linked artist. */
  export const videoKnownIdentitySchema = z.object({
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    surname: z.string().optional(),
    displayName: z.string().optional(),
    akaNames: z.string().optional(),
    bornOn: isoDate.optional(),
  });

  /**
   * Input the web app sends for `task: 'video-enrichment'`. The `known` block
   * lets the Lambda skip facts the label already has; `callbackUrl`/
   * `progressUrl`/`jobToken` mirror the bio pipeline's async plumbing.
   */
  export const videoEnrichmentInputSchema = z.object({
    task: z.literal('video-enrichment'),
    videoId: z.string().min(1),
    title: z.string().min(1),
    artistDisplay: z.string().min(1),
    releasedOn: isoDate.optional(),
    artists: z
      .array(
        z.object({
          artistId: z.string().min(1),
          name: z.string().min(1),
          role: z.enum(['primary', 'featured']),
          known: videoKnownIdentitySchema.optional(),
        })
      )
      .min(1)
      .max(10),
    callbackUrl: z.string().url().optional(),
    progressUrl: z.string().url().optional(),
    jobToken: z.string().min(1).optional(),
  });

  export type VideoEnrichmentInput = z.infer<typeof videoEnrichmentInputSchema>;

  /** One provenance link backing a suggestion. */
  export const videoSuggestionSourceSchema = z.object({
    url: z.string().url(),
    label: z.string().max(200).optional(),
  });

  /**
   * One reviewable fact. Mirrors the web's `videoSuggestionSchema` in
   * `src/lib/validation/video-enrichment-schema.ts` — keep in lockstep.
   */
  export const videoSuggestionSchema = z.object({
    field: z.enum([
      'firstName',
      'middleName',
      'surname',
      'akaNames',
      'bornOn',
      'displayName',
      'releasedOn',
    ]),
    value: z.string().min(1).max(500),
    confidence: z.enum(['high', 'medium', 'low']),
    sources: z.array(videoSuggestionSourceSchema).max(10),
    note: z.string().max(500).optional(),
  });

  export type VideoSuggestion = z.infer<typeof videoSuggestionSchema>;

  /** The successful video-enrichment payload (mirrors the web schema). */
  export const videoEnrichmentDataSchema = z.object({
    artists: z
      .array(
        z.object({
          artistId: z.string().min(1),
          suggestions: z.array(videoSuggestionSchema).max(12),
        })
      )
      .max(10),
    video: z
      .object({ releasedOn: videoSuggestionSchema.omit({ field: true }).optional() })
      .optional(),
    model: z.string().max(100),
  });

  export type VideoEnrichmentData = z.infer<typeof videoEnrichmentDataSchema>;

  /** Discriminated result envelope for the video-enrichment mode. */
  export const videoEnrichmentResultSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: videoEnrichmentDataSchema }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]);

  export type VideoEnrichmentResult = z.infer<typeof videoEnrichmentResultSchema>;
  ```

- [ ] **14.4 Run it, expect PASS.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/types.spec.ts
  ```

- [ ] **14.5 Write the failing MusicBrainz tests.** Append to `bio-generator/src/musicbrainz.spec.ts` (add `searchArtistCandidates, lookupArtistIdentity` to its import from `./musicbrainz.js`; reuse the file's existing response-stub helper if one exists — otherwise these are self-contained):

  ```ts
  describe('searchArtistCandidates', () => {
    it('maps candidates with score, sort-name, and aliases', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            artists: [
              {
                id: 'mbid-1',
                name: 'Ceschi',
                score: 98,
                'sort-name': 'Ceschi',
                aliases: [{ name: 'Ceschi Ramos' }],
              },
            ],
          })
        )
      );

      const result = await searchArtistCandidates('Ceschi', 5, fetchFn);

      expect(result).toEqual([
        {
          mbid: 'mbid-1',
          name: 'Ceschi',
          score: 98,
          sortName: 'Ceschi',
          aliases: ['Ceschi Ramos'],
        },
      ]);
    });

    it('threads the limit into the search URL', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ artists: [] })));

      await searchArtistCandidates('Ceschi', 3, fetchFn);

      expect(String(fetchFn.mock.calls[0][0])).toContain('limit=3');
    });

    it('returns [] on a failed request', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

      const result = await searchArtistCandidates('Ceschi', 5, fetchFn);

      expect(result).toEqual([]);
    });
  });

  describe('lookupArtistIdentity', () => {
    const identityBody = {
      type: 'Person',
      'sort-name': 'Ceschi',
      'life-span': { begin: '1980-01-02' },
      aliases: [
        { name: 'Francisco Ramos', type: 'Legal name' },
        { name: 'Ceschi Ramos', type: 'Artist name' },
      ],
      relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q123' } }],
    };

    it('sleeps the MusicBrainz rate limit before the lookup', async () => {
      const sleep = vi.fn().mockResolvedValue(undefined);
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

      await lookupArtistIdentity('mbid-1', fetchFn, { sleep });

      expect(sleep).toHaveBeenCalledWith(1100);
    });

    it('extracts type, life-span, legal name, aliases, and wikidata id', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

      const result = await lookupArtistIdentity('mbid-1', fetchFn, {
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(result).toEqual({
        type: 'Person',
        lifeSpanBegin: '1980-01-02',
        sortName: 'Ceschi',
        legalName: 'Francisco Ramos',
        aliases: ['Francisco Ramos', 'Ceschi Ramos'],
        wikidataId: 'Q123',
      });
    });

    it('requests aliases and url-rels in one lookup', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

      await lookupArtistIdentity('mbid-1', fetchFn, {
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(String(fetchFn.mock.calls[0][0])).toContain('inc=aliases+url-rels');
    });

    it('returns null on a failed lookup', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

      const result = await lookupArtistIdentity('mbid-1', fetchFn, {
        sleep: vi.fn().mockResolvedValue(undefined),
      });

      expect(result).toBeNull();
    });
  });
  ```

- [ ] **14.6 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/musicbrainz.spec.ts
  ```

  Expected failure: `does not provide an export named 'searchArtistCandidates'`.

- [ ] **14.7 Implement the MusicBrainz additions.** Append to `bio-generator/src/musicbrainz.ts` (after `lookupArtist`):

  ```ts
  /** One artist-search candidate for the video-enrichment identity gate. */
  export interface MusicBrainzArtistCandidate {
    mbid: string;
    name: string;
    score: number;
    sortName: string | null;
    aliases: string[];
  }

  /** Subset of the artist search response the candidate gate reads. */
  interface MbCandidateSearchResponse {
    artists?: Array<{
      id?: string;
      name?: string;
      score?: number;
      'sort-name'?: string;
      aliases?: Array<{ name?: string }>;
    }>;
  }

  /** Non-empty alias names from an aliases array (search or lookup shape). */
  const aliasNames = (aliases: Array<{ name?: string }> | undefined): string[] =>
    (aliases ?? []).map((alias) => alias.name).filter((name): name is string => Boolean(name));

  /**
   * Searches MusicBrainz for artist candidates, keeping the match score and
   * aliases so the caller can apply the score ≥90 + name/alias equality gate.
   * Best-effort: failures return [] (an obscure act simply has no candidates).
   *
   * @param name - The artist name to search for.
   * @param limit - Max candidates to request (default 5).
   */
  export const searchArtistCandidates = async (
    name: string,
    limit = 5,
    fetchFn: FetchFn = fetch,
    options: FetchRetryOptions = {}
  ): Promise<MusicBrainzArtistCandidate[]> => {
    const url = `${MB_BASE}/artist?query=${encodeURIComponent(name)}&fmt=json&limit=${limit}`;
    try {
      const body = await request<MbCandidateSearchResponse>(url, { ...options, fetchFn });
      return (body.artists ?? [])
        .filter((artist): artist is { id: string; name: string } & typeof artist =>
          Boolean(artist.id && artist.name)
        )
        .map((artist) => ({
          mbid: artist.id,
          name: artist.name,
          score: artist.score ?? 0,
          sortName: artist['sort-name'] ?? null,
          aliases: aliasNames(artist.aliases),
        }));
    } catch (err) {
      logEvent('warn', 'musicbrainz_candidate_search_failed', { name, error: String(err) });
      return [];
    }
  };

  /** Identity details from one artist lookup (aliases + url-rels). */
  export interface MusicBrainzArtistIdentity {
    type: string | null;
    lifeSpanBegin: string | null;
    sortName: string | null;
    /** The alias MusicBrainz types as the artist's legal name, when present. */
    legalName: string | null;
    aliases: string[];
    wikidataId: string | null;
  }

  /** Subset of the identity lookup response we read. */
  interface MbIdentityLookupResponse {
    type?: string;
    'sort-name'?: string;
    'life-span'?: { begin?: string };
    aliases?: Array<{ name?: string; type?: string }>;
    relations?: Array<{ type: string; url?: { resource: string } }>;
  }

  /**
   * Looks up one artist's identity facts (type, life-span begin, legal-name
   * alias, all aliases, Wikidata relation). Sleeps the MusicBrainz rate limit
   * BEFORE requesting so it can safely follow the candidate search. Best-effort:
   * failures return null so the caller degrades to the web fallback.
   *
   * @param mbid - The candidate's MusicBrainz id.
   */
  export const lookupArtistIdentity = async (
    mbid: string,
    fetchFn: FetchFn = fetch,
    options: FetchRetryOptions = {}
  ): Promise<MusicBrainzArtistIdentity | null> => {
    await (options.sleep ?? sleep)(MB_RATE_LIMIT_MS);
    const url = `${MB_BASE}/artist/${encodeURIComponent(mbid)}?inc=aliases+url-rels&fmt=json`;
    try {
      const body = await request<MbIdentityLookupResponse>(url, { ...options, fetchFn });
      const { wikidataId } = collectRelations(body.relations);
      return {
        type: body.type ?? null,
        lifeSpanBegin: body['life-span']?.begin ?? null,
        sortName: body['sort-name'] ?? null,
        legalName: (body.aliases ?? []).find((alias) => alias.type === 'Legal name')?.name ?? null,
        aliases: aliasNames(body.aliases),
        wikidataId: wikidataId ?? null,
      };
    } catch (err) {
      logEvent('warn', 'musicbrainz_identity_lookup_failed', { mbid, error: String(err) });
      return null;
    }
  };
  ```

- [ ] **14.8 Run it, expect PASS.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/musicbrainz.spec.ts
  ```

- [ ] **14.9 Write the failing Wikidata tests.** Append to `bio-generator/src/wikidata.spec.ts`:

  ```ts
  describe('identity fields (video enrichment)', () => {
    it('extracts DOB with precision, birth name, aliases, label, and occupations', async () => {
      const entities = {
        entities: {
          Q123: {
            claims: {
              P569: [
                {
                  mainsnak: {
                    datavalue: { value: { time: '+1985-03-15T00:00:00Z', precision: 11 } },
                  },
                },
              ],
              P1477: [
                { mainsnak: { datavalue: { value: { text: 'Francisco Ramos', language: 'en' } } } },
              ],
              P106: [{ mainsnak: { datavalue: { value: { id: 'Q639669' } } } }],
            },
            labels: { en: { value: 'Ceschi' } },
            aliases: { en: [{ value: 'Ceschi Ramos' }] },
            sitelinks: {},
          },
        },
      };
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(entities)));

      const result = await getWikidataData('Q123', fetchFn);

      expect(result).toMatchObject({
        dateOfBirth: { value: '1985-03-15', precision: 11 },
        birthName: 'Francisco Ramos',
        aliases: ['Ceschi Ramos'],
        entityLabel: 'Ceschi',
        occupationIds: ['Q639669'],
      });
    });

    it('defaults the identity fields when the claims are absent', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ entities: { Q1: {} } })));

      const result = await getWikidataData('Q1', fetchFn);

      expect(result).toMatchObject({ aliases: [], occupationIds: [] });
    });
  });
  ```

  Also update any existing `toEqual` expectations on `getWikidataData` results in this spec file by adding `aliases: [], occupationIds: []` — the two new always-present arrays (optional new fields are `undefined` and don't affect `toEqual`).

- [ ] **14.10 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/wikidata.spec.ts
  ```

  Expected failure: the new `toMatchObject` assertions fail (`dateOfBirth`/`aliases`/`occupationIds` undefined).

- [ ] **14.11 Implement the Wikidata additions.** In `bio-generator/src/wikidata.ts`:

  1. Extend the entity shape:

     ```ts
     /** Minimal shape of the Wikidata EntityData JSON we read. */
     interface WikidataEntities {
       entities?: Record<
         string,
         {
           claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
           sitelinks?: Record<string, { title?: string; url?: string }>;
           labels?: Record<string, { value?: string }>;
           aliases?: Record<string, Array<{ value?: string }>>;
         }
       >;
     }
     ```

  2. Extend `WikidataData`:

     ```ts
     export interface WikidataData {
       /** Commons file names from the P18 (image) claim, e.g. "Radiohead 2008.jpg". */
       imageFileNames: string[];
       officialUrl?: string;
       wikipediaUrl?: string;
       /** Commons category name from P373, e.g. "Ceschi" (no `Category:` prefix). */
       commonsCategory?: string;
       /** P569 date of birth (YYYY-MM-DD) with its precision (11 = day). */
       dateOfBirth?: { value: string; precision: number };
       /** P1477 birth name (monolingual text), when claimed. */
       birthName?: string;
       /** English "also known as" aliases. */
       aliases: string[];
       /** English label of the entity. */
       entityLabel?: string;
       /** P106 occupation entity ids (e.g. Q639669 = musician). */
       occupationIds: string[];
     }
     ```

  3. Add the extractors after `stringValues`:

     ```ts
     /** A Wikidata time datavalue (`+YYYY-MM-DDT00:00:00Z` + precision). */
     interface WikidataTimeValue {
       time: string;
       precision: number;
     }

     const isTimeValue = (value: unknown): value is WikidataTimeValue => {
       if (typeof value !== 'object' || value === null) return false;
       const candidate = value as { time?: unknown; precision?: unknown };
       return typeof candidate.time === 'string' && typeof candidate.precision === 'number';
     };

     const timeValues = (
       entries: Claim[] | undefined
     ): Array<{ value: string; precision: number }> =>
       (entries ?? [])
         .map((entry) => entry.mainsnak?.datavalue?.value)
         .filter(isTimeValue)
         .map((value) => ({
           value: value.time.replace(/^\+/, '').slice(0, 10),
           precision: value.precision,
         }));

     const isMonolingualValue = (value: unknown): value is { text: string } =>
       typeof value === 'object' &&
       value !== null &&
       typeof (value as { text?: unknown }).text === 'string';

     const monolingualValues = (entries: Claim[] | undefined): string[] =>
       (entries ?? [])
         .map((entry) => entry.mainsnak?.datavalue?.value)
         .filter(isMonolingualValue)
         .map((value) => value.text);

     const isEntityIdValue = (value: unknown): value is { id: string } =>
       typeof value === 'object' &&
       value !== null &&
       typeof (value as { id?: unknown }).id === 'string';

     const entityIdValues = (entries: Claim[] | undefined): string[] =>
       (entries ?? [])
         .map((entry) => entry.mainsnak?.datavalue?.value)
         .filter(isEntityIdValue)
         .map((value) => value.id);
     ```

  4. Extend `extractWikidataData` (same function, additive return fields):

     ```ts
     const extractWikidataData = (body: WikidataEntities): WikidataData => {
       const entity = Object.values(body.entities ?? {})[0];
       const claims = entity?.claims ?? {};
       const sitelinks = entity?.sitelinks ?? {};
       return {
         imageFileNames: stringValues(claims.P18),
         officialUrl: stringValues(claims.P856)[0],
         wikipediaUrl: sitelinks.enwiki?.url,
         commonsCategory: stringValues(claims.P373)[0],
         dateOfBirth: timeValues(claims.P569)[0],
         birthName: monolingualValues(claims.P1477)[0],
         aliases: (entity?.aliases?.en ?? [])
           .map((alias) => alias.value)
           .filter((value): value is string => Boolean(value)),
         entityLabel: entity?.labels?.en?.value,
         occupationIds: entityIdValues(claims.P106),
       };
     };
     ```

- [ ] **14.12 Run it, expect PASS (including the updated legacy expectations).**

  ```bash
  cd bio-generator && pnpm run test:run -- src/wikidata.spec.ts
  ```

- [ ] **14.13 Write the failing Serper web-search tests.** Append to `bio-generator/src/serper.spec.ts` (add `searchSerperWeb` to the import):

  ```ts
  describe('searchSerperWeb', () => {
    it('maps organic results and caps at 10', async () => {
      const organic = Array.from({ length: 12 }, (_, i) => ({
        title: `Result ${i}`,
        link: `https://example.com/${i}`,
        snippet: `Snippet ${i}`,
        date: i === 0 ? 'Jun 1, 2020' : undefined,
      }));
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic })));

      const result = await searchSerperWeb('ceschi premiere', 'key-1', fetchFn);

      expect(result).toHaveLength(10);
      expect(result[0]).toEqual({
        title: 'Result 0',
        link: 'https://example.com/0',
        snippet: 'Snippet 0',
        date: 'Jun 1, 2020',
      });
    });

    it('POSTs the query to the search endpoint with the API key', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic: [] })));

      await searchSerperWeb('ceschi premiere', 'key-1', fetchFn);

      expect(fetchFn).toHaveBeenCalledWith('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': 'key-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'ceschi premiere' }),
      });
    });

    it('returns [] on a non-ok response', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));

      const result = await searchSerperWeb('q', 'key-1', fetchFn);

      expect(result).toEqual([]);
    });

    it('returns [] when the fetch throws (never throws)', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

      const result = await searchSerperWeb('q', 'key-1', fetchFn);

      expect(result).toEqual([]);
    });
  });
  ```

- [ ] **14.14 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/serper.spec.ts
  ```

  Expected failure: `does not provide an export named 'searchSerperWeb'`.

- [ ] **14.15 Implement the Serper web search.** Append to `bio-generator/src/serper.ts`:

  ```ts
  /** Serper.dev Google web-search endpoint (POST, JSON body). */
  const SERPER_SEARCH_ENDPOINT = 'https://google.serper.dev/search';

  /** Cap on organic results kept per query. */
  export const MAX_SERPER_WEB_RESULTS = 10;

  /** One organic web-search result (title/link/snippet, optional date). */
  export interface SerperWebResult {
    title: string;
    link: string;
    snippet: string;
    date?: string;
  }

  /** Subset of the Serper search response we read. */
  interface SerperSearchResponse {
    organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
  }

  /**
   * Runs one Serper.dev web search and returns up to
   * {@link MAX_SERPER_WEB_RESULTS} organic results. Best-effort and key-gated:
   * a non-ok response or thrown fetch logs a warning and yields [] — never
   * throws, so a failed query can never abort an enrichment run.
   *
   * @param query - The full search query string.
   * @param apiKey - The Serper.dev API key (required; resolved from SSM).
   * @param fetchFn - Injectable fetch (defaults to global) for testability.
   */
  export const searchSerperWeb = async (
    query: string,
    apiKey: string,
    fetchFn: FetchFn = fetch
  ): Promise<SerperWebResult[]> => {
    try {
      const response = await fetchFn(SERPER_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query }),
      });
      if (!response.ok) {
        logEvent('warn', 'serper_web_query_failed', { status: response.status });
        return [];
      }
      const body = (await response.json()) as SerperSearchResponse;
      return (body.organic ?? [])
        .filter(
          (result): result is { title: string; link: string; snippet: string } & typeof result =>
            Boolean(result.title && result.link && result.snippet)
        )
        .slice(0, MAX_SERPER_WEB_RESULTS)
        .map(({ title, link, snippet, date }) =>
          date === undefined ? { title, link, snippet } : { title, link, snippet, date }
        );
    } catch (err) {
      logEvent('warn', 'serper_web_query_failed', { error: toErrorMessage(err) });
      return [];
    }
  };
  ```

- [ ] **14.16 Run it, expect PASS.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/serper.spec.ts
  ```

- [ ] **14.17 Gate + commit.**

  ```bash
  cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run
  cd .. && pnpm run lint && pnpm run format
  git add bio-generator/src/types.ts bio-generator/src/types.spec.ts bio-generator/src/musicbrainz.ts bio-generator/src/musicbrainz.spec.ts bio-generator/src/wikidata.ts bio-generator/src/wikidata.spec.ts bio-generator/src/serper.ts bio-generator/src/serper.spec.ts
  git commit -m "feat(bio-generator): ✨ identity clients"
  ```

  (Root `lint`/`format` run because `eslint .` is repo-wide and covers `bio-generator/` too.)

---

### Task 15: Lambda — release-date adjudication + video-enrichment orchestrator + handler routing

All in `bio-generator/`. The bio path through `handler.ts` stays byte-identical apart from the early task-discriminator return and return-type widening.

**Files:**

- Modify: `bio-generator/src/gemini.ts` (export the schema-generic JSON core + widen the purpose union — additive)
- Modify: `bio-generator/src/progress.ts` (widen `stage` to accept video stages)
- Modify: `bio-generator/src/callback.ts` (widen `result` to accept the video envelope)
- Create: `bio-generator/src/release-date.ts` + `release-date.spec.ts`
- Create: `bio-generator/src/video-enrichment.ts` + `video-enrichment.spec.ts`
- Modify: `bio-generator/src/handler.ts` + `handler.spec.ts` (task routing)

**Interfaces:**

- Consumes: Task 14 clients + schemas; `requestGeminiJson` (exported here); `postBioCallback`/`postBioProgress`; `getGeminiApiKey`/`getSerperApiKey` (`./lib/secrets.js`); `DEFAULT_GEMINI_MODEL`.
- Produces:
  - `requestGeminiJson` + `GeminiJsonRequest` from `./gemini.js` (purpose union gains `'adjudication'`)
  - `resolveReleaseDateSuggestion(args, deps?): Promise<Omit<VideoSuggestion, 'field'> | null>`, `resolveIdentityFallback(args, deps?): Promise<IdentityFallbackFacts | null>`, `releaseDateAdjudicationSchema`, `identityFallbackSchema` from `./release-date.js`
  - `runVideoEnrichment(input: VideoEnrichmentInput, deps?: VideoEnrichmentDeps): Promise<VideoEnrichmentData>`, `runVideoEnrichmentLambda(event: unknown, deps?): Promise<VideoEnrichmentResult>`, `isVideoEnrichmentTask(event: unknown): boolean`, `confidenceFor(signals): VideoSuggestion['confidence']`, `MUSIC_OCCUPATION_IDS` from `./video-enrichment.js`
  - `runLambda`/`lambdaHandler` route on the `task` discriminator, returning `Promise<BioGenerationResult | VideoEnrichmentResult>`

**Steps:**

- [ ] **15.1 Widen the shared channels (no behavior change).** Three additive edits:

  1. `bio-generator/src/gemini.ts` — replace:

     ```ts
     /** Which pipeline stage a Gemini call serves — tags the usage telemetry line. */
     type GeminiPurpose = 'draft' | 'synthesis' | 'critic' | 'repair' | 'vision';
     ```

     with:

     ```ts
     /** Which pipeline stage a Gemini call serves — tags the usage telemetry line. */
     type GeminiPurpose = 'draft' | 'synthesis' | 'critic' | 'repair' | 'vision' | 'adjudication';
     ```

     and append at the end of the file:

     ```ts
     /** Public alias of the single-call request shape for sibling modules. */
     export type GeminiJsonRequest = ProseRequest;

     /**
      * Public alias of the schema-generic JSON core so sibling modules (the
      * video-enrichment adjudications) share the endpoint, auth, retry pacing,
      * and JSON parsing instead of re-implementing them.
      */
     export const requestGeminiJson = requestJson;
     ```

  2. `bio-generator/src/progress.ts` — replace:

     ```ts
     import type { ProgressStage } from './types.js';
     ```

     with:

     ```ts
     import type { ProgressStage, VideoProgressStage } from './types.js';
     ```

     and replace:

     ```ts
     /** The stage the generation just reached. */
     stage: ProgressStage;
     ```

     with:

     ```ts
     /** The stage the generation (bio) or enrichment (video) just reached. */
     stage: ProgressStage | VideoProgressStage;
     ```

  3. `bio-generator/src/callback.ts` — replace:

     ```ts
     import type { BioGenerationResult } from './types.js';
     ```

     with:

     ```ts
     import type { BioGenerationResult, VideoEnrichmentResult } from './types.js';
     ```

     and replace:

     ```ts
     /** The discriminated result envelope produced by the run (success or error). */
     result: BioGenerationResult;
     ```

     with:

     ```ts
     /** The discriminated result envelope produced by the run (success or error). */
     result: BioGenerationResult | VideoEnrichmentResult;
     ```

  Verify no regression:

  ```bash
  cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run
  ```

- [ ] **15.2 Write the failing release-date spec.** Create `bio-generator/src/release-date.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { resolveIdentityFallback, resolveReleaseDateSuggestion } from './release-date.js';

  import type { SerperWebResult } from './serper.js';

  const evidence: SerperWebResult[] = [
    {
      title: 'Ceschi — Bite Through Stone premiere',
      link: 'https://example.com/premiere',
      snippet: 'The video premiered on June 1, 2020.',
      date: 'Jun 1, 2020',
    },
  ];

  /** A Gemini generateContent response whose single part is `json`. */
  const geminiResponse = (json: unknown): Response =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] })
    );

  const adjudication = {
    releaseDate: '2020-06-01',
    confidence: 'medium',
    sourceUrls: ['https://example.com/premiere'],
    rationale: 'Premiere article names the date.',
  };

  const baseArgs = {
    title: 'Bite Through Stone',
    artistDisplay: 'Ceschi',
    adminReleasedOn: '2021-04-09',
    serperKey: 'serper-key',
    geminiKey: 'gemini-key',
    model: 'gemini-2.5-flash',
  };

  describe('resolveReleaseDateSuggestion', () => {
    it('returns null when both queries yield no evidence', async () => {
      const searchWeb = vi.fn().mockResolvedValue([]);

      const result = await resolveReleaseDateSuggestion(baseArgs, { searchWeb });

      expect(result).toBeNull();
      expect(searchWeb).toHaveBeenCalledTimes(2);
    });

    it('adjudicates a differing date into a suggestion with subset-enforced sources', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi.fn().mockResolvedValue(
        geminiResponse({
          ...adjudication,
          sourceUrls: ['https://example.com/premiere', 'https://fabricated.example.com/'],
        })
      );

      const result = await resolveReleaseDateSuggestion(baseArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result).toEqual({
        value: '2020-06-01',
        confidence: 'medium',
        sources: [{ url: 'https://example.com/premiere' }],
        note: 'Premiere article names the date.',
      });
    });

    it('suppresses a date equal to the admin-entered one', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi
        .fn()
        .mockResolvedValue(geminiResponse({ ...adjudication, releaseDate: '2021-04-09' }));

      const result = await resolveReleaseDateSuggestion(baseArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result).toBeNull();
    });

    it('returns null when every cited source was fabricated', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          geminiResponse({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] })
        );

      const result = await resolveReleaseDateSuggestion(baseArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result).toBeNull();
    });

    it('downgrades a high adjudication to medium (web-only facts never rank high)', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi
        .fn()
        .mockResolvedValue(geminiResponse({ ...adjudication, confidence: 'high' }));

      const result = await resolveReleaseDateSuggestion(baseArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result?.confidence).toBe('medium');
    });

    it('returns null instead of throwing when the adjudication call fails', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

      const result = await resolveReleaseDateSuggestion(baseArgs, {
        searchWeb,
        fetchOptions: { fetchFn, retries: 0 },
      });

      expect(result).toBeNull();
    });
  });

  describe('resolveIdentityFallback', () => {
    const fallbackArgs = {
      name: 'Ceschi',
      serperKey: 'serper-key',
      geminiKey: 'gemini-key',
      model: 'gemini-2.5-flash',
    };

    it('maps adjudicated identity facts with their sources and rationale', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi.fn().mockResolvedValue(
        geminiResponse({
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          bornOn: '1980-01-02',
          sourceUrls: ['https://example.com/premiere'],
          rationale: 'Interview states the legal name and birth date.',
        })
      );

      const result = await resolveIdentityFallback(fallbackArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result).toEqual({
        firstName: 'Francisco',
        surname: 'Ramos',
        bornOn: '1980-01-02',
        sources: [{ url: 'https://example.com/premiere' }],
        note: 'Interview states the legal name and birth date.',
      });
    });

    it('returns null when the adjudication yields no facts', async () => {
      const searchWeb = vi.fn().mockResolvedValue(evidence);
      const fetchFn = vi.fn().mockResolvedValue(
        geminiResponse({
          firstName: null,
          middleName: null,
          surname: null,
          bornOn: null,
          sourceUrls: ['https://example.com/premiere'],
          rationale: 'Nothing conclusive.',
        })
      );

      const result = await resolveIdentityFallback(fallbackArgs, {
        searchWeb,
        fetchOptions: { fetchFn },
      });

      expect(result).toBeNull();
    });

    it('returns null when the web search finds nothing', async () => {
      const searchWeb = vi.fn().mockResolvedValue([]);

      const result = await resolveIdentityFallback(fallbackArgs, { searchWeb });

      expect(result).toBeNull();
    });
  });
  ```

- [ ] **15.3 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/release-date.spec.ts
  ```

  Expected failure: `Cannot find module './release-date.js'`.

- [ ] **15.4 Implement release-date.ts.** Create `bio-generator/src/release-date.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { z } from 'zod';

  import { requestGeminiJson } from './gemini.js';
  import { logEvent, toErrorMessage } from './lib/log.js';
  import { searchSerperWeb } from './serper.js';
  import { DEFAULT_GEMINI_MODEL } from './types.js';

  import type { FetchRetryOptions } from './lib/http.js';
  import type { SerperWebResult } from './serper.js';
  import type { VideoSuggestion } from './types.js';

  const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

  /** Gemini's JSON adjudication of the web evidence for a release date. */
  export const releaseDateAdjudicationSchema = z.object({
    releaseDate: isoDay.nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    sourceUrls: z.array(z.string().url()).max(10),
    rationale: z.string().max(300),
  });
  export type ReleaseDateAdjudication = z.infer<typeof releaseDateAdjudicationSchema>;

  /** Gemini's JSON adjudication of web evidence for artist identity facts. */
  export const identityFallbackSchema = z.object({
    firstName: z.string().nullable(),
    middleName: z.string().nullable(),
    surname: z.string().nullable(),
    bornOn: isoDay.nullable(),
    sourceUrls: z.array(z.string().url()).max(10),
    rationale: z.string().max(300),
  });

  /** Identity facts recovered from the web when structured sources miss. */
  export interface IdentityFallbackFacts {
    firstName?: string;
    middleName?: string;
    surname?: string;
    bornOn?: string;
    sources: Array<{ url: string }>;
    note: string;
  }

  /** Injectable collaborators shared by both adjudications. */
  export interface AdjudicationDeps {
    searchWeb?: typeof searchSerperWeb;
    requestJson?: typeof requestGeminiJson;
    fetchOptions?: FetchRetryOptions;
  }

  /** Low temperature: adjudication extracts, it must not get creative. */
  const ADJUDICATION_TEMPERATURE = 0.2;

  /** Dedupe results by link across queries (first occurrence wins). */
  const dedupeByLink = (results: SerperWebResult[]): SerperWebResult[] => {
    const seen = new Set<string>();
    return results.filter((result) => {
      const key = result.link.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  /** Run both queries sequentially and merge/dedupe the evidence pool. */
  const gatherEvidence = async (
    queries: string[],
    serperKey: string,
    searchWeb: typeof searchSerperWeb
  ): Promise<SerperWebResult[]> => {
    const results: SerperWebResult[] = [];
    for (const query of queries) {
      results.push(...(await searchWeb(query, serperKey)));
    }
    return dedupeByLink(results);
  };

  /** Numbered evidence block for the user prompt. */
  const evidenceLines = (results: SerperWebResult[]): string =>
    results
      .map(
        (result, i) =>
          `${i + 1}. ${result.title} — ${result.snippet}${result.date ? ` (${result.date})` : ''} [${result.link}]`
      )
      .join('\n');

  /** Keep only URLs Gemini was actually shown (subset enforcement, post-parse). */
  const enforceSourceSubset = (urls: string[], provided: Set<string>): string[] =>
    urls.filter((url) => provided.has(url));

  const SHARED_SYSTEM_LINES = [
    'Use ONLY the evidence provided; never invent facts, dates, or URLs.',
    'sourceUrls MUST be copied verbatim from the evidence links.',
    'Respond with a single JSON object and nothing else.',
  ];

  /** Arguments for {@link resolveReleaseDateSuggestion}. */
  export interface ReleaseDateArgs {
    title: string;
    artistDisplay: string;
    /** The admin-entered date (YYYY-MM-DD); a matching adjudication is suppressed. */
    adminReleasedOn?: string;
    serperKey: string;
    geminiKey: string;
    model?: string;
  }

  /**
   * Adjudicates the video's release date from two targeted web searches and one
   * Gemini flash JSON call. Emits a suggestion only when a date was found, at
   * least one cited source survives subset enforcement, and the date differs
   * from the admin-entered one. Web/LLM-derived, so confidence is capped at
   * medium. Never throws — any failure degrades to null.
   */
  export const resolveReleaseDateSuggestion = async (
    args: ReleaseDateArgs,
    deps: AdjudicationDeps = {}
  ): Promise<Omit<VideoSuggestion, 'field'> | null> => {
    const { searchWeb = searchSerperWeb, requestJson = requestGeminiJson, fetchOptions } = deps;
    const {
      title,
      artistDisplay,
      adminReleasedOn,
      serperKey,
      geminiKey,
      model = DEFAULT_GEMINI_MODEL,
    } = args;
    try {
      const evidence = await gatherEvidence(
        [`"${artistDisplay}" "${title}" video release date`, `${artistDisplay} ${title} premiere`],
        serperKey,
        searchWeb
      );
      if (evidence.length === 0) return null;

      const provided = new Set(evidence.map((result) => result.link));
      const adjudication = await requestJson(
        releaseDateAdjudicationSchema,
        {
          systemPrompt: [
            'You adjudicate music-video release dates from web search evidence.',
            ...SHARED_SYSTEM_LINES,
          ].join(' '),
          userPrompt: [
            `Video: "${title}" by ${artistDisplay}.`,
            adminReleasedOn
              ? `Admin-entered release date: ${adminReleasedOn} (verify or correct).`
              : '',
            'EVIDENCE:',
            evidenceLines(evidence),
            '',
            'Return JSON: {"releaseDate": "YYYY-MM-DD" or null, "confidence": "high"|"medium"|"low",',
            '"sourceUrls": [evidence links that support the date], "rationale": "<= 300 chars"}',
          ]
            .filter(Boolean)
            .join('\n'),
          apiKey: geminiKey,
          model,
          temperature: ADJUDICATION_TEMPERATURE,
          purpose: 'adjudication',
        },
        fetchOptions ?? {}
      );

      const sourceUrls = enforceSourceSubset(adjudication.sourceUrls, provided);
      if (!adjudication.releaseDate || sourceUrls.length === 0) return null;
      if (adminReleasedOn && adjudication.releaseDate === adminReleasedOn.slice(0, 10)) {
        return null;
      }

      return {
        value: adjudication.releaseDate,
        // Web/LLM-derived — never high (spec: web-only facts stay below high).
        confidence: adjudication.confidence === 'high' ? 'medium' : adjudication.confidence,
        sources: sourceUrls.map((url) => ({ url })),
        note: adjudication.rationale,
      };
    } catch (err) {
      logEvent('warn', 'video_release_date_failed', { error: toErrorMessage(err) });
      return null;
    }
  };

  /** Arguments for {@link resolveIdentityFallback}. */
  export interface IdentityFallbackArgs {
    name: string;
    serperKey: string;
    geminiKey: string;
    model?: string;
  }

  /**
   * Web-only identity fallback for when MusicBrainz/Wikidata miss: two targeted
   * searches plus one Gemini flash JSON adjudication. The caller maps every
   * returned fact to LOW confidence (web/LLM-only). Never throws.
   */
  export const resolveIdentityFallback = async (
    args: IdentityFallbackArgs,
    deps: AdjudicationDeps = {}
  ): Promise<IdentityFallbackFacts | null> => {
    const { searchWeb = searchSerperWeb, requestJson = requestGeminiJson, fetchOptions } = deps;
    const { name, serperKey, geminiKey, model = DEFAULT_GEMINI_MODEL } = args;
    try {
      const evidence = await gatherEvidence(
        [`${name} musician real name`, `${name} musician date of birth`],
        serperKey,
        searchWeb
      );
      if (evidence.length === 0) return null;

      const provided = new Set(evidence.map((result) => result.link));
      const facts = await requestJson(
        identityFallbackSchema,
        {
          systemPrompt: [
            `You adjudicate identity facts about the musician "${name}" from web search evidence.`,
            ...SHARED_SYSTEM_LINES,
          ].join(' '),
          userPrompt: [
            'EVIDENCE:',
            evidenceLines(evidence),
            '',
            'Return JSON: {"firstName": string or null, "middleName": string or null,',
            '"surname": string or null, "bornOn": "YYYY-MM-DD" or null,',
            '"sourceUrls": [evidence links that support the facts], "rationale": "<= 300 chars"}',
          ].join('\n'),
          apiKey: geminiKey,
          model,
          temperature: ADJUDICATION_TEMPERATURE,
          purpose: 'adjudication',
        },
        fetchOptions ?? {}
      );

      const sourceUrls = enforceSourceSubset(facts.sourceUrls, provided);
      if (sourceUrls.length === 0) return null;

      const out: IdentityFallbackFacts = {
        sources: sourceUrls.map((url) => ({ url })),
        note: facts.rationale,
        ...(facts.firstName ? { firstName: facts.firstName } : {}),
        ...(facts.middleName ? { middleName: facts.middleName } : {}),
        ...(facts.surname ? { surname: facts.surname } : {}),
        ...(facts.bornOn ? { bornOn: facts.bornOn } : {}),
      };
      const hasFact = Boolean(out.firstName || out.middleName || out.surname || out.bornOn);
      return hasFact ? out : null;
    } catch (err) {
      logEvent('warn', 'video_identity_fallback_failed', { error: toErrorMessage(err) });
      return null;
    }
  };
  ```

- [ ] **15.5 Run it, expect PASS.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/release-date.spec.ts
  ```

- [ ] **15.6 Write the failing orchestrator spec.** Create `bio-generator/src/video-enrichment.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import {
    confidenceFor,
    isVideoEnrichmentTask,
    runVideoEnrichment,
    runVideoEnrichmentLambda,
  } from './video-enrichment.js';

  import type { MusicBrainzArtistCandidate, MusicBrainzArtistIdentity } from './musicbrainz.js';
  import type { VideoEnrichmentDeps } from './video-enrichment.js';
  import type { VideoEnrichmentInput } from './types.js';
  import type { WikidataData } from './wikidata.js';

  const candidate = (
    overrides: Partial<MusicBrainzArtistCandidate> = {}
  ): MusicBrainzArtistCandidate => ({
    mbid: 'mbid-1',
    name: 'Ceschi',
    score: 98,
    sortName: 'Ceschi',
    aliases: [],
    ...overrides,
  });

  const identity = (
    overrides: Partial<MusicBrainzArtistIdentity> = {}
  ): MusicBrainzArtistIdentity => ({
    type: 'Person',
    lifeSpanBegin: '1980-01-02',
    sortName: 'Ceschi',
    legalName: 'Francisco Ramos',
    aliases: ['Francisco Ramos', 'Ceschi Ramos'],
    wikidataId: 'Q123',
    ...overrides,
  });

  const wikidata = (overrides: Partial<WikidataData> = {}): WikidataData => ({
    imageFileNames: [],
    aliases: [],
    occupationIds: ['Q639669'],
    dateOfBirth: { value: '1980-01-02', precision: 11 },
    ...overrides,
  });

  const buildDeps = (overrides: Partial<VideoEnrichmentDeps> = {}): VideoEnrichmentDeps => ({
    searchArtistCandidates: vi.fn().mockResolvedValue([candidate()]),
    lookupArtistIdentity: vi.fn().mockResolvedValue(identity()),
    getWikidataData: vi.fn().mockResolvedValue(wikidata()),
    searchSerperWeb: vi.fn().mockResolvedValue([]),
    getGeminiApiKey: vi.fn().mockResolvedValue('gemini-key'),
    getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
    resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(null),
    resolveIdentityFallback: vi.fn().mockResolvedValue(null),
    postCallback: vi.fn().mockResolvedValue(undefined),
    postProgress: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const baseInput: VideoEnrichmentInput = {
    task: 'video-enrichment',
    videoId: 'f'.repeat(24),
    title: 'Bite Through Stone',
    artistDisplay: 'Ceschi',
    releasedOn: '2021-04-09',
    artists: [{ artistId: 'a'.repeat(24), name: 'Ceschi', role: 'primary' }],
  };

  describe('confidenceFor', () => {
    it('grants high with MB >= 95 + corroboration + occupation gate', () => {
      expect(
        confidenceFor({ score: 96, corroborated: true, occupationOk: true, singleToken: true })
      ).toBe('high');
    });

    it('caps a single-token name at medium without corroboration', () => {
      expect(
        confidenceFor({ score: 98, corroborated: false, occupationOk: true, singleToken: true })
      ).toBe('medium');
    });

    it('caps at medium when the occupation gate fails', () => {
      expect(
        confidenceFor({ score: 98, corroborated: true, occupationOk: false, singleToken: false })
      ).toBe('medium');
    });
  });

  describe('runVideoEnrichment', () => {
    it('emits a high-confidence bornOn when MB and Wikidata corroborate', async () => {
      const deps = buildDeps();

      const result = await runVideoEnrichment(baseInput, deps);

      expect(result.artists[0].suggestions).toContainEqual(
        expect.objectContaining({ field: 'bornOn', value: '1980-01-02', confidence: 'high' })
      );
    });

    it('splits the legal name into first/surname suggestions', async () => {
      const deps = buildDeps();

      const result = await runVideoEnrichment(baseInput, deps);

      expect(result.artists[0].suggestions).toContainEqual(
        expect.objectContaining({ field: 'firstName', value: 'Francisco' })
      );
      expect(result.artists[0].suggestions).toContainEqual(
        expect.objectContaining({ field: 'surname', value: 'Ramos' })
      );
    });

    it('skips facts equal to the known identity', async () => {
      const deps = buildDeps();
      const input: VideoEnrichmentInput = {
        ...baseInput,
        artists: [
          {
            artistId: 'a'.repeat(24),
            name: 'Ceschi',
            role: 'primary',
            known: { bornOn: '1980-01-02', firstName: 'Francisco', surname: 'Ramos' },
          },
        ],
      };

      const result = await runVideoEnrichment(input, deps);

      const fields = result.artists[0].suggestions.map(({ field }) => field);
      expect(fields).not.toContain('bornOn');
      expect(fields).not.toContain('firstName');
      expect(fields).not.toContain('surname');
    });

    it('gates out candidates below score 90', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi.fn().mockResolvedValue([candidate({ score: 85 })]),
      });

      await runVideoEnrichment(baseInput, deps);

      expect(deps.lookupArtistIdentity).not.toHaveBeenCalled();
    });

    it('gates out candidates whose name and aliases do not match', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi
          .fn()
          .mockResolvedValue([candidate({ name: 'Cassius', aliases: ['Cash'] })]),
      });

      await runVideoEnrichment(baseInput, deps);

      expect(deps.lookupArtistIdentity).not.toHaveBeenCalled();
    });

    it('caps identity lookups at two per artist', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi
          .fn()
          .mockResolvedValue([
            candidate({ mbid: 'm1' }),
            candidate({ mbid: 'm2' }),
            candidate({ mbid: 'm3' }),
          ]),
        lookupArtistIdentity: vi.fn().mockResolvedValue(null),
      });

      await runVideoEnrichment(baseInput, deps);

      expect(deps.lookupArtistIdentity).toHaveBeenCalledTimes(2);
    });

    it('emits no personal identity facts for a group', async () => {
      const deps = buildDeps({
        lookupArtistIdentity: vi.fn().mockResolvedValue(identity({ type: 'Group' })),
      });

      const result = await runVideoEnrichment(baseInput, deps);

      expect(result.artists[0].suggestions).toEqual([]);
    });

    it('falls back to low-confidence web identity when structured sources miss', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi.fn().mockResolvedValue([]),
        resolveIdentityFallback: vi.fn().mockResolvedValue({
          bornOn: '1980-01-02',
          sources: [{ url: 'https://example.com/interview' }],
          note: 'Interview.',
        }),
      });

      const result = await runVideoEnrichment(baseInput, deps);

      expect(result.artists[0].suggestions).toContainEqual(
        expect.objectContaining({ field: 'bornOn', confidence: 'low' })
      );
    });

    it('skips the web fallback without a Serper key', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi.fn().mockResolvedValue([]),
        getSerperApiKey: vi.fn().mockResolvedValue(null),
      });

      await runVideoEnrichment(baseInput, deps);

      expect(deps.resolveIdentityFallback).not.toHaveBeenCalled();
    });

    it('isolates a per-artist failure (other artists still enrich)', async () => {
      const deps = buildDeps({
        searchArtistCandidates: vi
          .fn()
          .mockRejectedValueOnce(new Error('mb down'))
          .mockResolvedValueOnce([candidate()]),
      });
      const input: VideoEnrichmentInput = {
        ...baseInput,
        artists: [
          { artistId: 'a'.repeat(24), name: 'Ceschi', role: 'primary' },
          { artistId: 'b'.repeat(24), name: 'Ceschi', role: 'featured' },
        ],
      };

      const result = await runVideoEnrichment(input, deps);

      expect(result.artists[0].suggestions).toEqual([]);
      expect(result.artists[1].suggestions.length).toBeGreaterThan(0);
    });

    it('attaches the adjudicated release date to the video block', async () => {
      const releasedOn = {
        value: '2020-06-01',
        confidence: 'medium' as const,
        sources: [{ url: 'https://example.com/premiere' }],
        note: 'Premiere article.',
      };
      const deps = buildDeps({
        resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(releasedOn),
      });

      const result = await runVideoEnrichment(baseInput, deps);

      expect(result.video?.releasedOn).toEqual(releasedOn);
    });

    it('posts progress checkpoints when the event carries progress plumbing', async () => {
      const deps = buildDeps();
      const input: VideoEnrichmentInput = {
        ...baseInput,
        progressUrl: 'https://example.com/progress',
        jobToken: 'token-1',
      };

      await runVideoEnrichment(input, deps);

      const stages = vi.mocked(deps.postProgress).mock.calls.map(([args]) => args.stage);
      expect(stages).toEqual(
        expect.arrayContaining(['musicbrainz', 'wikidata', 'adjudicating', 'finalizing'])
      );
    });
  });

  describe('runVideoEnrichmentLambda', () => {
    it('returns an invalid-input envelope for a malformed event', async () => {
      const result = await runVideoEnrichmentLambda({ task: 'video-enrichment' }, buildDeps());

      expect(result.ok).toBe(false);
    });

    it('POSTs the callback when the event carries callback plumbing', async () => {
      const deps = buildDeps();
      const input: VideoEnrichmentInput = {
        ...baseInput,
        callbackUrl: 'https://example.com/callback',
        jobToken: 'token-1',
      };

      const result = await runVideoEnrichmentLambda(input, deps);

      expect(result.ok).toBe(true);
      expect(deps.postCallback).toHaveBeenCalledWith({
        url: 'https://example.com/callback',
        jobToken: 'token-1',
        result,
      });
    });
  });

  describe('isVideoEnrichmentTask', () => {
    it('recognizes the task discriminator', () => {
      expect(isVideoEnrichmentTask({ task: 'video-enrichment' })).toBe(true);
    });

    it('rejects a bio event (no task field)', () => {
      expect(isVideoEnrichmentTask({ artistId: 'x', displayName: 'Ceschi' })).toBe(false);
    });

    it('rejects a non-object event', () => {
      expect(isVideoEnrichmentTask('video-enrichment')).toBe(false);
    });
  });
  ```

- [ ] **15.7 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/video-enrichment.spec.ts
  ```

  Expected failure: `Cannot find module './video-enrichment.js'`.

- [ ] **15.8 Implement the orchestrator.** Create `bio-generator/src/video-enrichment.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { postBioCallback } from './callback.js';
  import { logEvent, toErrorMessage } from './lib/log.js';
  import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
  import { lookupArtistIdentity, searchArtistCandidates } from './musicbrainz.js';
  import { postBioProgress } from './progress.js';
  import { resolveIdentityFallback, resolveReleaseDateSuggestion } from './release-date.js';
  import { searchSerperWeb } from './serper.js';
  import { DEFAULT_GEMINI_MODEL, videoEnrichmentInputSchema } from './types.js';
  import { getWikidataData } from './wikidata.js';

  import type { MusicBrainzArtistCandidate, MusicBrainzArtistIdentity } from './musicbrainz.js';
  import type {
    VideoEnrichmentData,
    VideoEnrichmentInput,
    VideoEnrichmentResult,
    VideoProgressStage,
    VideoSuggestion,
  } from './types.js';
  import type { WikidataData } from './wikidata.js';

  /** Injectable collaborators so the orchestration can be unit-tested in full. */
  export interface VideoEnrichmentDeps {
    searchArtistCandidates: typeof searchArtistCandidates;
    lookupArtistIdentity: typeof lookupArtistIdentity;
    getWikidataData: typeof getWikidataData;
    searchSerperWeb: typeof searchSerperWeb;
    getGeminiApiKey: () => Promise<string>;
    getSerperApiKey: typeof getSerperApiKey;
    resolveReleaseDateSuggestion: typeof resolveReleaseDateSuggestion;
    resolveIdentityFallback: typeof resolveIdentityFallback;
    /** Best-effort POST of the result back to the web app's async callback. */
    postCallback: typeof postBioCallback;
    /** Best-effort POST of a single stage checkpoint. */
    postProgress: typeof postBioProgress;
  }

  const defaultDeps: VideoEnrichmentDeps = {
    searchArtistCandidates,
    lookupArtistIdentity,
    getWikidataData,
    searchSerperWeb,
    getGeminiApiKey,
    getSerperApiKey,
    resolveReleaseDateSuggestion,
    resolveIdentityFallback,
    postCallback: postBioCallback,
    postProgress: postBioProgress,
  };

  /** Candidates below this MusicBrainz search score never reach a lookup. */
  export const MB_MIN_CANDIDATE_SCORE = 90;
  /** High confidence additionally requires at least this score. */
  export const MB_HIGH_CONFIDENCE_SCORE = 95;
  /** Bounded fan-out: identity lookups per artist. */
  export const MAX_IDENTITY_LOOKUPS_PER_ARTIST = 2;
  /** Mirrors the web schema's per-artist suggestion cap. */
  export const MAX_SUGGESTIONS_PER_ARTIST = 12;
  /** Cap on aliases folded into one akaNames suggestion. */
  const MAX_ALIASES = 8;

  /**
   * Wikidata P106 occupations that gate high confidence: musician, singer,
   * singer-songwriter, rapper, record producer, composer.
   */
  export const MUSIC_OCCUPATION_IDS: readonly string[] = [
    'Q639669',
    'Q177220',
    'Q488205',
    'Q2252262',
    'Q183945',
    'Q36834',
  ];

  /** True when an unknown event is a `task: 'video-enrichment'` invoke. */
  export const isVideoEnrichmentTask = (event: unknown): boolean =>
    typeof event === 'object' &&
    event !== null &&
    'task' in event &&
    event.task === 'video-enrichment';

  const namesEqual = (a: string, b: string): boolean =>
    a.trim().toLowerCase() === b.trim().toLowerCase();

  /** Score gate companion: the candidate must equal the name or one alias. */
  const candidateNameMatches = (candidate: MusicBrainzArtistCandidate, name: string): boolean =>
    namesEqual(candidate.name, name) || candidate.aliases.some((alias) => namesEqual(alias, name));

  const isSingleToken = (name: string): boolean => name.trim().split(/\s+/).length === 1;

  const isFullDate = (value: string | null | undefined): value is string =>
    Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

  /** Confidence inputs for one fact. */
  export interface ConfidenceSignals {
    score: number;
    /** Wikidata corroborates THIS specific fact. */
    corroborated: boolean;
    /** Wikidata P106 hits the music-occupation allowlist. */
    occupationOk: boolean;
    /** Single-token artist names are collision-prone. */
    singleToken: boolean;
  }

  /**
   * Confidence rubric (design spec): high = MB ≥95 + Wikidata corroboration of
   * the specific fact + occupation gate; single-token names are hard-capped at
   * medium without full corroboration; everything else structured is medium.
   */
  export const confidenceFor = ({
    score,
    corroborated,
    occupationOk,
    singleToken,
  }: ConfidenceSignals): VideoSuggestion['confidence'] => {
    if (singleToken && !corroborated) return 'medium';
    return score >= MB_HIGH_CONFIDENCE_SCORE && corroborated && occupationOk ? 'high' : 'medium';
  };

  type InputArtist = VideoEnrichmentInput['artists'][number];
  type KnownIdentity = NonNullable<InputArtist['known']>;

  /** The known value for a field, if the web app already holds one. */
  const knownValueFor = (
    known: KnownIdentity,
    field: VideoSuggestion['field']
  ): string | undefined => {
    switch (field) {
      case 'firstName':
        return known.firstName;
      case 'middleName':
        return known.middleName;
      case 'surname':
        return known.surname;
      case 'displayName':
        return known.displayName;
      case 'akaNames':
        return known.akaNames;
      case 'bornOn':
        return known.bornOn;
      default:
        return undefined;
    }
  };

  /** True when the suggested value adds nothing over the known identity. */
  const equalsKnown = (
    known: KnownIdentity | undefined,
    field: VideoSuggestion['field'],
    value: string
  ): boolean => {
    if (!known) return false;
    const current = knownValueFor(known, field);
    if (!current) return false;
    return field === 'bornOn'
      ? current.slice(0, 10) === value.slice(0, 10)
      : namesEqual(current, value);
  };

  /** First/middle/surname split of a legal name (middle = everything between). */
  const splitLegalName = (
    legal: string
  ): { firstName?: string; middleName?: string; surname?: string } => {
    const tokens = legal.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return {};
    if (tokens.length === 1) return { firstName: tokens[0] };
    return {
      firstName: tokens[0],
      ...(tokens.length > 2 ? { middleName: tokens.slice(1, -1).join(' ') } : {}),
      surname: tokens[tokens.length - 1],
    };
  };

  /** Everything one matched candidate contributes facts from. */
  interface IdentityContext {
    artist: InputArtist;
    candidate: MusicBrainzArtistCandidate;
    identity: MusicBrainzArtistIdentity;
    wikidata: WikidataData | null;
  }

  /** Provenance links for a structured-source fact. */
  const identitySources = (ctx: IdentityContext): VideoSuggestion['sources'] => {
    const sources: VideoSuggestion['sources'] = [
      { url: `https://musicbrainz.org/artist/${ctx.candidate.mbid}`, label: 'MusicBrainz' },
    ];
    if (ctx.identity.wikidataId) {
      sources.push({
        url: `https://www.wikidata.org/wiki/${ctx.identity.wikidataId}`,
        label: 'Wikidata',
      });
    }
    return sources;
  };

  /** bornOn: MB life-span begin, corroborated by a day-precision Wikidata P569. */
  const bornOnSuggestion = (
    ctx: IdentityContext,
    signals: ConfidenceSignals
  ): VideoSuggestion | null => {
    const mbDob = isFullDate(ctx.identity.lifeSpanBegin) ? ctx.identity.lifeSpanBegin : null;
    const wdDob =
      ctx.wikidata?.dateOfBirth?.precision === 11 ? ctx.wikidata.dateOfBirth.value : null;
    const value = mbDob ?? wdDob;
    if (!value || equalsKnown(ctx.artist.known, 'bornOn', value)) return null;
    const corroborated = Boolean(mbDob && wdDob && mbDob === wdDob);
    return {
      field: 'bornOn',
      value,
      confidence: confidenceFor({ ...signals, corroborated }),
      sources: identitySources(ctx),
    };
  };

  /** firstName/middleName/surname from the legal name (MB alias or WD P1477). */
  const legalNameSuggestions = (
    ctx: IdentityContext,
    signals: ConfidenceSignals
  ): VideoSuggestion[] => {
    const legal = ctx.identity.legalName ?? ctx.wikidata?.birthName;
    if (!legal) return [];
    const corroborated = Boolean(
      ctx.identity.legalName &&
      ctx.wikidata?.birthName &&
      namesEqual(ctx.identity.legalName, ctx.wikidata.birthName)
    );
    const confidence = confidenceFor({ ...signals, corroborated });
    const parts = splitLegalName(legal);
    const out: VideoSuggestion[] = [];
    const pushPart = (field: 'firstName' | 'middleName' | 'surname', value?: string): void => {
      if (value && !equalsKnown(ctx.artist.known, field, value)) {
        out.push({ field, value, confidence, sources: identitySources(ctx) });
      }
    };
    pushPart('firstName', parts.firstName);
    pushPart('middleName', parts.middleName);
    pushPart('surname', parts.surname);
    return out;
  };

  /** True when an alias is new information worth suggesting. */
  const isNewAlias = (
    alias: string,
    ctx: IdentityContext,
    seen: Set<string>,
    knownAliases: Set<string>
  ): boolean => {
    const key = alias.toLowerCase();
    if (!alias || seen.has(key) || knownAliases.has(key)) return false;
    if (namesEqual(alias, ctx.artist.name)) return false;
    return !(ctx.identity.legalName && namesEqual(alias, ctx.identity.legalName));
  };

  /** One akaNames suggestion folding the new MB + WD aliases (medium: noisy). */
  const aliasSuggestion = (ctx: IdentityContext): VideoSuggestion | null => {
    const knownAliases = new Set(
      (ctx.artist.known?.akaNames ?? '')
        .split(',')
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean)
    );
    const seen = new Set<string>();
    const fresh: string[] = [];
    for (const raw of [...ctx.identity.aliases, ...(ctx.wikidata?.aliases ?? [])]) {
      const alias = raw.trim();
      if (!isNewAlias(alias, ctx, seen, knownAliases)) continue;
      seen.add(alias.toLowerCase());
      fresh.push(alias);
    }
    if (fresh.length === 0) return null;
    return {
      field: 'akaNames',
      value: fresh.slice(0, MAX_ALIASES).join(', '),
      confidence: 'medium',
      sources: identitySources(ctx),
    };
  };

  /** displayName: the MB canonical name, only when the app has none. */
  const displayNameSuggestion = (ctx: IdentityContext): VideoSuggestion | null => {
    if (ctx.artist.known?.displayName) return null;
    if (namesEqual(ctx.candidate.name, ctx.artist.name)) return null;
    return {
      field: 'displayName',
      value: ctx.candidate.name,
      confidence: 'medium',
      sources: identitySources(ctx),
    };
  };

  /** Wikidata corroboration, isolated so its failure keeps the MB facts. */
  const safeWikidata = async (
    deps: VideoEnrichmentDeps,
    wikidataId: string
  ): Promise<WikidataData | null> => {
    try {
      return await deps.getWikidataData(wikidataId);
    } catch (err) {
      logEvent('warn', 'video_wikidata_failed', { wikidataId, error: toErrorMessage(err) });
      return null;
    }
  };

  /** Best-effort progress reporter (no-op without progress plumbing). */
  type VideoReport = (stage: VideoProgressStage, counts?: Record<string, number>) => Promise<void>;

  const buildVideoReport = (
    input: VideoEnrichmentInput,
    deps: VideoEnrichmentDeps
  ): VideoReport => {
    const { progressUrl, jobToken } = input;
    if (!progressUrl || !jobToken) return () => Promise.resolve();
    return async (stage, counts) => {
      try {
        await deps.postProgress({ progressUrl, jobToken, stage, counts });
      } catch {
        // Progress is a pure side channel — never let a checkpoint failure surface.
      }
    };
  };

  /** Facts from the FIRST surviving structured candidate; null = sources missed. */
  const structuredSuggestions = async (
    artist: InputArtist,
    deps: VideoEnrichmentDeps,
    report: VideoReport
  ): Promise<VideoSuggestion[] | null> => {
    const candidates = await deps.searchArtistCandidates(artist.name, 5);
    const gated = candidates
      .filter((c) => c.score >= MB_MIN_CANDIDATE_SCORE && candidateNameMatches(c, artist.name))
      .slice(0, MAX_IDENTITY_LOOKUPS_PER_ARTIST);
    for (const candidate of gated) {
      const identity = await deps.lookupArtistIdentity(candidate.mbid);
      if (!identity) continue;
      // Groups carry no personal identity facts (DOB/legal name are per-person).
      if (identity.type && identity.type !== 'Person') return [];
      await report('wikidata');
      const wikidata = identity.wikidataId ? await safeWikidata(deps, identity.wikidataId) : null;
      const ctx: IdentityContext = { artist, candidate, identity, wikidata };
      const signals: ConfidenceSignals = {
        score: candidate.score,
        corroborated: false, // overridden per fact
        occupationOk: Boolean(
          wikidata?.occupationIds.some((id) => MUSIC_OCCUPATION_IDS.includes(id))
        ),
        singleToken: isSingleToken(artist.name),
      };
      const out: VideoSuggestion[] = [];
      const born = bornOnSuggestion(ctx, signals);
      if (born) out.push(born);
      out.push(...legalNameSuggestions(ctx, signals));
      const alias = aliasSuggestion(ctx);
      if (alias) out.push(alias);
      const display = displayNameSuggestion(ctx);
      if (display) out.push(display);
      return out;
    }
    return null;
  };

  /** Grouped args threaded through the per-artist enrichment. */
  interface EnrichArtistArgs {
    artist: InputArtist;
    keys: { gemini: string; serper: string | null };
    model: string;
    deps: VideoEnrichmentDeps;
    report: VideoReport;
  }

  /** Map web-fallback facts onto low-confidence suggestions. */
  const fallbackSuggestions = async ({
    artist,
    keys,
    model,
    deps,
  }: EnrichArtistArgs): Promise<VideoSuggestion[]> => {
    if (!keys.serper) return [];
    const found = await deps.resolveIdentityFallback({
      name: artist.name,
      serperKey: keys.serper,
      geminiKey: keys.gemini,
      model,
    });
    if (!found) return [];
    const out: VideoSuggestion[] = [];
    const push = (
      field: 'firstName' | 'middleName' | 'surname' | 'bornOn',
      value?: string
    ): void => {
      if (value && !equalsKnown(artist.known, field, value)) {
        out.push({ field, value, confidence: 'low', sources: found.sources, note: found.note });
      }
    };
    push('firstName', found.firstName);
    push('middleName', found.middleName);
    push('surname', found.surname);
    push('bornOn', found.bornOn);
    return out;
  };

  /** One artist, fully isolated: any throw degrades to zero suggestions. */
  const enrichOneArtist = async (args: EnrichArtistArgs): Promise<VideoSuggestion[]> => {
    try {
      const structured = await structuredSuggestions(args.artist, args.deps, args.report);
      if (structured !== null) return structured;
      await args.report('web-search');
      return await fallbackSuggestions(args);
    } catch (err) {
      logEvent('warn', 'video_artist_enrichment_failed', {
        artistId: args.artist.artistId,
        error: toErrorMessage(err),
      });
      return [];
    }
  };

  /**
   * Orchestrates one video-enrichment run: per artist, a MusicBrainz candidate
   * gate (score ≥90 + name/alias equality, ≤2 identity lookups) with Wikidata
   * corroboration and the P106 music-occupation gate; a web+Gemini identity
   * fallback (always low confidence) when structured sources miss; and one
   * release-date adjudication for the video. Facts equal to the `known` block
   * are skipped. Sequential and best-effort throughout — one artist's failure
   * never aborts the run.
   */
  export const runVideoEnrichment = async (
    input: VideoEnrichmentInput,
    deps: VideoEnrichmentDeps = defaultDeps
  ): Promise<VideoEnrichmentData> => {
    const report = buildVideoReport(input, deps);
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const keys = { gemini: await deps.getGeminiApiKey(), serper: await deps.getSerperApiKey() };

    await report('musicbrainz', { artists: input.artists.length });
    const artists: VideoEnrichmentData['artists'] = [];
    for (const artist of input.artists) {
      const suggestions = await enrichOneArtist({ artist, keys, model, deps, report });
      artists.push({
        artistId: artist.artistId,
        suggestions: suggestions.slice(0, MAX_SUGGESTIONS_PER_ARTIST),
      });
    }

    await report('adjudicating');
    const releasedOn = keys.serper
      ? await deps.resolveReleaseDateSuggestion(
          {
            title: input.title,
            artistDisplay: input.artistDisplay,
            adminReleasedOn: input.releasedOn,
            serperKey: keys.serper,
            geminiKey: keys.gemini,
            model,
          },
          { searchWeb: deps.searchSerperWeb }
        )
      : null;

    await report('finalizing');
    return { artists, ...(releasedOn ? { video: { releasedOn } } : {}), model };
  };

  /**
   * The testable Lambda core for `task: 'video-enrichment'`: validate, run,
   * convert a throw into the `ok: false` envelope, and — when the event carries
   * callback plumbing — POST the result to the web app (best-effort).
   */
  export const runVideoEnrichmentLambda = async (
    event: unknown,
    deps: VideoEnrichmentDeps = defaultDeps
  ): Promise<VideoEnrichmentResult> => {
    const parsed = videoEnrichmentInputSchema.safeParse(event);
    if (!parsed.success) {
      return {
        ok: false,
        error: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
      };
    }

    let result: VideoEnrichmentResult;
    try {
      result = { ok: true, data: await runVideoEnrichment(parsed.data, deps) };
    } catch (err) {
      logEvent('warn', 'video_enrichment_failed', { error: toErrorMessage(err) });
      result = {
        ok: false,
        error: err instanceof Error ? err.message : 'Video enrichment failed',
      };
    }

    const { callbackUrl, jobToken } = parsed.data;
    if (callbackUrl && jobToken) {
      await deps.postCallback({ url: callbackUrl, jobToken, result });
    }
    return result;
  };
  ```

- [ ] **15.9 Run it, expect PASS.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/video-enrichment.spec.ts src/release-date.spec.ts
  ```

- [ ] **15.10 Write the failing handler routing tests.** Append to `bio-generator/src/handler.spec.ts` (top-level; place the `vi.mock` beside the file's existing mocks, and make sure `runLambda` is in the spec's existing import from `./handler.js`):

  ```ts
  vi.mock('./video-enrichment.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./video-enrichment.js')>();
    return {
      ...actual,
      runVideoEnrichmentLambda: vi.fn().mockResolvedValue({ ok: false, error: 'stubbed' }),
    };
  });

  describe('runLambda task routing', () => {
    it('routes a video-enrichment event to the video mode', async () => {
      const { runVideoEnrichmentLambda } = await import('./video-enrichment.js');

      const result = await runLambda({ task: 'video-enrichment', videoId: 'v1' });

      expect(vi.mocked(runVideoEnrichmentLambda)).toHaveBeenCalledWith({
        task: 'video-enrichment',
        videoId: 'v1',
      });
      expect(result).toEqual({ ok: false, error: 'stubbed' });
    });

    it('leaves a task-less bio event on the bio path', async () => {
      const { runVideoEnrichmentLambda } = await import('./video-enrichment.js');

      await runLambda({}); // invalid bio input — still must NOT route to video

      expect(vi.mocked(runVideoEnrichmentLambda)).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **15.11 Run it, expect FAIL.**

  ```bash
  cd bio-generator && pnpm run test:run -- src/handler.spec.ts
  ```

  Expected failure: the routing test gets the bio path's `Invalid input: …` envelope instead of `{ ok: false, error: 'stubbed' }` (no routing exists yet).

- [ ] **15.12 Implement the handler routing (exact minimal diff).** In `bio-generator/src/handler.ts`:

  1. Add to the value imports (after the `./types.js` import):

     ```ts
     import { isVideoEnrichmentTask, runVideoEnrichmentLambda } from './video-enrichment.js';
     ```

     and to the type imports (in the existing `from './types.js'` type import list) add `VideoEnrichmentResult`.

  2. Replace:

     ```ts
     export const runLambda = async (
       event: unknown,
       deps: BioGeneratorDeps = defaultDeps
     ): Promise<BioGenerationResult> => {
       const parsed = bioGenerationInputSchema.safeParse(event);
     ```

     with:

     ```ts
     export const runLambda = async (
       event: unknown,
       deps: BioGeneratorDeps = defaultDeps
     ): Promise<BioGenerationResult | VideoEnrichmentResult> => {
       // Route on the task discriminator FIRST so the bio path below stays
       // byte-identical for every existing event shape (bio events carry no
       // `task` field).
       if (isVideoEnrichmentTask(event)) {
         return runVideoEnrichmentLambda(event);
       }

       const parsed = bioGenerationInputSchema.safeParse(event);
     ```

  3. Replace:

     ```ts
     export const lambdaHandler = async (
       event: unknown,
       _context?: unknown
     ): Promise<BioGenerationResult> => runLambda(event);
     ```

     with:

     ```ts
     export const lambdaHandler = async (
       event: unknown,
       _context?: unknown
     ): Promise<BioGenerationResult | VideoEnrichmentResult> => runLambda(event);
     ```

  Nothing else in `handler.ts` changes.

- [ ] **15.13 Run the full Lambda suite, expect PASS.**

  ```bash
  cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run
  ```

- [ ] **15.14 Gate + commit.**

  ```bash
  cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run
  cd .. && pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  git add bio-generator/src/
  git commit -m "feat(bio-generator): ✨ video enrichment mode"
  ```

---

## Part B execution notes

- **Ordering:** Tasks 7 → 13 are strictly sequential on the web side (each consumes the previous task's exports). Tasks 14–15 (Lambda) only depend on Task 8's wire shapes for lockstep review and can run in parallel with Tasks 9–13 if desired — but commit them in numbered order to keep the history reviewable.
- **Deploy ordering (from the spec):** Lambda first (the new mode is inert until the web dispatches it), then `prisma db push`, then web.
- **Coverage:** both workspaces must hold ≥95% branches; the new modules above are spec'd at or above that density. If `pnpm run test:coverage:check` flags a shortfall, add branch tests to the flagged module rather than lowering the baseline.
- **Wire lockstep reminders:** `VIDEO_PROGRESS_STAGES`, `videoSuggestionSchema`, `videoEnrichmentDataSchema`, and the invoke input (`VideoEnrichmentLambdaInput` ↔ `videoEnrichmentInputSchema`) each exist in BOTH projects (they cannot share a module). Any change to one side must land in the same commit as its mirror.

# Video Metadata Enrichment — Part C: Client Data Layer, Admin UI, E2E (Tasks 16–21)

**Spec:** `docs/superpowers/specs/2026-07-11-video-metadata-enrichment-design.md`
**Branch:** `feat/video-metadata-enrichment` (worktree `.claude/worktrees/feat+video-metadata-enrichment`)
**Depends on:** Parts A/B (wire schema `@/lib/validation/video-enrichment-schema`, `queryKeys.videos.enrichment(id)`, `runVideoEnrichmentAction`, `applyVideoSuggestionAction`, extended `videoRowSchema`, `VideoArtist` model, `videoEnrichmentFixture` fake path). All Part A/B names are consumed exactly as contracted — do not rename.

**Execution rules (binding):** TDD every step (failing test → minimal impl → pass → commit). MPL header from `HEADER.txt` on every new file. Gate before each commit is enforced by hooks (`lint-staged` + `vitest --changed`); the full gate runs in Task 21. Never touch `.env*`; E2E only against the Docker Mongo (`pnpm run e2e:docker:up`).

**Assumptions consumed from Parts A/B (verify at execution, adjust names only if they differ):**

- The inferred wire type is exported as `VideoEnrichmentStatusResponse` from `@/lib/validation/video-enrichment-schema` (alongside `videoEnrichmentStatusResponseSchema`, `isInFlightEnrichmentStatus`, `VIDEO_PROGRESS_STAGES`).
- Both actions resolve to `AdminActionResult` (`{ success: boolean; error?: string }` from `@/lib/actions/run-admin-entity-action`).
- With `BIO_GENERATOR_FAKE=true` (already set in `playwright.config.ts`), `runVideoEnrichmentAction` runs the deterministic fake: sets `pending`, pauses ≥4 s (like the bio fake, so the 2.5 s poll observes the in-flight state), then writes per-artist suggestions bornOn `'1985-03-15'` (high) + akaNames `'E2E Alias'` (medium) with `musicbrainz.org` sources, plus releasedOn `'2020-06-01'` (medium), and finishes `succeeded`. Artist sync (`findOrCreateByName`) matches existing artists by name/slug, so the seeded shells below are found, not duplicated.

---

### Task 16: `useVideoEnrichmentStatusQuery` hook

**Files:**

- Create: `src/app/hooks/use-video-enrichment-status-query.spec.ts`
- Create: `src/app/hooks/use-video-enrichment-status-query.ts`

**Interfaces:**

- Consumes: `videoEnrichmentStatusResponseSchema`, `isInFlightEnrichmentStatus(status)`, type `VideoEnrichmentStatusResponse` from `@/lib/validation/video-enrichment-schema`; `queryKeys.videos.enrichment(id)` from `@/lib/query-keys`; `parseResponse` from `@/app/hooks/fetch-and-parse`; `QueryOptionsOverride` from `@/hooks/query-options`.
- Produces:
  ```ts
  export const useVideoEnrichmentStatusQuery: (
    videoId: string,
    options?: QueryOptionsOverride<VideoEnrichmentStatusResponse>
  ) => {
    isPending: boolean;
    error: Error;
    data: VideoEnrichmentStatusResponse | undefined;
    refetch: () => Promise<unknown>;
  };
  ```

**Steps:**

- [ ] Write the failing spec `src/app/hooks/use-video-enrichment-status-query.spec.ts` (mirrors `use-artist-bio-generation-status-query.spec.ts`):

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { renderHook } from '@testing-library/react';

  import { queryKeys } from '@/lib/query-keys';

  import { useVideoEnrichmentStatusQuery } from './use-video-enrichment-status-query';

  const mockUseQuery = vi.hoisted(() => vi.fn());

  vi.mock('@tanstack/react-query', () => ({
    useQuery: (options: unknown) => mockUseQuery(options),
  }));

  interface QueryOptionsShape {
    queryKey: unknown[];
    enabled: boolean;
    staleTime: number;
    queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    refetchInterval: (query: { state: { data?: { status?: string | null } } }) => number | false;
  }

  /** A minimal wire payload that satisfies videoEnrichmentStatusResponseSchema. */
  const succeededPayload = {
    status: 'succeeded',
    error: null,
    progress: null,
    enrichedAt: '2026-07-11T00:00:00.000Z',
    currentReleasedOn: '2026-02-01',
    artists: [
      {
        artistId: 'a1',
        displayName: 'Lead Artist',
        role: 'PRIMARY',
        current: {
          firstName: 'Lead',
          middleName: null,
          surname: 'Artist',
          akaNames: null,
          displayName: 'Lead Artist',
          bornOn: null,
        },
      },
    ],
    suggestions: [
      {
        id: 's1',
        artistId: 'a1',
        field: 'bornOn',
        value: '1985-03-15',
        confidence: 'high',
        sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
        note: null,
        status: 'pending',
      },
    ],
  };

  describe('useVideoEnrichmentStatusQuery', () => {
    beforeEach(() => {
      mockUseQuery.mockReturnValue({
        isPending: false,
        error: undefined,
        data: undefined,
        refetch: vi.fn(),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('uses the shared videos.enrichment query-key factory', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.queryKey).toEqual(queryKeys.videos.enrichment('video-1'));
    });

    it('enables the query by default for a non-empty video id', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.enabled).toBe(true);
    });

    it('disables the query when the video id is empty', () => {
      renderHook(() => useVideoEnrichmentStatusQuery(''));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.enabled).toBe(false);
    });

    it('keeps the query disabled when the caller passes enabled false', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1', { enabled: false }));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.enabled).toBe(false);
    });

    it('marks status data stale immediately so enabling the query always refetches', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.staleTime).toBe(0);
    });

    it('lets a caller override the staleTime default', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1', { staleTime: 10_000 }));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.staleTime).toBe(10_000);
    });

    it('defaults the returned error when the query has none', () => {
      const { result } = renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      expect(result.current.error).toEqual(Error('Unknown error'));
    });

    it('fetches and parses the status on a 200 response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => succeededPayload })
      );

      renderHook(() => useVideoEnrichmentStatusQuery('video 1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
      const { signal } = new AbortController();

      await expect(options.queryFn({ signal })).resolves.toEqual(succeededPayload);
      expect(global.fetch).toHaveBeenCalledWith('/api/videos/video%201/enrichment', { signal });
    });

    it('throws when the response is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
      const { signal } = new AbortController();

      await expect(options.queryFn({ signal })).rejects.toThrow(
        'Failed to fetch video enrichment status'
      );
    });

    it('polls on the configured interval while the job is pending', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: { data: { status: 'pending' } } })).toBe(2500);
    });

    it('polls on the configured interval while the job is processing', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: { data: { status: 'processing' } } })).toBe(2500);
    });

    it('stops polling once the job has succeeded', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: { data: { status: 'succeeded' } } })).toBe(false);
    });

    it('stops polling once the job has failed', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: { data: { status: 'failed' } } })).toBe(false);
    });

    it('does not poll when the video has never been enriched (status null)', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: { data: { status: null } } })).toBe(false);
    });

    it('does not poll before any status data is fetched', () => {
      renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

      const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

      expect(options.refetchInterval({ state: {} })).toBe(false);
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/hooks/use-video-enrichment-status-query.spec.ts` — expect FAIL: `Cannot find module './use-video-enrichment-status-query'` (hook file does not exist yet).

- [ ] Implement `src/app/hooks/use-video-enrichment-status-query.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { useQuery } from '@tanstack/react-query';

  import { queryKeys } from '@/lib/query-keys';
  import {
    isInFlightEnrichmentStatus,
    videoEnrichmentStatusResponseSchema,
    type VideoEnrichmentStatusResponse,
  } from '@/lib/validation/video-enrichment-schema';

  import { parseResponse } from './fetch-and-parse';

  import type { QueryOptionsOverride } from './query-options';

  /** Poll cadence while an enrichment job is pending/processing. */
  const POLL_INTERVAL_MS = 2500;

  /**
   * Fetches the async enrichment status for a video from
   * `/api/videos/:id/enrichment`, forwarding the TanStack `AbortSignal`.
   *
   * @param videoId - The video whose enrichment status to read.
   * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
   * @returns The parsed status, probe/job state, artists, and suggestions.
   */
  const fetchVideoEnrichmentStatus = async (
    videoId: string,
    signal?: AbortSignal
  ): Promise<VideoEnrichmentStatusResponse> => {
    const url = `/api/videos/${encodeURIComponent(videoId)}/enrichment`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw Error('Failed to fetch video enrichment status');
    }
    return parseResponse(url, videoEnrichmentStatusResponseSchema, await response.json());
  };

  /**
   * Polls a video's async web-enrichment status. The query refetches on an
   * interval only while the job is in flight (`pending`/`processing`); terminal
   * states (`succeeded`/`failed`) and `null` (never enriched) do not poll.
   * Because the query defaults to `staleTime: 0` (poll-status data is never
   * considered fresh), mounting the edit page right after create fires an
   * immediate fetch — the server-set `pending` status then resumes the 2.5s
   * interval with no client trigger.
   *
   * @param videoId - The video to poll; the query is disabled when empty.
   * @param options - Caller overrides spread into `useQuery` (notably `enabled`);
   * the non-empty-id gate and adaptive `refetchInterval` are applied on top.
   * @returns The query state: `isPending`, `error` (defaulted), `data`, `refetch`.
   */
  export const useVideoEnrichmentStatusQuery = (
    videoId: string,
    options: QueryOptionsOverride<VideoEnrichmentStatusResponse> = {}
  ) => {
    const {
      isPending,
      error = Error('Unknown error'),
      data,
      refetch,
    } = useQuery({
      queryKey: queryKeys.videos.enrichment(videoId),
      queryFn: ({ signal }) => fetchVideoEnrichmentStatus(videoId, signal),
      staleTime: 0,
      ...options,
      enabled: (options.enabled ?? true) && !!videoId,
      refetchInterval: (query) =>
        isInFlightEnrichmentStatus(query.state.data?.status) ? POLL_INTERVAL_MS : false,
    });

    return { isPending, error, data, refetch };
  };
  ```

- [ ] Run `pnpm run test:run src/app/hooks/use-video-enrichment-status-query.spec.ts` — expect PASS (16 tests).

- [ ] Commit:
  ```bash
  git add src/app/hooks/use-video-enrichment-status-query.ts src/app/hooks/use-video-enrichment-status-query.spec.ts
  git commit -m "feat(videos): ✨ enrichment status query hook"
  ```

---

### Task 17: Enrichment mutation hooks (cache-discipline regression locked)

**Files:**

- Create: `src/app/hooks/mutations/use-video-enrichment-mutations.spec.ts`
- Create: `src/app/hooks/mutations/use-video-enrichment-mutations.ts`

**Interfaces:**

- Consumes: `runVideoEnrichmentAction(videoId: string): Promise<AdminActionResult>` from `@/lib/actions/run-video-enrichment-action`; `applyVideoSuggestionAction(input: { suggestionId: string; op: 'apply' | 'dismiss'; expectedCurrent?: string | null }): Promise<AdminActionResult>` from `@/lib/actions/apply-video-suggestion-action`; `AdminActionResult` from `@/lib/actions/run-admin-entity-action`; `queryKeys` from `@/lib/query-keys`; `toast` from `sonner`.
- Produces:

  ```ts
  export interface ApplyVideoSuggestionInput {
    suggestionId: string;
    op: 'apply' | 'dismiss';
    expectedCurrent?: string | null;
  }

  export const useRunVideoEnrichmentMutation: (videoId: string) => {
    runVideoEnrichment: () => void;
    isRunningVideoEnrichment: boolean;
  };

  export const useApplyVideoSuggestionMutation: (videoId: string) => {
    applyVideoSuggestion: (input: ApplyVideoSuggestionInput) => void;
    applyVideoSuggestionAsync: (input: ApplyVideoSuggestionInput) => Promise<AdminActionResult>;
    isApplyingVideoSuggestion: boolean;
  };
  ```

- Invalidation contract (the WHOLE point of this task): run-success → `queryKeys.videos.enrichment(videoId)` ONLY. apply-success with `op: 'apply'` → enrichment key + `queryKeys.artists.all`. `op: 'dismiss'` → enrichment key only. NEVER `queryKeys.videos.detail(videoId)` and NEVER `queryKeys.videos.all` — a `videos.detail` refetch re-runs `form.reset(mapVideoToFormValues(video))` in `video-form.tsx` and wipes the admin's dirty edits.

**Steps:**

- [ ] Write the failing spec `src/app/hooks/mutations/use-video-enrichment-mutations.spec.ts` (module-boundary mocking in the style of `use-video-mutations.spec.ts`):

  ```ts
  // @vitest-environment jsdom
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  import { renderHook } from '@testing-library/react';
  import { toast } from 'sonner';

  import { applyVideoSuggestionAction } from '@/lib/actions/apply-video-suggestion-action';
  import { runVideoEnrichmentAction } from '@/lib/actions/run-video-enrichment-action';
  import { queryKeys } from '@/lib/query-keys';

  import {
    useApplyVideoSuggestionMutation,
    useRunVideoEnrichmentMutation,
    type ApplyVideoSuggestionInput,
  } from './use-video-enrichment-mutations';

  const useMutationMock = vi.hoisted(() => vi.fn());
  const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

  vi.mock('@tanstack/react-query', () => ({
    useMutation: (options: unknown) => useMutationMock(options),
    useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
  }));

  vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
  vi.mock('@/lib/actions/run-video-enrichment-action', () => ({
    runVideoEnrichmentAction: vi.fn(),
  }));
  vi.mock('@/lib/actions/apply-video-suggestion-action', () => ({
    applyVideoSuggestionAction: vi.fn(),
  }));

  interface MutationOptions<TVariables> {
    mutationFn: (variables: TVariables) => Promise<unknown>;
    onSuccess: (result: { success: boolean; error?: string }, variables: TVariables) => void;
  }

  const getOptions = <TVariables>(renderFn: () => unknown): MutationOptions<TVariables> => {
    renderHook(renderFn);
    return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions<TVariables>;
  };

  const applyInput: ApplyVideoSuggestionInput = {
    suggestionId: 's1',
    op: 'apply',
    expectedCurrent: null,
  };
  const dismissInput: ApplyVideoSuggestionInput = { suggestionId: 's1', op: 'dismiss' };

  beforeEach(() => {
    useMutationMock.mockReset();
    invalidateQueriesMock.mockClear();
    useMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  describe('useRunVideoEnrichmentMutation', () => {
    it('calls runVideoEnrichmentAction with the video id', async () => {
      vi.mocked(runVideoEnrichmentAction).mockResolvedValue({ success: true });
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      await opts.mutationFn(undefined);

      expect(vi.mocked(runVideoEnrichmentAction)).toHaveBeenCalledWith('v1');
    });

    it('invalidates only the enrichment status query on success', async () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: true }, undefined);

      expect(invalidateQueriesMock.mock.calls).toEqual([
        [{ queryKey: queryKeys.videos.enrichment('v1') }],
      ]);
    });

    it('REGRESSION: never invalidates videos.detail (a refetch resets the mounted form)', () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: true }, undefined);

      expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
        queryKey: queryKeys.videos.detail('v1'),
      });
    });

    it('never invalidates the videos.all umbrella key', () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: true }, undefined);

      expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
        queryKey: queryKeys.videos.all,
      });
    });

    it('surfaces a failed result as an error toast', () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: false, error: 'Enrichment is busy' }, undefined);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Enrichment is busy');
    });

    it('does not invalidate anything on a failed result', () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: false, error: 'Enrichment is busy' }, undefined);

      expect(invalidateQueriesMock).not.toHaveBeenCalled();
    });

    it('falls back to a default message when a failed result has no error', () => {
      const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

      opts.onSuccess({ success: false }, undefined);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to start enrichment');
    });
  });

  describe('useApplyVideoSuggestionMutation', () => {
    it('forwards the input to applyVideoSuggestionAction', async () => {
      vi.mocked(applyVideoSuggestionAction).mockResolvedValue({ success: true });
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      await opts.mutationFn(applyInput);

      expect(vi.mocked(applyVideoSuggestionAction)).toHaveBeenCalledWith(applyInput);
    });

    it('invalidates the enrichment key and artists.all when an apply succeeds', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: true }, applyInput);

      expect(invalidateQueriesMock.mock.calls).toEqual([
        [{ queryKey: queryKeys.videos.enrichment('v1') }],
        [{ queryKey: queryKeys.artists.all }],
      ]);
    });

    it('invalidates only the enrichment key when a dismiss succeeds', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: true }, dismissInput);

      expect(invalidateQueriesMock.mock.calls).toEqual([
        [{ queryKey: queryKeys.videos.enrichment('v1') }],
      ]);
    });

    it('REGRESSION: an apply never invalidates videos.detail (form-reset hazard)', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: true }, applyInput);

      expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
        queryKey: queryKeys.videos.detail('v1'),
      });
    });

    it('an apply never invalidates the videos.all umbrella key', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: true }, applyInput);

      expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
        queryKey: queryKeys.videos.all,
      });
    });

    it('surfaces a failed result as an error toast', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: false, error: 'Value changed since suggested' }, applyInput);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Value changed since suggested');
    });

    it('does not invalidate anything on a failed result', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: false, error: 'Value changed since suggested' }, applyInput);

      expect(invalidateQueriesMock).not.toHaveBeenCalled();
    });

    it('falls back to a default message when a failed result has no error', () => {
      const opts = getOptions<ApplyVideoSuggestionInput>(() =>
        useApplyVideoSuggestionMutation('v1')
      );

      opts.onSuccess({ success: false }, dismissInput);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update suggestion');
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/hooks/mutations/use-video-enrichment-mutations.spec.ts` — expect FAIL: `Cannot find module './use-video-enrichment-mutations'`.

- [ ] Implement `src/app/hooks/mutations/use-video-enrichment-mutations.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { toast } from 'sonner';

  import { applyVideoSuggestionAction } from '@/lib/actions/apply-video-suggestion-action';
  import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
  import { runVideoEnrichmentAction } from '@/lib/actions/run-video-enrichment-action';
  import { queryKeys } from '@/lib/query-keys';

  /**
   * Input for one suggestion apply/dismiss. `releasedOn` suggestions must NEVER
   * be sent with `op: 'apply'` (the server rejects them) — the release date is
   * applied into the RHF form instead; dismiss is allowed.
   */
  export interface ApplyVideoSuggestionInput {
    suggestionId: string;
    op: 'apply' | 'dismiss';
    expectedCurrent?: string | null;
  }

  interface UseRunVideoEnrichmentMutationResult {
    /** Triggers (or re-triggers) the async enrichment job for the video. */
    runVideoEnrichment: () => void;
    /** True while the trigger action is in flight. */
    isRunningVideoEnrichment: boolean;
  }

  interface UseApplyVideoSuggestionMutationResult {
    /** Applies or dismisses one suggestion (fire-and-forget). */
    applyVideoSuggestion: (input: ApplyVideoSuggestionInput) => void;
    /** Awaitable variant used by Apply-all's sequential stop-on-first-failure loop. */
    applyVideoSuggestionAsync: (input: ApplyVideoSuggestionInput) => Promise<AdminActionResult>;
    /** True while any apply/dismiss is in flight. */
    isApplyingVideoSuggestion: boolean;
  }

  /**
   * Mutation hook wrapping {@link runVideoEnrichmentAction}. On a successful
   * trigger it invalidates ONLY the enrichment status query so polling picks up
   * the server-set `pending` state. It deliberately never touches
   * `queryKeys.videos.detail` / `videos.all`: a `videos.detail` refetch re-runs
   * `form.reset` in the mounted video form and would wipe dirty edits. A failed
   * result surfaces as an error toast.
   *
   * @param videoId - The video whose enrichment cache to invalidate.
   */
  export const useRunVideoEnrichmentMutation = (
    videoId: string
  ): UseRunVideoEnrichmentMutationResult => {
    const queryClient = useQueryClient();
    const { mutate: runVideoEnrichment, isPending: isRunningVideoEnrichment } = useMutation<
      AdminActionResult,
      Error,
      void
    >({
      mutationFn: () => runVideoEnrichmentAction(videoId),
      onSuccess: (result) => {
        if (!result.success) {
          toast.error(result.error ?? 'Failed to start enrichment');
          return;
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.videos.enrichment(videoId) });
      },
    });

    return { runVideoEnrichment, isRunningVideoEnrichment };
  };

  /**
   * Mutation hook wrapping {@link applyVideoSuggestionAction} (pessimistic — the
   * UI only flips state from the refetched status). A successful `apply`
   * invalidates the enrichment status query plus `artists.all` (the applied
   * fact changed artist data); a `dismiss` invalidates the enrichment key only.
   * Never invalidates `videos.detail` / `videos.all` (form-reset hazard — see
   * {@link useRunVideoEnrichmentMutation}). A failed result surfaces as an
   * error toast.
   *
   * @param videoId - The video whose enrichment cache to invalidate.
   */
  export const useApplyVideoSuggestionMutation = (
    videoId: string
  ): UseApplyVideoSuggestionMutationResult => {
    const queryClient = useQueryClient();
    const {
      mutate: applyVideoSuggestion,
      mutateAsync: applyVideoSuggestionAsync,
      isPending: isApplyingVideoSuggestion,
    } = useMutation<AdminActionResult, Error, ApplyVideoSuggestionInput>({
      mutationFn: (input) => applyVideoSuggestionAction(input),
      onSuccess: (result, { op }) => {
        if (!result.success) {
          toast.error(result.error ?? 'Failed to update suggestion');
          return;
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.videos.enrichment(videoId) });
        if (op === 'apply') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });
        }
      },
    });

    return { applyVideoSuggestion, applyVideoSuggestionAsync, isApplyingVideoSuggestion };
  };
  ```

- [ ] Run `pnpm run test:run src/app/hooks/mutations/use-video-enrichment-mutations.spec.ts` — expect PASS (15 tests).

- [ ] Commit:
  ```bash
  git add src/app/hooks/mutations/use-video-enrichment-mutations.ts src/app/hooks/mutations/use-video-enrichment-mutations.spec.ts
  git commit -m "feat(videos): ✨ enrichment mutation hooks"
  ```

---

### Task 18: Probe formatters + `VideoTechnicalMetadataCard` (mounted for ALL categories)

**Files:**

- Create: `src/app/components/forms/videos/enrichment/video-enrichment-format.spec.ts`
- Create: `src/app/components/forms/videos/enrichment/video-enrichment-format.ts`
- Create: `src/app/components/forms/videos/enrichment/video-technical-metadata-card.spec.tsx`
- Create: `src/app/components/forms/videos/enrichment/video-technical-metadata-card.tsx`
- Modify: `src/app/components/forms/video-form.tsx` (mount card under the file section)
- Modify: `src/app/components/forms/video-form.spec.tsx` (mount-gating tests + fixture probe fields)

**Interfaces:**

- Consumes: `VideoRow` from `@/lib/validation/video-schema` (Part A extended it with nullable `width`, `height`, `videoCodec`, `audioCodec`, `bitrateKbps`, `frameRate`, `container`, `audioChannels`, `audioSampleRateHz`, `sourceCreatedAt`, `probedAt`, `probeError`, `enrichmentStatus`); **existing** `formatDuration` from `@/lib/utils/format-duration` (searched the repo — this is the only duration formatter; REUSE it, do not add another).
- Produces:
  ```ts
  export const formatResolution: (
    width: number | null | undefined,
    height: number | null | undefined
  ) => string | null; // '1920×1080'
  export const formatBitrate: (bitrateKbps: number | null | undefined) => string | null; // 4200 → '4.2 Mbps', 320 → '320 kbps'
  export const formatFrameRate: (frameRate: number | null | undefined) => string | null; // 29.97 → '29.97 fps'
  export const buildTechnicalMetadataRows: (
    video: VideoRow
  ) => Array<{ label: string; value: string }>;
  export const VideoTechnicalMetadataCard: ({
    video,
  }: {
    video: VideoRow;
  }) => React.ReactElement | null;
  ```
- Card contract: renders nothing until `video.probedAt` or `video.probeError` is set; probe-error state shows the message; otherwise a `<dl>` (`md:grid-cols-2`) of only the non-null rows. Root carries `data-testid="video-technical-metadata-card"`. Not interactive → NO `'use client'` (it is client-rendered via the form's import graph).

**Steps:**

- [ ] Write the failing formatter spec `src/app/components/forms/videos/enrichment/video-enrichment-format.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { formatBitrate, formatFrameRate, formatResolution } from './video-enrichment-format';

  describe('formatResolution', () => {
    it('joins width and height with a multiplication sign', () => {
      expect(formatResolution(1920, 1080)).toBe('1920×1080');
    });

    it('returns null when the width is missing', () => {
      expect(formatResolution(null, 1080)).toBeNull();
    });

    it('returns null when the height is missing', () => {
      expect(formatResolution(1920, undefined)).toBeNull();
    });
  });

  describe('formatBitrate', () => {
    it('promotes 1000+ kbps to one-decimal Mbps', () => {
      expect(formatBitrate(4200)).toBe('4.2 Mbps');
    });

    it('keeps sub-Mbps rates in kbps', () => {
      expect(formatBitrate(320)).toBe('320 kbps');
    });

    it('formats an exact Mbps boundary', () => {
      expect(formatBitrate(1000)).toBe('1.0 Mbps');
    });

    it('returns null for a missing rate', () => {
      expect(formatBitrate(null)).toBeNull();
    });
  });

  describe('formatFrameRate', () => {
    it('renders a fractional rate to at most two decimals', () => {
      expect(formatFrameRate(29.97)).toBe('29.97 fps');
    });

    it('drops trailing zeros on integer rates', () => {
      expect(formatFrameRate(30)).toBe('30 fps');
    });

    it('rounds long fractions to two decimals', () => {
      expect(formatFrameRate(23.976)).toBe('23.98 fps');
    });

    it('returns null for a missing rate', () => {
      expect(formatFrameRate(undefined)).toBeNull();
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-format.spec.ts` — expect FAIL: `Cannot find module './video-enrichment-format'`.

- [ ] Implement `src/app/components/forms/videos/enrichment/video-enrichment-format.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  /** Threshold above which a bitrate reads better in Mbps than kbps. */
  const MBPS_THRESHOLD_KBPS = 1000;

  /** Format probe dimensions as `1920×1080`; null when either side is unknown. */
  export const formatResolution = (
    width: number | null | undefined,
    height: number | null | undefined
  ): string | null => (width != null && height != null ? `${width}×${height}` : null);

  /** Format a kbps bitrate as `4.2 Mbps` (≥1000) or `320 kbps`; null when unknown. */
  export const formatBitrate = (bitrateKbps: number | null | undefined): string | null => {
    if (bitrateKbps == null) return null;
    return bitrateKbps >= MBPS_THRESHOLD_KBPS
      ? `${(bitrateKbps / MBPS_THRESHOLD_KBPS).toFixed(1)} Mbps`
      : `${bitrateKbps} kbps`;
  };

  /** Format a frame rate as `29.97 fps` (≤2 decimals, no trailing zeros); null when unknown. */
  export const formatFrameRate = (frameRate: number | null | undefined): string | null =>
    frameRate == null ? null : `${Number(frameRate.toFixed(2))} fps`;
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-format.spec.ts` — expect PASS (11 tests).

- [ ] Commit:

  ```bash
  git add src/app/components/forms/videos/enrichment/video-enrichment-format.ts src/app/components/forms/videos/enrichment/video-enrichment-format.spec.ts
  git commit -m "feat(videos): ✨ probe metadata formatters"
  ```

- [ ] Write the failing card spec `src/app/components/forms/videos/enrichment/video-technical-metadata-card.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';

  import type { VideoRow } from '@/lib/validation/video-schema';

  import {
    buildTechnicalMetadataRows,
    VideoTechnicalMetadataCard,
  } from './video-technical-metadata-card';

  const baseVideo = {
    id: 'v1',
    title: 'Clip',
    artist: 'Band',
    category: 'MUSIC',
    description: null,
    releasedOn: new Date('2026-02-01T00:00:00.000Z'),
    durationSeconds: 200,
    s3Key: 'media/videos/v1/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: 1048576n,
    mimeType: 'video/mp4',
    posterUrl: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    bitrateKbps: null,
    frameRate: null,
    container: null,
    audioChannels: null,
    audioSampleRateHz: null,
    sourceCreatedAt: null,
    probedAt: null,
    probeError: null,
    enrichmentStatus: null,
  } as VideoRow;

  const probedVideo = {
    ...baseVideo,
    probedAt: new Date('2026-02-02T00:00:00.000Z'),
    width: 1920,
    height: 1080,
    videoCodec: 'h264',
    audioCodec: 'aac',
    bitrateKbps: 4200,
    frameRate: 29.97,
    container: 'mp4',
    audioChannels: 2,
    audioSampleRateHz: 44100,
  } as VideoRow;

  describe('buildTechnicalMetadataRows', () => {
    it('builds a row for every populated probe field', () => {
      expect(buildTechnicalMetadataRows(probedVideo)).toEqual([
        { label: 'Container', value: 'mp4' },
        { label: 'Resolution', value: '1920×1080' },
        { label: 'Video codec', value: 'h264' },
        { label: 'Audio codec', value: 'aac' },
        { label: 'Bitrate', value: '4.2 Mbps' },
        { label: 'Frame rate', value: '29.97 fps' },
        { label: 'Duration', value: '3:20' },
        { label: 'Audio channels', value: '2' },
        { label: 'Sample rate', value: '44100 Hz' },
      ]);
    });

    it('omits rows whose probe field is missing', () => {
      const rows = buildTechnicalMetadataRows({ ...probedVideo, videoCodec: null } as VideoRow);

      expect(rows.some((row) => row.label === 'Video codec')).toBe(false);
    });
  });

  describe('VideoTechnicalMetadataCard', () => {
    it('renders nothing before the video has been probed', () => {
      render(<VideoTechnicalMetadataCard video={baseVideo} />);

      expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
    });

    it('renders the section heading once probed', () => {
      render(<VideoTechnicalMetadataCard video={probedVideo} />);

      expect(screen.getByRole('heading', { name: 'Technical Metadata' })).toBeInTheDocument();
    });

    it('renders the formatted resolution', () => {
      render(<VideoTechnicalMetadataCard video={probedVideo} />);

      expect(screen.getByText('1920×1080')).toBeInTheDocument();
    });

    it('renders the Resolution term in the definition list', () => {
      render(<VideoTechnicalMetadataCard video={probedVideo} />);

      expect(screen.getByText('Resolution')).toBeInTheDocument();
    });

    it('renders the formatted bitrate', () => {
      render(<VideoTechnicalMetadataCard video={probedVideo} />);

      expect(screen.getByText('4.2 Mbps')).toBeInTheDocument();
    });

    it('shows the probe error state when probing failed', () => {
      render(
        <VideoTechnicalMetadataCard
          video={{ ...baseVideo, probeError: 'ffprobe exited 1' } as VideoRow}
        />
      );

      expect(screen.getByText(/ffprobe exited 1/)).toBeInTheDocument();
    });

    it('prefers the error state over the dl when both probedAt and probeError exist', () => {
      render(
        <VideoTechnicalMetadataCard
          video={{ ...probedVideo, probeError: 'ffprobe exited 1' } as VideoRow}
        />
      );

      expect(screen.queryByText('1920×1080')).not.toBeInTheDocument();
    });
  });
  ```

  Note: the two `as VideoRow` casts on spread-modified fixtures are plain type
  ascriptions of complete literals (no `any`, no `!`); drop them if the
  Part A `VideoRow` type makes them unnecessary. If Part A made the probe
  fields optional rather than required-nullable, delete the explicit `null`
  members that TypeScript rejects.

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-technical-metadata-card.spec.tsx` — expect FAIL: `Cannot find module './video-technical-metadata-card'`.

- [ ] Implement `src/app/components/forms/videos/enrichment/video-technical-metadata-card.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { formatDuration } from '@/lib/utils/format-duration';
  import type { VideoRow } from '@/lib/validation/video-schema';

  import { formatBitrate, formatFrameRate, formatResolution } from './video-enrichment-format';

  interface VideoTechnicalMetadataCardProps {
    /** The loaded video row (edit mode); probe fields may all be null pre-probe. */
    video: VideoRow;
  }

  interface TechnicalMetadataRow {
    label: string;
    value: string;
  }

  /** Project the probe scalars into ordered label/value rows, dropping unknowns. */
  export const buildTechnicalMetadataRows = (video: VideoRow): TechnicalMetadataRow[] => {
    const candidates: Array<[string, string | null]> = [
      ['Container', video.container ?? null],
      ['Resolution', formatResolution(video.width, video.height)],
      ['Video codec', video.videoCodec ?? null],
      ['Audio codec', video.audioCodec ?? null],
      ['Bitrate', formatBitrate(video.bitrateKbps)],
      ['Frame rate', formatFrameRate(video.frameRate)],
      ['Duration', video.durationSeconds == null ? null : formatDuration(video.durationSeconds)],
      ['Audio channels', video.audioChannels == null ? null : String(video.audioChannels)],
      ['Sample rate', video.audioSampleRateHz == null ? null : `${video.audioSampleRateHz} Hz`],
    ];
    return candidates
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([label, value]) => ({ label, value }));
  };

  /**
   * Read-only `<dl>` of everything ffprobe reported for the uploaded file.
   * Hidden entirely until the server has probed (or failed to probe) the file;
   * a probe failure renders the stored error instead of the grid. Rendered for
   * ALL video categories — probe data is category-independent.
   *
   * @param video - The loaded video row from the admin detail query.
   */
  export const VideoTechnicalMetadataCard = ({
    video,
  }: VideoTechnicalMetadataCardProps): React.ReactElement | null => {
    if (!video.probedAt && !video.probeError) return null;

    return (
      <section
        data-testid="video-technical-metadata-card"
        className="space-y-3 border border-zinc-300 p-4"
      >
        <h2 className="font-semibold">Technical Metadata</h2>
        {video.probeError ? (
          <p role="status" className="text-destructive text-sm">
            Probe failed: {video.probeError}
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
            {buildTechnicalMetadataRows(video).map(({ label, value }) => (
              <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
                <dt className="text-zinc-700">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  };
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-technical-metadata-card.spec.tsx` — expect PASS (9 tests).

- [ ] Add the failing mount tests to `src/app/components/forms/video-form.spec.tsx`. First extend the existing `editVideo` fixture (in the `VideoForm — edit mode` describe) with the new nullable fields, then add a probed variant and a new describe:

  In the `editVideo` object literal, after `updatedAt: new Date('2023-03-03T00:00:00.000Z'),` add:

  ```ts
    width: null,
    height: null,
    videoCodec: null,
    audioCodec: null,
    bitrateKbps: null,
    frameRate: null,
    container: null,
    audioChannels: null,
    audioSampleRateHz: null,
    sourceCreatedAt: null,
    probedAt: null,
    probeError: null,
    enrichmentStatus: null,
  ```

  Then append this describe at the end of the file:

  ```tsx
  describe('VideoForm — technical metadata card', () => {
    const probedVideo = {
      ...editVideo,
      probedAt: new Date('2023-03-04T00:00:00.000Z'),
      width: 1920,
      height: 1080,
      bitrateKbps: 4200,
    };

    it('renders the card under the file section for a probed video', async () => {
      mocks.useVideoQuery.mockReturnValue({
        data: probedVideo,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<VideoForm videoId="v1" />);

      expect(await screen.findByTestId('video-technical-metadata-card')).toBeInTheDocument();
    });

    it('renders no card for an unprobed video', async () => {
      mocks.useVideoQuery.mockReturnValue({
        data: editVideo,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<VideoForm videoId="v1" />);

      await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
      expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
    });

    it('renders no card in create mode', () => {
      render(<VideoForm />);

      expect(screen.queryByTestId('video-technical-metadata-card')).not.toBeInTheDocument();
    });
  });
  ```

  (`editVideo` is currently declared inside the `VideoForm — edit mode` describe — hoist it to module scope, unchanged, so both describes share it.)

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect FAIL: `renders the card under the file section for a probed video` (testid never appears — the form does not mount the card yet).

- [ ] Mount the card in `src/app/components/forms/video-form.tsx` — add the import and one line under `<VideoFileSection …/>`:

  ```tsx
  import { VideoTechnicalMetadataCard } from './videos/enrichment/video-technical-metadata-card';
  ```

  ```tsx
  <VideoFileSection control={control} upload={upload} />;
  {
    isEditMode && video ? <VideoTechnicalMetadataCard video={video} /> : null;
  }
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect PASS (all existing tests + 3 new).

- [ ] Commit:
  ```bash
  git add src/app/components/forms/videos/enrichment/video-technical-metadata-card.tsx src/app/components/forms/videos/enrichment/video-technical-metadata-card.spec.tsx src/app/components/forms/video-form.tsx src/app/components/forms/video-form.spec.tsx
  git commit -m "feat(videos): ✨ technical metadata card"
  ```

---

### Task 19: Enrichment panel components + form integration (2 commits)

**Files:**

- Create (all under `src/app/components/forms/videos/enrichment/`, each with an adjacent spec):
  - `video-enrichment-status-chip.tsx` / `.spec.tsx`
  - `video-enrichment-progress-timeline.tsx` / `.spec.tsx`
  - `suggestion-field-row.tsx` / `.spec.tsx`
  - `video-artist-suggestion-card.tsx` / `.spec.tsx`
  - `video-release-date-suggestion.tsx` / `.spec.tsx`
  - `video-enrichment-error-boundary.tsx` / `.spec.tsx`
  - `video-enrichment-panel.tsx` / `.spec.tsx`
- Modify: `src/app/components/forms/video-form.tsx`, `src/app/components/forms/video-form.spec.tsx`

**Interfaces:**

- Consumes: `VideoEnrichmentStatusResponse`, `VIDEO_PROGRESS_STAGES`, `isInFlightEnrichmentStatus` from `@/lib/validation/video-enrichment-schema`; `useVideoEnrichmentStatusQuery` (Task 16); `useRunVideoEnrichmentMutation`, `useApplyVideoSuggestionMutation`, `ApplyVideoSuggestionInput` (Task 17); `CLIENT_POLL_DEADLINE_MS` from `@/lib/validation/bio-generation-schema` (reuse — same 20-min give-up semantics; do not duplicate the constant); shadcn primitives `Badge`, `Button`, `Skeleton`, `AlertDialog*` from `@/app/components/ui/*`; `lucide-react` icons; `error as logError` from `@/lib/utils/console-logger`; `cn` from `@/lib/utils`; `VideoFormData` from `@/lib/validation/create-video-schema`.
- Shared derived types (define once in `video-enrichment-panel.tsx`—or inline per file via the response type; never re-declare shapes):
  ```ts
  type EnrichmentStatus = VideoEnrichmentStatusResponse['status'];
  type EnrichmentProgress = NonNullable<VideoEnrichmentStatusResponse['progress']>;
  type EnrichmentArtist = VideoEnrichmentStatusResponse['artists'][number];
  type EnrichmentSuggestion = VideoEnrichmentStatusResponse['suggestions'][number];
  ```
- Produces (exact component signatures):

  ```ts
  export const VideoEnrichmentStatusChip: ({
    status,
  }: {
    status: EnrichmentStatus;
  }) => React.ReactElement;
  // testid 'video-enrichment-status-chip'; text: null→'Not enriched', pending|processing→'Enriching…', failed→'Failed', succeeded→'Enriched'

  export const VideoEnrichmentProgressTimeline: ({
    progress,
  }: {
    progress: EnrichmentProgress | null | undefined;
  }) => React.ReactElement;
  // <ol aria-label="Enrichment progress"> over VIDEO_PROGRESS_STAGES; high-water-mark monotonic; fallback role="status" copy line

  export const suggestionFieldLabel: (field: EnrichmentSuggestion['field']) => string;
  export const SuggestionFieldRow: (props: {
    suggestion: EnrichmentSuggestion;
    currentValue: string | null;
    isBusy: boolean;
    applyLabel?: string; // default 'Apply'
    onApply: () => void;
    onDismiss: () => void;
  }) => React.ReactElement;

  export const currentArtistFieldValue: (
    current: EnrichmentArtist['current'],
    field: EnrichmentSuggestion['field']
  ) => string | null; // explicit switch — no dynamic key
  export const VideoArtistSuggestionCard: (props: {
    artist: EnrichmentArtist;
    suggestions: EnrichmentSuggestion[];
    isBusy: boolean;
    onApplySuggestion: (
      suggestion: EnrichmentSuggestion,
      expectedCurrent: string | null
    ) => Promise<boolean>;
    onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
  }) => React.ReactElement;
  // testid 'video-artist-suggestion-card'; name links to /admin/artists/{artistId}; Apply-all = sequential, stop on first false

  export const VideoReleaseDateSuggestion: (props: {
    suggestion: EnrichmentSuggestion; // field 'releasedOn'
    control: Control<VideoFormData>;
    name: 'releasedOn'; // control-name for useWatch
    onApplyReleaseDate: (value: string) => void;
    onDismiss: () => void;
    isBusy: boolean;
  }) => React.ReactElement;
  // testid 'video-release-date-suggestion'; NEVER calls the server with op 'apply'; 'Save to persist' hint after apply

  export class VideoEnrichmentErrorBoundary extends Component<
    { children: ReactNode },
    { hasError: boolean }
  > {}
  // the ONE platform-forced class in the repo (React subtree error boundaries require one); see deviation notes

  export const VideoEnrichmentPanel: (props: {
    videoId: string;
    control: Control<VideoFormData>;
    onApplyReleaseDate: (value: string) => void;
  }) => React.ReactElement;
  // 'use client'; testid 'video-enrichment-panel'
  ```

**Component semantics (binding for the steps below):**

- Suggestion rows: pending → label, current (`'—'` when null), suggested value, confidence text `Badge` (`High`/`Medium`/`Low`), source links (`target="_blank" rel="noopener noreferrer"`, label falls back to hostname), `sr-only` note, `Apply` + `Dismiss` buttons (aria-labels `Apply ${label} suggestion` / `Dismiss ${label} suggestion`); applied → `Applied` badge, no buttons; dismissed → single muted line `${label}: Dismissed` (v1 has NO Undo).
- Panel states: `data` undefined → `Skeleton`; `status null` → chip + `Run enrichment` button; in-flight → chip + timeline (no run button); `failed` → chip + `data.error` + `Re-run enrichment`; `succeeded` → chip + artist cards (only artists that have suggestions) + release-date suggestion (the `artistId === null`, `field === 'releasedOn'` row, if any) + `Re-run enrichment`. Re-run ALWAYS goes through an `AlertDialog` (title `Re-run enrichment?`, action button `Re-run`); the empty-state `Run enrichment` does not. Terminal states additionally render an `sr-only` `<p role="status" aria-live="polite">` announcing `Enrichment succeeded.` / `Enrichment failed.`.
- Poll give-up: mirror the bio section's `CLIENT_POLL_DEADLINE` pattern — while in-flight, a `setTimeout(CLIENT_POLL_DEADLINE_MS)` fires `toast.error('Enrichment timed out. Re-run to try again.')` and sets `gaveUp`, which passes `enabled: !gaveUp` to the status query; triggering Run/Re-run clears `gaveUp`.
- Apply wiring (pessimistic): `onApplySuggestion` awaits `applyVideoSuggestionAsync({ suggestionId, op: 'apply', expectedCurrent })` in try/catch and returns `result.success` (false on throw); UI state flips only from the invalidation-driven refetch. Dismiss fires `applyVideoSuggestion({ suggestionId, op: 'dismiss' })`.

**Steps:**

- [ ] Write the failing chip spec `video-enrichment-status-chip.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';

  import { VideoEnrichmentStatusChip } from './video-enrichment-status-chip';

  describe('VideoEnrichmentStatusChip', () => {
    it('labels a never-enriched video', () => {
      render(<VideoEnrichmentStatusChip status={null} />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Not enriched');
    });

    it('labels a pending job as enriching', () => {
      render(<VideoEnrichmentStatusChip status="pending" />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
    });

    it('labels a processing job as enriching', () => {
      render(<VideoEnrichmentStatusChip status="processing" />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
    });

    it('labels a failed job', () => {
      render(<VideoEnrichmentStatusChip status="failed" />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Failed');
    });

    it('labels a succeeded job', () => {
      render(<VideoEnrichmentStatusChip status="succeeded" />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriched');
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-status-chip.spec.tsx` — expect FAIL: `Cannot find module './video-enrichment-status-chip'`.

- [ ] Implement `video-enrichment-status-chip.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { Badge } from '@/app/components/ui/badge';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  type EnrichmentStatus = VideoEnrichmentStatusResponse['status'];
  type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

  interface VideoEnrichmentStatusChipProps {
    /** Current job status; null = never enriched. */
    status: EnrichmentStatus;
  }

  /** Maps (not index-access records) so variable-keyed lookups stay lint-clean. */
  const CHIP_LABELS = new Map<EnrichmentStatus, string>([
    [null, 'Not enriched'],
    ['pending', 'Enriching…'],
    ['processing', 'Enriching…'],
    ['failed', 'Failed'],
    ['succeeded', 'Enriched'],
  ]);

  const CHIP_VARIANTS = new Map<EnrichmentStatus, BadgeVariant>([
    [null, 'secondary'],
    ['pending', 'secondary'],
    ['processing', 'secondary'],
    ['failed', 'destructive'],
    ['succeeded', 'default'],
  ]);

  /** Compact text badge reflecting the enrichment job lifecycle. */
  export const VideoEnrichmentStatusChip = ({
    status,
  }: VideoEnrichmentStatusChipProps): React.ReactElement => (
    <Badge
      data-testid="video-enrichment-status-chip"
      variant={CHIP_VARIANTS.get(status) ?? 'secondary'}
    >
      {CHIP_LABELS.get(status) ?? 'Not enriched'}
    </Badge>
  );
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-status-chip.spec.tsx` — expect PASS (5 tests).

- [ ] Write the failing timeline spec `video-enrichment-progress-timeline.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';

  import { VideoEnrichmentProgressTimeline } from './video-enrichment-progress-timeline';

  describe('VideoEnrichmentProgressTimeline', () => {
    it('renders the static searching copy before any checkpoint arrives', () => {
      render(<VideoEnrichmentProgressTimeline progress={null} />);

      expect(screen.getByRole('status')).toHaveTextContent(/searching the web/i);
    });

    it('renders one row per enrichment stage once a checkpoint arrives', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(5);
    });

    it('marks the checkpoint stage as the active step', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getByText('Wikidata').closest('li')).toHaveAttribute('aria-current', 'step');
    });

    it('marks earlier stages complete', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getByText('MusicBrainz').closest('li')).toHaveAttribute(
        'data-state',
        'complete'
      );
    });

    it('marks later stages upcoming', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getByText('Finalizing').closest('li')).toHaveAttribute(
        'data-state',
        'upcoming'
      );
    });

    it('renders the active stage counts inline', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{
            stage: 'musicbrainz',
            counts: { candidates: 3 },
            at: '2026-07-11T00:00:00.000Z',
          }}
        />
      );

      expect(screen.getByText(/MusicBrainz — 3 candidates/)).toBeInTheDocument();
    });

    it('never rewinds the highlight when a lower stage arrives late', () => {
      const { rerender } = render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'web-search', at: '2026-07-11T00:00:01.000Z' }}
        />
      );

      rerender(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getByText('Web search').closest('li')).toHaveAttribute('aria-current', 'step');
    });

    it('labels the list for assistive tech', () => {
      render(
        <VideoEnrichmentProgressTimeline
          progress={{ stage: 'adjudicating', at: '2026-07-11T00:00:00.000Z' }}
        />
      );

      expect(screen.getByRole('list', { name: 'Enrichment progress' })).toBeInTheDocument();
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-progress-timeline.spec.tsx` — expect FAIL: `Cannot find module './video-enrichment-progress-timeline'`.

- [ ] Implement `video-enrichment-progress-timeline.tsx` — an adapted sibling of `bio-generation-progress-timeline.tsx` (generalizing the bio component is an explicit spec non-goal):

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import { useRef } from 'react';
  import type { JSX } from 'react';

  import { Check, Circle, Loader2 } from 'lucide-react';

  import { cn } from '@/lib/utils';
  import { VIDEO_PROGRESS_STAGES } from '@/lib/validation/video-enrichment-schema';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  import type { LucideIcon } from 'lucide-react';

  type EnrichmentProgress = NonNullable<VideoEnrichmentStatusResponse['progress']>;
  type EnrichmentStage = (typeof VIDEO_PROGRESS_STAGES)[number];

  interface VideoEnrichmentProgressTimelineProps {
    /** Latest polled checkpoint, or null/undefined before any checkpoint arrives. */
    progress: EnrichmentProgress | null | undefined;
  }

  /** Short label per ordered stage (Map, not index access, for lint safety). */
  const STAGE_LABELS = new Map<EnrichmentStage, string>([
    ['musicbrainz', 'MusicBrainz'],
    ['wikidata', 'Wikidata'],
    ['web-search', 'Web search'],
    ['adjudicating', 'Adjudicating'],
    ['finalizing', 'Finalizing'],
  ]);

  /** Per-row lifecycle relative to the active stage — drives icon + styling. */
  type StageState = 'complete' | 'active' | 'upcoming';

  const STATE_ICON = new Map<StageState, LucideIcon>([
    ['complete', Check],
    ['active', Loader2],
    ['upcoming', Circle],
  ]);

  const ROW_CLASS = new Map<StageState, string>([
    ['complete', 'text-muted-foreground'],
    ['active', 'text-foreground font-medium'],
    ['upcoming', 'text-muted-foreground/50'],
  ]);

  const ICON_CLASS = new Map<StageState, string>([
    ['complete', 'text-primary'],
    ['active', 'text-primary animate-spin'],
    ['upcoming', 'text-muted-foreground/40'],
  ]);

  /** `{value} {key}` comma-joined counts summary, or null when there are none. */
  const formatCounts = (counts: EnrichmentProgress['counts']): string | null => {
    if (!counts) return null;
    const parts = Object.entries(counts).map(([key, value]) => `${value} ${key}`);
    return parts.length ? parts.join(', ') : null;
  };

  interface StageRowProps {
    label: string;
    state: StageState;
    counts: string | null;
  }

  const StageRow = ({ label, state, counts }: StageRowProps): JSX.Element => {
    const Icon = STATE_ICON.get(state) ?? Circle;
    const isActive = state === 'active';
    return (
      <li
        data-state={state}
        aria-current={isActive ? 'step' : undefined}
        className={cn('flex items-center gap-2 text-sm', ROW_CLASS.get(state))}
      >
        <Icon className={cn('size-4 shrink-0', ICON_CLASS.get(state))} aria-hidden />
        <span>
          {label}
          {isActive && counts ? ` — ${counts}` : ''}
        </span>
      </li>
    );
  };

  /**
   * Live stage timeline for an in-flight video enrichment, mirroring the bio
   * generation timeline: ordered {@link VIDEO_PROGRESS_STAGES} as an accessible
   * checklist with a monotonic (high-water-mark) active highlight and the
   * active stage's counts inline. Degrades to a static copy line before the
   * first checkpoint.
   *
   * @param progress - The latest polled progress checkpoint (or null/undefined).
   */
  export const VideoEnrichmentProgressTimeline = ({
    progress,
  }: VideoEnrichmentProgressTimelineProps): JSX.Element => {
    const highestIndexRef = useRef(-1);
    const currentIndex = progress ? VIDEO_PROGRESS_STAGES.indexOf(progress.stage) : -1;
    if (currentIndex > highestIndexRef.current) {
      highestIndexRef.current = currentIndex;
    }
    const activeIndex = highestIndexRef.current;

    if (!progress || activeIndex < 0) {
      return (
        <p className="text-muted-foreground text-sm" role="status">
          Searching the web for artist and release facts — this can take a few minutes. You can keep
          working; suggestions will appear here when ready.
        </p>
      );
    }

    const countsSummary = formatCounts(progress.counts);

    return (
      <ol className="space-y-1.5" aria-label="Enrichment progress">
        {VIDEO_PROGRESS_STAGES.map((stage, index) => (
          <StageRow
            key={stage}
            label={STAGE_LABELS.get(stage) ?? stage}
            state={index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'upcoming'}
            counts={countsSummary}
          />
        ))}
      </ol>
    );
  };
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-progress-timeline.spec.tsx` — expect PASS (8 tests).

- [ ] Write the failing row spec `suggestion-field-row.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';

  import { SuggestionFieldRow, suggestionFieldLabel } from './suggestion-field-row';

  const pendingSuggestion = {
    id: 's1',
    artistId: 'a1',
    field: 'bornOn' as const,
    value: '1985-03-15',
    confidence: 'high' as const,
    sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
    note: 'Corroborated by Wikidata P569.',
    status: 'pending' as const,
  };

  const renderRow = (
    overrides: Partial<typeof pendingSuggestion> = {},
    onApply = vi.fn(),
    onDismiss = vi.fn()
  ) =>
    render(
      <ul>
        <SuggestionFieldRow
          suggestion={{ ...pendingSuggestion, ...overrides }}
          currentValue={null}
          isBusy={false}
          onApply={onApply}
          onDismiss={onDismiss}
        />
      </ul>
    );

  describe('suggestionFieldLabel', () => {
    it('maps bornOn to a human label', () => {
      expect(suggestionFieldLabel('bornOn')).toBe('Born on');
    });

    it('maps releasedOn to a human label', () => {
      expect(suggestionFieldLabel('releasedOn')).toBe('Release date');
    });
  });

  describe('SuggestionFieldRow — pending', () => {
    it('renders the field label', () => {
      renderRow();

      expect(screen.getByText('Born on')).toBeInTheDocument();
    });

    it('renders a dash for an empty current value', () => {
      renderRow();

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders the suggested value', () => {
      renderRow();

      expect(screen.getByText('1985-03-15')).toBeInTheDocument();
    });

    it('renders the confidence as a text badge', () => {
      renderRow();

      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('renders each source as a safe external link', () => {
      renderRow();

      const link = screen.getByRole('link', { name: 'MusicBrainz' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('falls back to the source hostname when a source has no label', () => {
      renderRow({ sources: [{ url: 'https://musicbrainz.org/artist/x' }] });

      expect(screen.getByRole('link', { name: 'musicbrainz.org' })).toBeInTheDocument();
    });

    it('exposes the note to screen readers only', () => {
      renderRow();

      expect(screen.getByText('Corroborated by Wikidata P569.')).toHaveClass('sr-only');
    });

    it('fires onApply when Apply is clicked', async () => {
      const onApply = vi.fn();
      renderRow({}, onApply);

      await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('fires onDismiss when Dismiss is clicked', async () => {
      const onDismiss = vi.fn();
      renderRow({}, vi.fn(), onDismiss);

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss Born on suggestion' }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('disables the action buttons while busy', () => {
      render(
        <ul>
          <SuggestionFieldRow
            suggestion={pendingSuggestion}
            currentValue={null}
            isBusy
            onApply={vi.fn()}
            onDismiss={vi.fn()}
          />
        </ul>
      );

      expect(screen.getByRole('button', { name: 'Apply Born on suggestion' })).toBeDisabled();
    });
  });

  describe('SuggestionFieldRow — terminal states', () => {
    it('shows an Applied badge without action buttons once applied', () => {
      renderRow({ status: 'applied' });

      expect(screen.getByText('Applied')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('collapses a dismissed suggestion to a muted line', () => {
      renderRow({ status: 'dismissed' });

      expect(screen.getByText('Born on: Dismissed')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/suggestion-field-row.spec.tsx` — expect FAIL: `Cannot find module './suggestion-field-row'`.

- [ ] Implement `suggestion-field-row.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { Badge } from '@/app/components/ui/badge';
  import { Button } from '@/app/components/ui/button';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  type EnrichmentSuggestion = VideoEnrichmentStatusResponse['suggestions'][number];
  type SuggestionField = EnrichmentSuggestion['field'];
  type SuggestionSource = EnrichmentSuggestion['sources'][number];

  const FIELD_LABELS = new Map<SuggestionField, string>([
    ['firstName', 'First name'],
    ['middleName', 'Middle name'],
    ['surname', 'Surname'],
    ['akaNames', 'AKA names'],
    ['bornOn', 'Born on'],
    ['displayName', 'Display name'],
    ['releasedOn', 'Release date'],
  ]);

  const CONFIDENCE_LABELS = new Map<EnrichmentSuggestion['confidence'], string>([
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ]);

  /** Human label for a suggestion field (falls back to the raw field name). */
  export const suggestionFieldLabel = (field: SuggestionField): string =>
    FIELD_LABELS.get(field) ?? field;

  /** Display label for one source link — its label, else its hostname, else the URL. */
  const sourceLabel = ({ url, label }: SuggestionSource): string => {
    if (label) return label;
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  interface SuggestionFieldRowProps {
    suggestion: EnrichmentSuggestion;
    /** The current stored/form value shown beside the suggestion (null → '—'). */
    currentValue: string | null;
    /** Disables the action buttons while a mutation is in flight. */
    isBusy: boolean;
    /** Visible Apply button text; the release-date caller overrides it. */
    applyLabel?: string;
    onApply: () => void;
    onDismiss: () => void;
  }

  /**
   * One suggested fact: label, current vs suggested value, confidence badge,
   * source links, and Apply/Dismiss. Applied rows keep their value with an
   * `Applied` badge; dismissed rows collapse to a muted one-liner (no Undo in
   * v1 — a re-run keeps the dismissal as a fence against re-discovery).
   */
  export const SuggestionFieldRow = ({
    suggestion,
    currentValue,
    isBusy,
    applyLabel = 'Apply',
    onApply,
    onDismiss,
  }: SuggestionFieldRowProps): React.ReactElement => {
    const label = suggestionFieldLabel(suggestion.field);

    if (suggestion.status === 'dismissed') {
      return <li className="text-sm text-zinc-500">{`${label}: Dismissed`}</li>;
    }

    return (
      <li className="flex flex-col gap-2 border-b border-zinc-200 pb-3 last:border-b-0 last:pb-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{label}</span>
          <Badge variant="outline">{CONFIDENCE_LABELS.get(suggestion.confidence) ?? 'Low'}</Badge>
          {suggestion.status === 'applied' ? <Badge>Applied</Badge> : null}
        </div>
        <p className="text-sm">
          <span className="text-zinc-700">Current: {currentValue ?? '—'}</span>
          <span className="mx-2" aria-hidden>
            →
          </span>
          <span className="font-medium">{suggestion.value}</span>
          {suggestion.note ? <span className="sr-only">{suggestion.note}</span> : null}
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {suggestion.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {sourceLabel(source)}
              </a>
            </li>
          ))}
        </ul>
        {suggestion.status === 'pending' ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isBusy}
              aria-label={`Apply ${label} suggestion`}
              onClick={onApply}
            >
              {applyLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isBusy}
              aria-label={`Dismiss ${label} suggestion`}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </div>
        ) : null}
      </li>
    );
  };
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/suggestion-field-row.spec.tsx` — expect PASS (14 tests).

- [ ] Write the failing artist-card spec `video-artist-suggestion-card.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';

  import {
    currentArtistFieldValue,
    VideoArtistSuggestionCard,
  } from './video-artist-suggestion-card';

  const artist = {
    artistId: 'a1',
    displayName: 'E2E Enrich Lead',
    role: 'PRIMARY' as const,
    current: {
      firstName: 'E2E',
      middleName: null,
      surname: 'Enrich Lead',
      akaNames: null,
      displayName: 'E2E Enrich Lead',
      bornOn: null,
    },
  };

  const makeSuggestion = (id: string, field: 'bornOn' | 'akaNames', value: string) => ({
    id,
    artistId: 'a1',
    field,
    value,
    confidence: 'high' as const,
    sources: [{ url: 'https://musicbrainz.org/artist/x' }],
    note: null,
    status: 'pending' as const,
  });

  const suggestions = [
    makeSuggestion('s1', 'bornOn', '1985-03-15'),
    makeSuggestion('s2', 'akaNames', 'E2E Alias'),
  ];

  describe('currentArtistFieldValue', () => {
    it('reads bornOn from the current identity', () => {
      expect(currentArtistFieldValue({ ...artist.current, bornOn: '1980-01-01' }, 'bornOn')).toBe(
        '1980-01-01'
      );
    });

    it('reads surname from the current identity', () => {
      expect(currentArtistFieldValue(artist.current, 'surname')).toBe('Enrich Lead');
    });

    it('returns null for the video-level releasedOn field', () => {
      expect(currentArtistFieldValue(artist.current, 'releasedOn')).toBeNull();
    });
  });

  describe('VideoArtistSuggestionCard', () => {
    it('links the artist name to the admin artist edit page', () => {
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={vi.fn().mockResolvedValue(true)}
          onDismissSuggestion={vi.fn()}
        />
      );

      expect(screen.getByRole('link', { name: 'E2E Enrich Lead' })).toHaveAttribute(
        'href',
        '/admin/artists/a1'
      );
    });

    it('renders one row per suggestion', () => {
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={vi.fn().mockResolvedValue(true)}
          onDismissSuggestion={vi.fn()}
        />
      );

      expect(screen.getAllByRole('button', { name: /^Apply .* suggestion$/ })).toHaveLength(2);
    });

    it('applies a single suggestion with its current value for concurrency', async () => {
      const onApplySuggestion = vi.fn().mockResolvedValue(true);
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

      expect(onApplySuggestion).toHaveBeenCalledWith(suggestions[0], null);
    });

    it('applies all pending suggestions sequentially', async () => {
      const onApplySuggestion = vi.fn().mockResolvedValue(true);
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

      await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(2));
    });

    it('stops Apply-all on the first failure', async () => {
      const onApplySuggestion = vi.fn().mockResolvedValue(false);
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

      await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(1));
    });

    it('skips non-pending suggestions in Apply-all', async () => {
      const onApplySuggestion = vi.fn().mockResolvedValue(true);
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={[{ ...suggestions[0], status: 'applied' as const }, suggestions[1]]}
          isBusy={false}
          onApplySuggestion={onApplySuggestion}
          onDismissSuggestion={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

      await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(1));
      expect(onApplySuggestion).toHaveBeenCalledWith(suggestions[1], null);
    });

    it('hides Apply-all when nothing is pending', () => {
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={[{ ...suggestions[0], status: 'applied' as const }]}
          isBusy={false}
          onApplySuggestion={vi.fn().mockResolvedValue(true)}
          onDismissSuggestion={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: 'Apply all' })).not.toBeInTheDocument();
    });

    it('forwards a dismissal to onDismissSuggestion', async () => {
      const onDismissSuggestion = vi.fn();
      render(
        <VideoArtistSuggestionCard
          artist={artist}
          suggestions={suggestions}
          isBusy={false}
          onApplySuggestion={vi.fn().mockResolvedValue(true)}
          onDismissSuggestion={onDismissSuggestion}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss AKA names suggestion' }));

      expect(onDismissSuggestion).toHaveBeenCalledWith(suggestions[1]);
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-artist-suggestion-card.spec.tsx` — expect FAIL: `Cannot find module './video-artist-suggestion-card'`.

- [ ] Implement `video-artist-suggestion-card.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import Link from 'next/link';

  import { Button } from '@/app/components/ui/button';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  import { SuggestionFieldRow } from './suggestion-field-row';

  type EnrichmentArtist = VideoEnrichmentStatusResponse['artists'][number];
  type EnrichmentSuggestion = VideoEnrichmentStatusResponse['suggestions'][number];

  /**
   * Current stored value for a suggested artist field. An explicit switch —
   * never a dynamic Prisma-style key — mirroring the server's field whitelist.
   */
  export const currentArtistFieldValue = (
    current: EnrichmentArtist['current'],
    field: EnrichmentSuggestion['field']
  ): string | null => {
    switch (field) {
      case 'firstName':
        return current.firstName;
      case 'middleName':
        return current.middleName;
      case 'surname':
        return current.surname;
      case 'akaNames':
        return current.akaNames;
      case 'displayName':
        return current.displayName;
      case 'bornOn':
        return current.bornOn;
      default:
        return null; // 'releasedOn' is video-level and never reaches an artist card
    }
  };

  interface VideoArtistSuggestionCardProps {
    artist: EnrichmentArtist;
    /** This artist's suggestions only (pre-grouped by the panel). */
    suggestions: EnrichmentSuggestion[];
    isBusy: boolean;
    /** Awaits one server apply; resolves false on failure (stops Apply-all). */
    onApplySuggestion: (
      suggestion: EnrichmentSuggestion,
      expectedCurrent: string | null
    ) => Promise<boolean>;
    onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
  }

  /**
   * Groups one artist's suggested identity facts with per-field Apply/Dismiss
   * and a sequential Apply-all (stops on the first failure so an
   * `expectedCurrent` conflict never cascades). The artist name links to the
   * admin artist editor for verification after applying.
   */
  export const VideoArtistSuggestionCard = ({
    artist,
    suggestions,
    isBusy,
    onApplySuggestion,
    onDismissSuggestion,
  }: VideoArtistSuggestionCardProps): React.ReactElement => {
    const pending = suggestions.filter((suggestion) => suggestion.status === 'pending');

    const applyAll = async (): Promise<void> => {
      for (const suggestion of pending) {
        const ok = await onApplySuggestion(
          suggestion,
          currentArtistFieldValue(artist.current, suggestion.field)
        );
        if (!ok) return;
      }
    };

    return (
      <article
        data-testid="video-artist-suggestion-card"
        className="space-y-3 border border-zinc-300 p-4"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            <Link
              href={`/admin/artists/${artist.artistId}`}
              className="underline underline-offset-2"
            >
              {artist.displayName}
            </Link>
          </h3>
          {pending.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isBusy}
              onClick={() => void applyAll()}
            >
              Apply all
            </Button>
          ) : null}
        </header>
        <ul className="space-y-3">
          {suggestions.map((suggestion) => (
            <SuggestionFieldRow
              key={suggestion.id}
              suggestion={suggestion}
              currentValue={currentArtistFieldValue(artist.current, suggestion.field)}
              isBusy={isBusy}
              onApply={() =>
                void onApplySuggestion(
                  suggestion,
                  currentArtistFieldValue(artist.current, suggestion.field)
                )
              }
              onDismiss={() => onDismissSuggestion(suggestion)}
            />
          ))}
        </ul>
      </article>
    );
  };
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-artist-suggestion-card.spec.tsx` — expect PASS (11 tests).

- [ ] Write the failing release-date spec `video-release-date-suggestion.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { useForm } from 'react-hook-form';

  import type { VideoFormData } from '@/lib/validation/create-video-schema';

  import { VideoReleaseDateSuggestion } from './video-release-date-suggestion';

  const suggestion = {
    id: 's3',
    artistId: null,
    field: 'releasedOn' as const,
    value: '2020-06-01',
    confidence: 'medium' as const,
    sources: [{ url: 'https://musicbrainz.org/release/y', label: 'MusicBrainz' }],
    note: null,
    status: 'pending' as const,
  };

  interface HarnessProps {
    releasedOn: string;
    onApplyReleaseDate: (value: string) => void;
    onDismiss: () => void;
  }

  const Harness = ({ releasedOn, onApplyReleaseDate, onDismiss }: HarnessProps) => {
    const form = useForm<VideoFormData>({ defaultValues: { releasedOn } });
    return (
      <VideoReleaseDateSuggestion
        suggestion={suggestion}
        control={form.control}
        name="releasedOn"
        onApplyReleaseDate={onApplyReleaseDate}
        onDismiss={onDismiss}
        isBusy={false}
      />
    );
  };

  describe('VideoReleaseDateSuggestion', () => {
    it('renders the suggested date', () => {
      render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('2020-06-01')).toBeInTheDocument();
    });

    it('shows the current form value beside the suggestion', () => {
      render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText(/Current: 2026-02-01/)).toBeInTheDocument();
    });

    it('applies into the form via onApplyReleaseDate — never a server call', async () => {
      const onApplyReleaseDate = vi.fn();
      render(
        <Harness
          releasedOn="2026-02-01"
          onApplyReleaseDate={onApplyReleaseDate}
          onDismiss={vi.fn()}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Apply Release date suggestion' }));

      expect(onApplyReleaseDate).toHaveBeenCalledWith('2020-06-01');
    });

    it('shows the save hint once the form value matches the suggestion', () => {
      render(<Harness releasedOn="2020-06-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText(/Save to persist/)).toBeInTheDocument();
    });

    it('marks the row applied once the form value matches the suggestion', () => {
      render(<Harness releasedOn="2020-06-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.getByText('Applied')).toBeInTheDocument();
    });

    it('hides the save hint before the suggestion is applied', () => {
      render(<Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={vi.fn()} />);

      expect(screen.queryByText(/Save to persist/)).not.toBeInTheDocument();
    });

    it('forwards Dismiss to the server-dismiss callback', async () => {
      const onDismiss = vi.fn();
      render(
        <Harness releasedOn="2026-02-01" onApplyReleaseDate={vi.fn()} onDismiss={onDismiss} />
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Dismiss Release date suggestion' })
      );

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-release-date-suggestion.spec.tsx` — expect FAIL: `Cannot find module './video-release-date-suggestion'`.

- [ ] Implement `video-release-date-suggestion.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import { useWatch } from 'react-hook-form';

  import type { VideoFormData } from '@/lib/validation/create-video-schema';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  import { SuggestionFieldRow } from './suggestion-field-row';

  import type { Control } from 'react-hook-form';

  type EnrichmentSuggestion = VideoEnrichmentStatusResponse['suggestions'][number];

  interface VideoReleaseDateSuggestionProps {
    /** The video-level `releasedOn` suggestion (artistId null). */
    suggestion: EnrichmentSuggestion;
    control: Control<VideoFormData>;
    /** The form field the suggestion applies into (locked to `releasedOn`). */
    name: 'releasedOn';
    /** Applies the value into the RHF form (`setValue` in the parent — dirty + validate). */
    onApplyReleaseDate: (value: string) => void;
    /** Dismisses the suggestion server-side (dismiss IS allowed for releasedOn). */
    onDismiss: () => void;
    isBusy: boolean;
  }

  /**
   * The release-date suggestion. Apply writes the value into the mounted RHF
   * form via {@link onApplyReleaseDate} and NEVER calls the apply action —
   * the server rejects `op: 'apply'` for `releasedOn`, because any server write
   * would refetch `videos.detail` and reset the dirty form. The row therefore
   * derives its applied state from the live form value (via `useWatch`) and
   * shows a "Save to persist" hint until the admin saves.
   */
  export const VideoReleaseDateSuggestion = ({
    suggestion,
    control,
    name,
    onApplyReleaseDate,
    onDismiss,
    isBusy,
  }: VideoReleaseDateSuggestionProps): React.ReactElement => {
    const currentFormValue = useWatch({ control, name });
    const isAppliedToForm = currentFormValue === suggestion.value;
    const displayed: EnrichmentSuggestion =
      isAppliedToForm && suggestion.status === 'pending'
        ? { ...suggestion, status: 'applied' }
        : suggestion;

    return (
      <div data-testid="video-release-date-suggestion" className="space-y-2">
        <ul>
          <SuggestionFieldRow
            suggestion={displayed}
            currentValue={currentFormValue || null}
            isBusy={isBusy}
            applyLabel="Use this date"
            onApply={() => onApplyReleaseDate(suggestion.value)}
            onDismiss={onDismiss}
          />
        </ul>
        {isAppliedToForm ? (
          <p role="status" className="text-sm text-zinc-700">
            Applied to the form — Save to persist.
          </p>
        ) : null}
      </div>
    );
  };
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-release-date-suggestion.spec.tsx` — expect PASS (7 tests).

- [ ] Write the failing error-boundary spec `video-enrichment-error-boundary.spec.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { render, screen } from '@testing-library/react';

  import { VideoEnrichmentErrorBoundary } from './video-enrichment-error-boundary';

  vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

  const Bomb = (): never => {
    throw new Error('render exploded');
  };

  describe('VideoEnrichmentErrorBoundary', () => {
    it('renders its children when nothing throws', () => {
      render(
        <VideoEnrichmentErrorBoundary>
          <p>panel content</p>
        </VideoEnrichmentErrorBoundary>
      );

      expect(screen.getByText('panel content')).toBeInTheDocument();
    });

    it('renders the fallback when a child render throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      render(
        <VideoEnrichmentErrorBoundary>
          <Bomb />
        </VideoEnrichmentErrorBoundary>
      );

      expect(screen.getByRole('alert')).toHaveTextContent(/enrichment panel failed/i);
      consoleError.mockRestore();
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-error-boundary.spec.tsx` — expect FAIL: `Cannot find module './video-enrichment-error-boundary'`.

- [ ] Implement `video-enrichment-error-boundary.tsx` (see deviation notes — React subtree error boundaries REQUIRE a class; members are arrow class properties so no `function` syntax appears):

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import { Component } from 'react';
  import type { ReactNode } from 'react';

  import { error as logError } from '@/lib/utils/console-logger';

  interface VideoEnrichmentErrorBoundaryProps {
    children: ReactNode;
  }

  interface VideoEnrichmentErrorBoundaryState {
    hasError: boolean;
  }

  /**
   * Contains a crash inside the enrichment panel so the surrounding video form
   * (and its unsaved edits) keep working. React only supports subtree error
   * boundaries as class components — this is the repo's single deliberate
   * exception to the function-components rule.
   */
  export class VideoEnrichmentErrorBoundary extends Component<
    VideoEnrichmentErrorBoundaryProps,
    VideoEnrichmentErrorBoundaryState
  > {
    state: VideoEnrichmentErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError = (): VideoEnrichmentErrorBoundaryState => ({
      hasError: true,
    });

    componentDidCatch = (caught: Error): void => {
      logError('Video enrichment panel crashed', caught);
    };

    render = (): ReactNode =>
      this.state.hasError ? (
        <p role="alert" className="text-sm text-zinc-700">
          The enrichment panel failed to load. Reload the page to try again.
        </p>
      ) : (
        this.props.children
      );
  }
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-error-boundary.spec.tsx` — expect PASS (2 tests).

- [ ] Write the failing panel spec `video-enrichment-panel.spec.tsx` (hooks mocked at the module boundary; children real):

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  // @vitest-environment jsdom

  import { act, render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { useForm } from 'react-hook-form';
  import { toast } from 'sonner';

  import type { VideoFormData } from '@/lib/validation/create-video-schema';
  import { CLIENT_POLL_DEADLINE_MS } from '@/lib/validation/bio-generation-schema';

  import { VideoEnrichmentPanel } from './video-enrichment-panel';

  const mocks = vi.hoisted(() => ({
    useVideoEnrichmentStatusQuery: vi.fn(),
    runVideoEnrichment: vi.fn(),
    applyVideoSuggestion: vi.fn(),
    applyVideoSuggestionAsync: vi.fn(),
  }));

  vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

  vi.mock('@/app/hooks/use-video-enrichment-status-query', () => ({
    useVideoEnrichmentStatusQuery: (videoId: string, options: unknown) =>
      mocks.useVideoEnrichmentStatusQuery(videoId, options),
  }));

  vi.mock('@/app/hooks/mutations/use-video-enrichment-mutations', () => ({
    useRunVideoEnrichmentMutation: () => ({
      runVideoEnrichment: mocks.runVideoEnrichment,
      isRunningVideoEnrichment: false,
    }),
    useApplyVideoSuggestionMutation: () => ({
      applyVideoSuggestion: mocks.applyVideoSuggestion,
      applyVideoSuggestionAsync: mocks.applyVideoSuggestionAsync,
      isApplyingVideoSuggestion: false,
    }),
  }));

  const baseStatus = {
    status: null,
    error: null,
    progress: null,
    enrichedAt: null,
    currentReleasedOn: '2026-02-01',
    artists: [],
    suggestions: [],
  };

  const leadArtist = {
    artistId: 'a1',
    displayName: 'E2E Enrich Lead',
    role: 'PRIMARY' as const,
    current: {
      firstName: 'E2E',
      middleName: null,
      surname: 'Enrich Lead',
      akaNames: null,
      displayName: 'E2E Enrich Lead',
      bornOn: null,
    },
  };

  const bornOnSuggestion = {
    id: 's1',
    artistId: 'a1',
    field: 'bornOn' as const,
    value: '1985-03-15',
    confidence: 'high' as const,
    sources: [{ url: 'https://musicbrainz.org/artist/x' }],
    note: null,
    status: 'pending' as const,
  };

  const releasedOnSuggestion = {
    id: 's3',
    artistId: null,
    field: 'releasedOn' as const,
    value: '2020-06-01',
    confidence: 'medium' as const,
    sources: [{ url: 'https://musicbrainz.org/release/y' }],
    note: null,
    status: 'pending' as const,
  };

  const succeededStatus = {
    ...baseStatus,
    status: 'succeeded',
    enrichedAt: '2026-07-11T00:00:00.000Z',
    artists: [leadArtist],
    suggestions: [bornOnSuggestion, releasedOnSuggestion],
  };

  const setStatus = (data: unknown) =>
    mocks.useVideoEnrichmentStatusQuery.mockReturnValue({
      isPending: false,
      error: Error('Unknown error'),
      data,
      refetch: vi.fn(),
    });

  interface HarnessProps {
    onApplyReleaseDate?: (value: string) => void;
  }

  const Harness = ({ onApplyReleaseDate = vi.fn() }: HarnessProps) => {
    const form = useForm<VideoFormData>({ defaultValues: { releasedOn: '2026-02-01' } });
    return (
      <VideoEnrichmentPanel
        videoId="v1"
        control={form.control}
        onApplyReleaseDate={onApplyReleaseDate}
      />
    );
  };

  beforeEach(() => {
    setStatus(baseStatus);
    mocks.applyVideoSuggestionAsync.mockResolvedValue({ success: true });
  });

  describe('VideoEnrichmentPanel — states', () => {
    it('renders a skeleton while the status query has no data', () => {
      setStatus(undefined);
      render(<Harness />);

      expect(screen.getByTestId('video-enrichment-panel')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Run enrichment' })).not.toBeInTheDocument();
    });

    it('offers Run enrichment for a never-enriched video', () => {
      render(<Harness />);

      expect(screen.getByRole('button', { name: 'Run enrichment' })).toBeInTheDocument();
    });

    it('runs enrichment directly (no dialog) from the empty state', async () => {
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Run enrichment' }));

      expect(mocks.runVideoEnrichment).toHaveBeenCalledTimes(1);
    });

    it('shows the in-flight chip while processing', () => {
      setStatus({
        ...baseStatus,
        status: 'processing',
        progress: { stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' },
      });
      render(<Harness />);

      expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
    });

    it('shows the progress timeline while processing', () => {
      setStatus({
        ...baseStatus,
        status: 'processing',
        progress: { stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' },
      });
      render(<Harness />);

      expect(screen.getByRole('list', { name: 'Enrichment progress' })).toBeInTheDocument();
    });

    it('hides the run buttons while in flight', () => {
      setStatus({ ...baseStatus, status: 'pending' });
      render(<Harness />);

      expect(screen.queryByRole('button', { name: /enrichment/i })).not.toBeInTheDocument();
    });

    it('shows the stored error and Re-run on failure', () => {
      setStatus({ ...baseStatus, status: 'failed', error: 'Lambda invoke failed' });
      render(<Harness />);

      expect(screen.getByText('Lambda invoke failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Re-run enrichment' })).toBeInTheDocument();
    });

    it('announces the failed terminal state politely', () => {
      setStatus({ ...baseStatus, status: 'failed', error: 'Lambda invoke failed' });
      render(<Harness />);

      expect(screen.getByText('Enrichment failed.')).toHaveClass('sr-only');
    });

    it('announces the succeeded terminal state politely', () => {
      setStatus(succeededStatus);
      render(<Harness />);

      expect(screen.getByText('Enrichment succeeded.')).toHaveClass('sr-only');
    });

    it('renders one card per artist with suggestions on success', () => {
      setStatus(succeededStatus);
      render(<Harness />);

      expect(screen.getAllByTestId('video-artist-suggestion-card')).toHaveLength(1);
    });

    it('renders the release-date suggestion on success', () => {
      setStatus(succeededStatus);
      render(<Harness />);

      expect(screen.getByTestId('video-release-date-suggestion')).toBeInTheDocument();
    });

    it('omits artists that have no suggestions', () => {
      setStatus({ ...succeededStatus, suggestions: [releasedOnSuggestion] });
      render(<Harness />);

      expect(screen.queryByTestId('video-artist-suggestion-card')).not.toBeInTheDocument();
    });
  });

  describe('VideoEnrichmentPanel — re-run dialog', () => {
    it('opens a confirm dialog instead of re-running immediately', async () => {
      setStatus(succeededStatus);
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(mocks.runVideoEnrichment).not.toHaveBeenCalled();
    });

    it('re-runs after the dialog is confirmed', async () => {
      setStatus(succeededStatus);
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));
      await userEvent.click(screen.getByRole('button', { name: 'Re-run' }));

      expect(mocks.runVideoEnrichment).toHaveBeenCalledTimes(1);
    });

    it('does not re-run when the dialog is cancelled', async () => {
      setStatus(succeededStatus);
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Re-run enrichment' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mocks.runVideoEnrichment).not.toHaveBeenCalled();
    });
  });

  describe('VideoEnrichmentPanel — apply wiring', () => {
    it('sends an apply with the suggestion id and expectedCurrent', async () => {
      setStatus(succeededStatus);
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

      await waitFor(() =>
        expect(mocks.applyVideoSuggestionAsync).toHaveBeenCalledWith({
          suggestionId: 's1',
          op: 'apply',
          expectedCurrent: null,
        })
      );
    });

    it('sends a dismiss without touching the form', async () => {
      setStatus(succeededStatus);
      render(<Harness />);

      await userEvent.click(screen.getByRole('button', { name: 'Dismiss Born on suggestion' }));

      expect(mocks.applyVideoSuggestion).toHaveBeenCalledWith({
        suggestionId: 's1',
        op: 'dismiss',
      });
    });

    it('routes the release-date apply into the form callback, never the server', async () => {
      const onApplyReleaseDate = vi.fn();
      setStatus(succeededStatus);
      render(<Harness onApplyReleaseDate={onApplyReleaseDate} />);

      await userEvent.click(screen.getByRole('button', { name: 'Apply Release date suggestion' }));

      expect(onApplyReleaseDate).toHaveBeenCalledWith('2020-06-01');
      expect(mocks.applyVideoSuggestionAsync).not.toHaveBeenCalled();
    });
  });

  describe('VideoEnrichmentPanel — poll deadline give-up', () => {
    it('toasts and disables polling when an in-flight job outlives the deadline', () => {
      vi.useFakeTimers();
      setStatus({ ...baseStatus, status: 'processing' });
      render(<Harness />);

      act(() => {
        vi.advanceTimersByTime(CLIENT_POLL_DEADLINE_MS);
      });

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Enrichment timed out. Re-run to try again.'
      );
      const lastCall = mocks.useVideoEnrichmentStatusQuery.mock.calls.at(-1);
      expect((lastCall?.[1] as { enabled: boolean }).enabled).toBe(false);
      vi.useRealTimers();
    });

    it('keeps polling enabled before the deadline', () => {
      setStatus({ ...baseStatus, status: 'processing' });
      render(<Harness />);

      const lastCall = mocks.useVideoEnrichmentStatusQuery.mock.calls.at(-1);
      expect((lastCall?.[1] as { enabled: boolean }).enabled).toBe(true);
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx` — expect FAIL: `Cannot find module './video-enrichment-panel'`.

- [ ] Implement `video-enrichment-panel.tsx`:

  ```tsx
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  'use client';

  import { useCallback, useEffect, useState } from 'react';

  import { Sparkles } from 'lucide-react';
  import { toast } from 'sonner';

  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from '@/app/components/ui/alert-dialog';
  import { Button } from '@/app/components/ui/button';
  import { Skeleton } from '@/app/components/ui/skeleton';
  import {
    useApplyVideoSuggestionMutation,
    useRunVideoEnrichmentMutation,
  } from '@/app/hooks/mutations/use-video-enrichment-mutations';
  import { useVideoEnrichmentStatusQuery } from '@/app/hooks/use-video-enrichment-status-query';
  import { CLIENT_POLL_DEADLINE_MS } from '@/lib/validation/bio-generation-schema';
  import type { VideoFormData } from '@/lib/validation/create-video-schema';
  import { isInFlightEnrichmentStatus } from '@/lib/validation/video-enrichment-schema';
  import type { VideoEnrichmentStatusResponse } from '@/lib/validation/video-enrichment-schema';

  import { VideoArtistSuggestionCard } from './video-artist-suggestion-card';
  import { VideoEnrichmentProgressTimeline } from './video-enrichment-progress-timeline';
  import { VideoEnrichmentStatusChip } from './video-enrichment-status-chip';
  import { VideoReleaseDateSuggestion } from './video-release-date-suggestion';

  import type { Control } from 'react-hook-form';

  type EnrichmentArtist = VideoEnrichmentStatusResponse['artists'][number];
  type EnrichmentSuggestion = VideoEnrichmentStatusResponse['suggestions'][number];

  interface VideoEnrichmentPanelProps {
    videoId: string;
    control: Control<VideoFormData>;
    /** Applies the release-date suggestion into the parent RHF form. */
    onApplyReleaseDate: (value: string) => void;
  }

  interface ArtistGroup {
    artist: EnrichmentArtist;
    suggestions: EnrichmentSuggestion[];
  }

  /** Group suggestions under their artist, dropping artists with none. */
  export const groupArtistSuggestions = (data: VideoEnrichmentStatusResponse): ArtistGroup[] =>
    data.artists
      .map((artist) => ({
        artist,
        suggestions: data.suggestions.filter((s) => s.artistId === artist.artistId),
      }))
      .filter(({ suggestions }) => suggestions.length > 0);

  /** The single video-level release-date suggestion, if the run produced one. */
  export const findReleaseDateSuggestion = (
    data: VideoEnrichmentStatusResponse
  ): EnrichmentSuggestion | undefined =>
    data.suggestions.find((s) => s.artistId === null && s.field === 'releasedOn');

  interface RerunEnrichmentDialogProps {
    disabled: boolean;
    onConfirm: () => void;
  }

  /** Re-run always confirms first — it replaces the pending suggestion rows. */
  const RerunEnrichmentDialog = ({ disabled, onConfirm }: RerunEnrichmentDialogProps) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>
          <Sparkles className="size-4" aria-hidden />
          Re-run enrichment
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-run enrichment?</AlertDialogTitle>
          <AlertDialogDescription>
            Re-running replaces the pending suggestions below. Applied and dismissed suggestions are
            kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Re-run</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  interface EnrichmentResultsProps {
    data: VideoEnrichmentStatusResponse;
    control: Control<VideoFormData>;
    isBusy: boolean;
    onApplyReleaseDate: (value: string) => void;
    onApplySuggestion: (
      suggestion: EnrichmentSuggestion,
      expectedCurrent: string | null
    ) => Promise<boolean>;
    onDismissSuggestion: (suggestion: EnrichmentSuggestion) => void;
  }

  const EnrichmentResults = ({
    data,
    control,
    isBusy,
    onApplyReleaseDate,
    onApplySuggestion,
    onDismissSuggestion,
  }: EnrichmentResultsProps) => {
    const releaseDateSuggestion = findReleaseDateSuggestion(data);
    return (
      <div className="space-y-4">
        {groupArtistSuggestions(data).map(({ artist, suggestions }) => (
          <VideoArtistSuggestionCard
            key={artist.artistId}
            artist={artist}
            suggestions={suggestions}
            isBusy={isBusy}
            onApplySuggestion={onApplySuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
        ))}
        {releaseDateSuggestion ? (
          <VideoReleaseDateSuggestion
            suggestion={releaseDateSuggestion}
            control={control}
            name="releasedOn"
            onApplyReleaseDate={onApplyReleaseDate}
            onDismiss={() => onDismissSuggestion(releaseDateSuggestion)}
            isBusy={isBusy}
          />
        ) : null}
      </div>
    );
  };

  /**
   * Admin panel orchestrating the async web-enrichment lifecycle for a MUSIC
   * video: trigger/re-run (re-run behind a confirm dialog), 2.5s status polling
   * with a 20-minute client give-up (mirroring the bio section's
   * CLIENT_POLL_DEADLINE pattern), a live stage timeline, and per-artist /
   * release-date suggestion review. Artist applies are pessimistic server
   * actions; the release date applies into the parent form only.
   */
  export const VideoEnrichmentPanel = ({
    videoId,
    control,
    onApplyReleaseDate,
  }: VideoEnrichmentPanelProps): React.ReactElement => {
    const [gaveUp, setGaveUp] = useState(false);
    const { data } = useVideoEnrichmentStatusQuery(videoId, { enabled: !gaveUp });
    const { runVideoEnrichment, isRunningVideoEnrichment } = useRunVideoEnrichmentMutation(videoId);
    const { applyVideoSuggestion, applyVideoSuggestionAsync, isApplyingVideoSuggestion } =
      useApplyVideoSuggestionMutation(videoId);

    const status = data?.status ?? null;
    const isInFlight = isInFlightEnrichmentStatus(status);
    const isBusy = isRunningVideoEnrichment || isApplyingVideoSuggestion;

    // Last-resort client stop: if a run never reaches a terminal status, stop
    // polling after the deadline (the server's stale-job coercion normally
    // flips the job to `failed` well before this fires).
    useEffect(() => {
      if (!isInFlight || gaveUp) return;
      const timeoutId = setTimeout(() => {
        toast.error('Enrichment timed out. Re-run to try again.');
        setGaveUp(true);
      }, CLIENT_POLL_DEADLINE_MS);
      return () => clearTimeout(timeoutId);
    }, [isInFlight, gaveUp]);

    const triggerRun = useCallback((): void => {
      setGaveUp(false);
      runVideoEnrichment();
    }, [runVideoEnrichment]);

    const applySuggestion = useCallback(
      async (
        suggestion: EnrichmentSuggestion,
        expectedCurrent: string | null
      ): Promise<boolean> => {
        try {
          const result = await applyVideoSuggestionAsync({
            suggestionId: suggestion.id,
            op: 'apply',
            expectedCurrent,
          });
          return result.success;
        } catch {
          return false;
        }
      },
      [applyVideoSuggestionAsync]
    );

    const dismissSuggestion = useCallback(
      (suggestion: EnrichmentSuggestion): void =>
        applyVideoSuggestion({ suggestionId: suggestion.id, op: 'dismiss' }),
      [applyVideoSuggestion]
    );

    return (
      <section data-testid="video-enrichment-panel" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="text-primary size-5" aria-hidden />
          <h2 className="font-semibold">Web Enrichment</h2>
          {data !== undefined ? <VideoEnrichmentStatusChip status={status} /> : null}
        </div>

        {status === 'succeeded' || status === 'failed' ? (
          <p role="status" aria-live="polite" className="sr-only">
            {status === 'succeeded' ? 'Enrichment succeeded.' : 'Enrichment failed.'}
          </p>
        ) : null}

        {data === undefined ? (
          <div className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {data !== undefined && status === null ? (
          <Button type="button" disabled={isBusy} onClick={triggerRun}>
            <Sparkles className="size-4" aria-hidden />
            Run enrichment
          </Button>
        ) : null}

        {isInFlight ? <VideoEnrichmentProgressTimeline progress={data?.progress} /> : null}

        {status === 'failed' && data?.error ? (
          <p className="text-destructive text-sm">{data.error}</p>
        ) : null}

        {data !== undefined && (status === 'succeeded' || status === 'failed') ? (
          <RerunEnrichmentDialog disabled={isBusy} onConfirm={triggerRun} />
        ) : null}

        {data !== undefined && status === 'succeeded' ? (
          <EnrichmentResults
            data={data}
            control={control}
            isBusy={isBusy}
            onApplyReleaseDate={onApplyReleaseDate}
            onApplySuggestion={applySuggestion}
            onDismissSuggestion={dismissSuggestion}
          />
        ) : null}
      </section>
    );
  };
  ```

  If ESLint's `complexity` rule (cap 10) flags `VideoEnrichmentPanel`, extract
  the state-branch JSX block into a named `EnrichmentPanelBody` component in the
  same file rather than suppressing.

- [ ] Run `pnpm run test:run src/app/components/forms/videos/enrichment/video-enrichment-panel.spec.tsx` — expect PASS (20 tests).

- [ ] Commit the component wave:

  ```bash
  git add src/app/components/forms/videos/enrichment/
  git commit -m "feat(videos): ✨ enrichment panel components"
  ```

- [ ] Add the failing integration tests to `src/app/components/forms/video-form.spec.tsx`. Add this module mock next to the existing mocks:

  ```tsx
  vi.mock('@/app/components/forms/videos/enrichment/video-enrichment-panel', () => ({
    VideoEnrichmentPanel: ({ videoId }: { videoId: string }) => (
      <div data-testid="video-enrichment-panel" data-video-id={videoId} />
    ),
  }));
  ```

  Then append this describe (reuses the module-scope `editVideo` from Task 18):

  ```tsx
  describe('VideoForm — enrichment panel mount gating', () => {
    const asVideo = (video: unknown) =>
      mocks.useVideoQuery.mockReturnValue({
        data: video,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

    it('mounts the panel for a MUSIC video in edit mode', async () => {
      asVideo({ ...editVideo, category: 'MUSIC' });
      render(<VideoForm videoId="v1" />);

      expect(await screen.findByTestId('video-enrichment-panel')).toHaveAttribute(
        'data-video-id',
        'v1'
      );
    });

    it('keeps the panel out of the DOM for an INFORMATIONAL video', async () => {
      asVideo(editVideo);
      render(<VideoForm videoId="v1" />);

      await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Existing Title'));
      expect(screen.queryByTestId('video-enrichment-panel')).not.toBeInTheDocument();
    });

    it('keeps the panel out of the DOM in create mode', () => {
      render(<VideoForm />);

      expect(screen.queryByTestId('video-enrichment-panel')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect FAIL: `mounts the panel for a MUSIC video in edit mode` (the form never renders the panel).

- [ ] Integrate the panel into `src/app/components/forms/video-form.tsx`:

  Add imports:

  ```tsx
  import { VideoEnrichmentErrorBoundary } from './videos/enrichment/video-enrichment-error-boundary';
  import { VideoEnrichmentPanel } from './videos/enrichment/video-enrichment-panel';

  import type { VideoRow } from '@/lib/validation/video-schema';
  import type { Control } from 'react-hook-form';
  ```

  Add a small mount helper above `VideoForm` (keeps the page component under the
  complexity cap):

  ```tsx
  interface EnrichmentPanelMountProps {
    video: VideoRow | null | undefined;
    control: Control<VideoFormData>;
    onApplyReleaseDate: (value: string) => void;
  }

  /** MUSIC-only, edit-only: absent from the DOM otherwise (INFORMATIONAL/create). */
  const EnrichmentPanelMount = ({
    video,
    control,
    onApplyReleaseDate,
  }: EnrichmentPanelMountProps): React.ReactElement | null =>
    video?.category === 'MUSIC' ? (
      <VideoEnrichmentErrorBoundary>
        <VideoEnrichmentPanel
          videoId={video.id}
          control={control}
          onApplyReleaseDate={onApplyReleaseDate}
        />
      </VideoEnrichmentErrorBoundary>
    ) : null;
  ```

  Inside `VideoForm`, add the callback next to `handleSelectDate`:

  ```tsx
  const handleApplyReleaseDate = useCallback(
    (value: string): void =>
      setValue('releasedOn', value, { shouldDirty: true, shouldValidate: true }),
    [setValue]
  );
  ```

  And mount it directly after `<VideoMetadataSection …/>` (in create mode
  `video` is null — the query is disabled — so nothing renders):

  ```tsx
  <VideoMetadataSection control={control} onSelectDate={handleSelectDate} />
  <EnrichmentPanelMount
    video={video}
    control={control}
    onApplyReleaseDate={handleApplyReleaseDate}
  />
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect PASS (all existing + 3 new).

- [ ] Run `pnpm run test:run` — expect PASS (full unit suite; catches any collateral).

- [ ] Commit the integration:
  ```bash
  git add src/app/components/forms/video-form.tsx src/app/components/forms/video-form.spec.tsx
  git commit -m "feat(videos): ✨ mount enrichment panel in form"
  ```

---

### Task 20: Post-create redirect + E2E seeds + `admin-video-enrichment.spec.ts`

**Files:**

- Modify: `src/app/components/forms/video-form.tsx` (create-success redirect)
- Modify: `src/app/components/forms/video-form.spec.tsx` (redirect expectation)
- Modify: `e2e/helpers/seed-test-db.ts` (enrichment fixtures + exports)
- Create: `e2e/tests/admin-video-enrichment.spec.ts`

**Interfaces:**

- Consumes: seeded Part A schema (`Video` probe scalars, `VideoArtist` join with `role: 'PRIMARY' | 'FEATURED'` + `sortOrder`); Part B's `videoEnrichmentFixture` values via the `BIO_GENERATOR_FAKE=true` web server (already configured in `playwright.config.ts`): per artist bornOn `'1985-03-15'` (high) + akaNames `'E2E Alias'` (medium) with `musicbrainz.org` sources; releasedOn `'2020-06-01'` (medium); `expect`/`test` + `adminPage` from `e2e/fixtures/auth.fixture`.
- Produces: `router.push(\`/admin/videos/${preGeneratedId}\`)`after create (edit submit still returns to`/admin/videos`); seed exports `ENRICH_MUSIC_VIDEO_ID`, `ENRICH_INFO_VIDEO_ID`consumed by the new spec (same import pattern as`BIO_PALETTE_ARTIST_ID`).
- **Seed collision analysis (why these values):** the two new videos are `publishedAt: PUBLISHED_AT` **and** `archivedAt: ARCHIVED_AT`. Archived rows are excluded from the public `/videos` listing AND from the admin default / published-only / unpublished-only views, so every existing count/order assertion stays true verbatim: `videos.spec.ts` (page-1 exact 5, infinite-scroll `toHaveCount(7)`, Golf-leads-oldest), `admin-videos-list.spec.ts` (`toHaveCount(8)` after Load More, unpublished `toHaveCount(1)`, Alpha/Golf sort leaders). The archived-toggle test only asserts the `E2E Video Archived` heading visible + Draft/Alpha absent — three archived rows on one page keep that true, and the titles `E2E Enrich Hotel` / `E2E Enrich India` share no substring with any asserted title (`getByText` is case-insensitive substring). The enrichment spec reaches both rows by direct URL, so list visibility is irrelevant. The two shell artists get `createdAt` pinned to 2020 so they sort last in `/admin/artists` (createdAt desc) and can never become the first-listed artist that `admin-artist-bio-generation.spec.ts` destructively regenerates; they are unpublished so public artist pages ignore them.

**Steps:**

- [ ] Update the redirect expectation in `src/app/components/forms/video-form.spec.tsx` — change the existing create-navigation test to the new destination (the pre-generated id is the created video's id):

  ```tsx
  it('navigates to the new video edit page after a successful create', async () => {
    const user = setup();
    render(<VideoForm />);

    await uploadVideoFile(user);
    await screen.findByText('clip.mp4');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/admin/videos/${'a'.repeat(24)}`));
  });
  ```

  (Replaces the test currently named `navigates to the admin videos list after a successful create`. The edit-mode Cancel test and the edit-submit flow keep asserting `/admin/videos` — do not touch them.)

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect FAIL: `navigates to the new video edit page after a successful create` (received `/admin/videos`).

- [ ] Implement the redirect in `src/app/components/forms/video-form.tsx` — in `submitVideo`, replace:

  ```ts
  toast.success(`Video ${isEditMode ? 'updated' : 'created'} successfully.`);
  router.push('/admin/videos');
  ```

  with:

  ```ts
  toast.success(`Video ${isEditMode ? 'updated' : 'created'} successfully.`);
  // Create lands on the new video's edit page so the admin can watch the
  // probe + auto-kicked enrichment complete; edit returns to the list.
  router.push(isEditMode ? '/admin/videos' : `/admin/videos/${preGeneratedId}`);
  ```

- [ ] Run `pnpm run test:run src/app/components/forms/video-form.spec.tsx` — expect PASS.

- [ ] Commit the redirect:

  ```bash
  git add src/app/components/forms/video-form.tsx src/app/components/forms/video-form.spec.tsx
  git commit -m "feat(videos): ✨ redirect to edit after create"
  ```

- [ ] Write the failing E2E spec `e2e/tests/admin-video-enrichment.spec.ts`:

  ```ts
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  import { expect, test } from '../fixtures/auth.fixture';

  import { ENRICH_INFO_VIDEO_ID, ENRICH_MUSIC_VIDEO_ID } from '../helpers/seed-test-db';

  /**
   * E2E coverage for the video web-enrichment flow. The web server runs with
   * BIO_GENERATOR_FAKE=true (playwright.config.ts), so Run enrichment writes the
   * deterministic videoEnrichmentFixture suggestions instead of invoking the
   * Lambda: per artist bornOn 1985-03-15 (high) + akaNames 'E2E Alias' (medium)
   * with musicbrainz.org sources, and releasedOn 2020-06-01 (medium).
   *
   * Parallel safety: both videos, both shell artists, and every suggestion row
   * touched here are DEDICATED to this spec (unique 'E2E Enrich' titles/names,
   * archived so no listing spec ever sees them); no deleteMany anywhere.
   */

  test.describe('Admin video enrichment', () => {
    // One sequential flow: run → suggestions → apply → verify on artist →
    // re-run. Split tests would race each other against the same video row.
    test('runs, applies a suggestion, verifies it, and re-runs', async ({ adminPage }) => {
      // Two fake enrichment runs (≥4s pause each) + 2.5s polling + a page
      // round-trip to the artist editor — triple the budget like the bio spec.
      test.slow();

      await adminPage.goto(`/admin/videos/${ENRICH_MUSIC_VIDEO_ID}`);

      // The technical card renders from the seeded probe scalars for ALL
      // categories — this is the MUSIC instance.
      const techCard = adminPage.getByTestId('video-technical-metadata-card');
      await expect(techCard).toBeVisible({ timeout: 15_000 });
      await expect(techCard.getByText('1920×1080')).toBeVisible();
      await expect(techCard.getByText('4.2 Mbps')).toBeVisible();
      await expect(techCard.getByText('29.97 fps')).toBeVisible();

      const panel = adminPage.getByTestId('video-enrichment-panel');
      await expect(panel).toBeVisible();
      const chip = panel.getByTestId('video-enrichment-status-chip');
      await expect(chip).toHaveText('Not enriched');

      await panel.getByRole('button', { name: 'Run enrichment' }).click();

      // In-flight indicator: the fake path pauses ≥4s before completing, so
      // the 2.5s poll observes the pending/processing chip at least once.
      await expect(chip).toHaveText('Enriching…', { timeout: 20_000 });

      // Terminal success, then one suggestion card per seeded VideoArtist.
      await expect(chip).toHaveText('Enriched', { timeout: 30_000 });
      const cards = panel.getByTestId('video-artist-suggestion-card');
      await expect(cards).toHaveCount(2);

      const leadCard = cards.filter({
        has: adminPage.getByRole('link', { name: 'E2E Enrich Lead' }),
      });
      await expect(leadCard).toHaveCount(1);

      // Fixture values on the lead card: suggested DOB + high confidence +
      // MusicBrainz source; the release-date suggestion renders separately.
      await expect(leadCard.getByText('1985-03-15')).toBeVisible();
      await expect(leadCard.getByText('High', { exact: true })).toBeVisible();
      await expect(
        panel.getByTestId('video-release-date-suggestion').getByText('2020-06-01')
      ).toBeVisible();

      // Apply the lead's bornOn (pessimistic — the row flips only after the
      // server confirms and the status refetch lands).
      await leadCard.getByRole('button', { name: 'Apply Born on suggestion' }).click();
      await expect(leadCard.getByText('Applied', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // Verify on the artist editor via the card's own link (robust to ids).
      await leadCard.getByRole('link', { name: 'E2E Enrich Lead' }).click();
      await expect(adminPage).toHaveURL(/\/admin\/artists\/[a-f0-9]{24}$/);
      const datesSection = adminPage.locator('section', {
        has: adminPage.getByRole('heading', { name: 'Important Dates' }),
      });
      // bornOn is the FIRST date field in Important Dates; the DatePicker
      // formats 'YYYY-MM-DD' at local midnight, so this is TZ-independent.
      await expect(datesSection.getByPlaceholder('mm/dd/yyyy').first()).toHaveValue('03/15/1985', {
        timeout: 15_000,
      });

      // Back to the video: the enrichment state is persisted.
      await adminPage.goto(`/admin/videos/${ENRICH_MUSIC_VIDEO_ID}`);
      await expect(chip).toHaveText('Enriched', { timeout: 15_000 });

      // Re-run goes through the AlertDialog and completes a second run.
      await panel.getByRole('button', { name: 'Re-run enrichment' }).click();
      const dialog = adminPage.getByRole('alertdialog');
      await expect(dialog.getByText('Re-run enrichment?')).toBeVisible();
      await dialog.getByRole('button', { name: 'Re-run', exact: true }).click();

      await expect(chip).toHaveText('Enriching…', { timeout: 20_000 });
      await expect(chip).toHaveText('Enriched', { timeout: 30_000 });

      // The earlier apply survives the re-run: applied rows are fenced —
      // only pending rows get replaced.
      await expect(leadCard.getByText('Applied', { exact: true })).toBeVisible();
    });

    test('an informational video shows probe data but never the panel', async ({ adminPage }) => {
      await adminPage.goto(`/admin/videos/${ENRICH_INFO_VIDEO_ID}`);

      await expect(adminPage.getByTestId('video-technical-metadata-card')).toBeVisible({
        timeout: 15_000,
      });
      // Absent from the DOM entirely — not merely hidden (toHaveCount counts
      // hidden elements, so 0 is the only safe assertion).
      await expect(adminPage.getByTestId('video-enrichment-panel')).toHaveCount(0);
    });
  });
  ```

- [ ] Extend `e2e/helpers/seed-test-db.ts`. Add the constants after `BIO_CUSTOM_MEDIA_ARTIST_ID`:

  ```ts
  /**
   * Deterministic ids for the video-enrichment E2E fixtures
   * (admin-video-enrichment.spec.ts). Both videos are published AND archived so
   * they are invisible to every listing assertion (public /videos excludes
   * archived; the admin default/published/unpublished views exclude archived);
   * the spec reaches them by direct URL.
   */
  const ENRICH_MUSIC_VIDEO_ID = '65a1b2c3d4e5f6a7b8c9d2b1';
  const ENRICH_INFO_VIDEO_ID = '65a1b2c3d4e5f6a7b8c9d2b2';
  const ENRICH_LEAD_ARTIST_ID = '65a1b2c3d4e5f6a7b8c9d2a1';
  const ENRICH_GUEST_ARTIST_ID = '65a1b2c3d4e5f6a7b8c9d2a2';
  ```

  Add the seeding helper after `seedVideos` (single `createMany` per model —
  `VideoArtist` is a FRESH collection, so its first writes MUST be one
  `createMany`, never `Promise.all(create)`):

  ```ts
  /**
   * Seed the dedicated video-enrichment fixtures: two probed videos (MUSIC +
   * INFORMATIONAL) and the two shell artists the MUSIC video's artist string
   * splits into ('E2E Enrich Lead feat. E2E Enrich Guest'). Slugs/displayNames
   * match the canonical findOrCreateByName derivation so a Run in the spec
   * attaches suggestions to THESE rows instead of creating duplicates. The
   * artists' createdAt is pinned to 2020 so they sort last in the admin
   * artists list and never become the first-listed artist the bio-generation
   * spec regenerates.
   */
  const seedEnrichmentFixtures = async (prisma: PrismaClient): Promise<void> => {
    await prisma.artist.createMany({
      data: [
        {
          id: ENRICH_LEAD_ARTIST_ID,
          firstName: 'E2E',
          surname: 'Enrich Lead',
          slug: 'e2e-enrich-lead',
          displayName: 'E2E Enrich Lead',
          createdAt: new Date('2020-01-04T00:00:00Z'),
        },
        {
          id: ENRICH_GUEST_ARTIST_ID,
          firstName: 'E2E',
          surname: 'Enrich Guest',
          slug: 'e2e-enrich-guest',
          displayName: 'E2E Enrich Guest',
          createdAt: new Date('2020-01-05T00:00:00Z'),
        },
      ],
    });

    // Probe scalars the technical-card assertions pin ('1920×1080', '4.2 Mbps',
    // '29.97 fps'); releasedOn intentionally differs from the fixture's
    // releasedOn suggestion (2020-06-01) so the suggestion is emitted.
    const probeScalars = {
      probedAt: new Date('2026-02-02T00:00:00.000Z'),
      container: 'mp4',
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrateKbps: 4200,
      frameRate: 29.97,
      audioChannels: 2,
      audioSampleRateHz: 44100,
    };

    await prisma.video.createMany({
      data: [
        {
          id: ENRICH_MUSIC_VIDEO_ID,
          title: 'E2E Enrich Hotel',
          artist: 'E2E Enrich Lead feat. E2E Enrich Guest',
          category: 'MUSIC',
          releasedOn: new Date('2026-02-01T00:00:00.000Z'),
          durationSeconds: 200,
          s3Key: 'media/videos/e2e/e2e-enrich-hotel.mp4',
          fileName: 'e2e-enrich-hotel.mp4',
          mimeType: 'video/mp4',
          fileSize: BigInt(1048576),
          posterUrl: null,
          description: 'E2E Enrich Hotel description for E2E.',
          publishedAt: PUBLISHED_AT,
          archivedAt: ARCHIVED_AT,
          ...probeScalars,
        },
        {
          id: ENRICH_INFO_VIDEO_ID,
          title: 'E2E Enrich India',
          artist: 'E2E Enrich Narrator',
          category: 'INFORMATIONAL',
          releasedOn: new Date('2026-01-31T00:00:00.000Z'),
          durationSeconds: 100,
          s3Key: 'media/videos/e2e/e2e-enrich-india.mp4',
          fileName: 'e2e-enrich-india.mp4',
          mimeType: 'video/mp4',
          fileSize: BigInt(1048576),
          posterUrl: null,
          description: 'E2E Enrich India description for E2E.',
          publishedAt: PUBLISHED_AT,
          archivedAt: ARCHIVED_AT,
          ...probeScalars,
        },
      ],
    });

    // First-ever writes to the fresh VideoArtist collection — a single
    // createMany (concurrent create() read-backs race in CI on new collections).
    await prisma.videoArtist.createMany({
      data: [
        {
          videoId: ENRICH_MUSIC_VIDEO_ID,
          artistId: ENRICH_LEAD_ARTIST_ID,
          role: 'PRIMARY',
          sortOrder: 0,
        },
        {
          videoId: ENRICH_MUSIC_VIDEO_ID,
          artistId: ENRICH_GUEST_ARTIST_ID,
          role: 'FEATURED',
          sortOrder: 1,
        },
      ],
    });
  };
  ```

  Call it in `seedTestDatabase` right after the existing call:

  ```ts
  await seedVideos(prisma);
  await seedEnrichmentFixtures(prisma);
  ```

  Add `videoEnrichmentSuggestion` + `videoArtist` cleanup at the TOP of the
  delete cascade (before `prisma.video.deleteMany({})` and before
  `prisma.artist.deleteMany({})`; exact model accessors come from Part A's
  schema):

  ```ts
  await prisma.videoEnrichmentSuggestion.deleteMany({});
  await prisma.videoArtist.deleteMany({});
  ```

  And extend the export block:

  ```ts
  export {
    BIO_CUSTOM_MEDIA_ARTIST_ID,
    BIO_FILTER_INSERT_ARTIST_ID,
    BIO_PALETTE_ARTIST_ID,
    createBioPaletteLinkRow,
    createDisposableSignoutState,
    ENRICH_INFO_VIDEO_ID,
    ENRICH_MUSIC_VIDEO_ID,
    seedTestDatabase,
    SIGNOUT_USER_ID,
    TEST_USERS,
  };
  ```

- [ ] Run the new spec against the isolated stack (never a `.env*` URL; the
      hardcoded `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` defaults in
      `playwright.config.ts` / `seed-test-db.ts` handle the wiring):

  ```bash
  pnpm run e2e:docker:up
  pnpm run test:e2e e2e/tests/admin-video-enrichment.spec.ts
  ```

  Expect PASS (2 tests). If the run FAILS with empty suggestions / 'Not
  enriched' never advancing, the first hypothesis per repo rules is
  wrong-database or a Part B fake-path mismatch — stop and surface it, do not
  loosen assertions.

- [ ] Re-run the neighboring video + artist E2E specs that share touched surfaces (repo lesson: run existing specs covering changed components, not just the new one):

  ```bash
  pnpm run test:e2e e2e/tests/admin-video-form.spec.ts e2e/tests/admin-videos-list.spec.ts e2e/tests/videos.spec.ts e2e/tests/admin-artist-bio-generation.spec.ts e2e/tests/admin-entity-delete.spec.ts e2e/tests/mutation-hook-integration.spec.ts
  ```

  Expect PASS — the seed analysis above predicts zero drift; any failure here
  means a fixture collided and must be fixed in the seed values, not the specs.

- [ ] Commit:
  ```bash
  git add e2e/helpers/seed-test-db.ts e2e/tests/admin-video-enrichment.spec.ts
  git commit -m "test(e2e): ✅ video enrichment flow"
  ```

---

### Task 21: Final verification — full gates, both workspaces, full E2E

**Files:** none created; fix-ups only if a gate fails (keep fixes inside the failing gate's loop, then re-run that gate from the top).

**Interfaces:** none — this task proves every contract in Parts A–C holds together.

**Steps:**

- [ ] Run the root pre-commit gate exactly as CLAUDE.md requires:

  ```bash
  pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
  ```

  Expected: `tsc` exits 0 with no errors; the full Vitest suite passes (11 000+ tests, including every spec added in Tasks 16–20); ESLint reports 0 errors/0 warnings (`--max-warnings 0`, auto-fix applied); Prettier rewrites nothing unexpected (`git status` shows no modifications afterward — if it reformatted files, re-run the chain and amend into the relevant commit).

- [ ] Run the coverage gate:

  ```bash
  pnpm run test:coverage:check
  ```

  Expected: global branch coverage ≥ 95% (vitest hard threshold) AND within 2% of the `COVERAGE_METRICS.md` baseline (95.31% branches). Every new file in this part ships with an adjacent spec, so coverage should hold; if a branch gap surfaces (likely candidates: the panel's give-up effect cleanup, `sourceLabel`'s URL catch, the boundary's fallback), add a targeted test to the owning spec — never exclude files.

- [ ] Verify the Lambda workspace still passes untouched (Part B changed it; Part C must not have):

  ```bash
  cd bio-generator && pnpm exec tsc --noEmit && pnpm run test:run && cd ..
  ```

  Expected: 0 type errors, all Lambda tests green (Part B's count). Part C adds nothing here — any failure means an accidental edit; investigate before proceeding.

- [ ] Run the FULL E2E suite against the isolated Docker Mongo (mandatory isolation: never export `DATABASE_URL`, never read `.env*`; the hardcoded localhost:27018 defaults do the wiring):

  ```bash
  pnpm run e2e:docker:up
  pnpm run test:e2e
  ```

  Expected: entire suite green. Watch these specs in particular — they cover surfaces this part touched and MUST pass:
  - `e2e/tests/admin-video-enrichment.spec.ts` (new — 2 tests)
  - `e2e/tests/admin-video-form.spec.ts` (form chrome unchanged by the panel work)
  - `e2e/tests/admin-videos-list.spec.ts` (counts/order survive the archived seed rows)
  - `e2e/tests/videos.spec.ts` (public listing untouched by the seed rows)
  - `e2e/tests/admin-entity-delete.spec.ts` and `e2e/tests/mutation-hook-integration.spec.ts` (mutation/invalidations regression surface)
  - `e2e/tests/admin-artist-bio-generation.spec.ts` (its first-listed-artist assumption survives the 2020-pinned shell artists)

  On any failure: wrong-database is the FIRST hypothesis (repo rule) — confirm the web server's effective URL points at localhost:27018 before touching code. E2E media/codec rules apply if a player assertion flakes (`expect(a.or(b)).toBeVisible()`), and remember `getByText` is case-insensitive substring / `toHaveCount` counts hidden nodes when diagnosing.

- [ ] Tear the stack down:

  ```bash
  pnpm run e2e:docker:down
  ```

- [ ] If (and only if) gate fix-ups left uncommitted changes, commit the stragglers:
  ```bash
  git add -A
  git commit -m "chore(videos): 🔧 gate fixes for enrichment"
  ```
  Expected end state: `git status` clean; branch `feat/video-metadata-enrichment` contains Tasks 16–20 as 8 atomic commits (+ this one only if needed). Do NOT push or open a PR in this task — the branch-finishing flow is a separate decision.

---

## Contract deviations & deliberate decisions (Part C)

1. **`VideoEnrichmentErrorBoundary` is a class component** — the repo bans class components, but React only supports subtree error boundaries as classes and the spec mandates an error-boundary-wrapped panel. No `react-error-boundary` dependency exists (verified) and adding one for ~20 lines fails the lean-dependency rule. Members are arrow class properties so no `function` syntax appears; if `prefer-arrow-functions` (or another rule) still fires, scope a `files`-scoped exemption for this one file in `eslint.config.mjs` — never an inline disable.
2. **`CLIENT_POLL_DEADLINE_MS` is imported from `@/lib/validation/bio-generation-schema`** rather than duplicated — the panel mirrors the bio section's give-up semantics exactly (20 min vs the server's 17-min stale coercion), and reuse-before-create wins over module-locality. If Part A exported a video-side deadline constant, prefer that and update the panel + panel spec imports.
3. **E2E seed videos are published + archived** — the prompt suggested picking `publishedAt`/titles that don't disturb `admin-videos-list.spec.ts`; any non-archived row breaks that file's `toHaveCount(8)` and `videos.spec.ts`'s `toHaveCount(7)` regardless of dates. Archived rows are the only choice that leaves every existing assertion byte-identical, and nothing in the flow requires list visibility (direct-URL navigation).
4. **No duration formatter was added** — `formatDuration` already exists at `src/lib/utils/format-duration.ts` (searched; `'3:20'` for 200s) and is reused by the technical card.
5. **Type-name assumption:** the wire response type is consumed as `VideoEnrichmentStatusResponse` (z.infer export from Part A's schema module). If Part A named it differently, update the imports in Tasks 16/17/19 — signatures otherwise unchanged.
6. **`VideoReleaseDateSuggestion` renders its applied state from the live form value** (`useWatch` equality with the suggested value), not from the row's server status — the server row stays `pending` after a form-only apply by design; the 'Save to persist' hint keys off the same condition.
