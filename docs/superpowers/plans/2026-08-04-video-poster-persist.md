# Video Poster Candidates Persist at Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist all captured poster frame candidates to S3 + MongoDB at upload time, auto-apply the best frame as the live poster on the draft row, and let admins re-pick a frame later with an instant-persist click.

**Architecture:** Keep the existing browser-side frame capture. A new client fan-out uploads every candidate JPEG through the existing presigned path immediately after capture; the draft action stores `{url, atSeconds, score}[]` on the `Video` row (new Prisma composite type) with `posterUrl` set to the selected/best frame. The picker strip hydrates from stored URLs on edit visits, and clicking a thumb fires a new admin Server Action that validates DB membership and writes `posterUrl`.

**Tech Stack:** Next.js 16 App Router, React 19, RHF 7 + Zod 4, Prisma 6 + MongoDB (composite types), TanStack Query 5, S3 presigned PUTs, Vitest 4, Playwright.

**Spec:** `docs/auto-generated/2026-08-04-video-poster-persist-design.md` (approved). Read it before starting.

## Global Constraints

- Branch: `feat/video-poster-persist` in worktree `.claude/worktrees/feat-video-poster-persist` (already created off main `dd83bee2`). All paths below are relative to the worktree root. Never edit the main checkout.
- TDD: write the failing test first, watch it fail, then implement. Never mark a step done with failing tests.
- Every NEW source file starts with the 3-line MPL header from `HEADER.txt`.
- Commits: Conventional Commits `type(scope): <gitmoji> subject`, FULL header ≤ 50 chars (gitmoji counts as 2). No AI attribution, no `Co-authored-by`. Never `--no-verify`.
- Repo rules: arrow functions, named exports, destructured props, no `any`/`!`, path aliases (`@/lib/*`, `@/hooks/*`, …), ESLint `complexity` cap 10 — extract helpers up front. `describe`/`it`/`expect`/`vi` are Vitest globals (never imported). Server-only specs need `vi.mock('server-only', () => ({}))`.
- E2E DB isolation is a HARD constraint: read `e2e/AGENTS.md` + every file in `docs/lessons/e2e-playwright/` before Task 9. Only `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`.
- `pnpm exec prisma db push` is NOT run in this plan (it targets the dev DB from `.env`); the schema change is additive and pushed by the user after merge. `pnpm exec prisma generate` (no DB contact) IS required after the schema edit.
- Gate before every commit: the pre-commit hook runs lint-staged + `vitest --changed`. Before the final push: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- Before touching files under a directory, read its `AGENTS.md` (`src/AGENTS.md`, `src/app/AGENTS.md`, `src/lib/AGENTS.md`, `prisma/AGENTS.md`, `e2e/AGENTS.md`) and the matching `docs/lessons/` category (`prisma-mongo` for Task 1, `react-nextjs` for Tasks 5–7, `e2e-playwright` for Task 9).

---

### Task 1: Data model — Prisma composite type, domain type, wire strippers/schema

**Files:**

- Modify: `prisma/schema.prisma` (Video model at ~line 994)
- Modify: `src/lib/types/domain/video.ts`
- Modify: `src/lib/utils/to-public-video-row.ts`
- Modify: `src/lib/utils/to-public-video-row.spec.ts`
- Modify: `src/lib/validation/video-schema.ts`
- Modify: any spec whose `Video` literal now fails typecheck (mechanical `posterCandidates: []` additions)

**Interfaces:**

- Produces: domain `interface VideoPosterCandidate { url: string; atSeconds: number; score: number }`; `Video.posterCandidates: VideoPosterCandidate[]`; `CreateVideoData.posterCandidates?: VideoPosterCandidate[]` (and via `Partial`, `UpdateVideoData.posterCandidates`); `videoRowSchema` gains optional `posterCandidates`; public listing payloads strip the field, admin detail keeps it.

- [ ] **Step 1: Write the failing stripper tests**

In `src/lib/utils/to-public-video-row.spec.ts`, extend the existing full-`Video` fixture with `posterCandidates: [{ url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg', atSeconds: 3.7, score: 12.5 }]` and add:

```ts
it('strips posterCandidates from the public row', () => {
  expect(toPublicVideoRow(video)).not.toHaveProperty('posterCandidates');
});

it('keeps posterCandidates on the admin detail row', () => {
  expect(toAdminVideoDetailRow(video).posterCandidates).toEqual(video.posterCandidates);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/utils/to-public-video-row.spec.ts`
Expected: FAIL — TS error (`posterCandidates` not on `Video`) / property assertions fail.

- [ ] **Step 3: Prisma schema — composite type + field**

In `prisma/schema.prisma`, directly ABOVE `model Video {`:

```prisma
/// A captured, scored poster-frame candidate persisted at upload time.
type VideoPosterCandidate {
  url       String
  atSeconds Float
  score     Float
}
```

Inside `model Video`, after `posterUrl       String?`:

```prisma
  posterCandidates VideoPosterCandidate[] // Captured frame choices; posterUrl selects one
```

Then run: `pnpm exec prisma generate` (regenerates the client types; touches no DB).

- [ ] **Step 4: Domain type**

In `src/lib/types/domain/video.ts`, above the `Video` type:

```ts
/** A captured, scored poster-frame candidate persisted at upload time. */
export interface VideoPosterCandidate {
  /** CDN URL of the uploaded candidate JPEG. */
  url: string;
  /** Timestamp the frame was sampled at. */
  atSeconds: number;
  /** Client `scoreFrameQuality` result — higher is sharper. */
  score: number;
}
```

In `Video`, after `posterUrl: string | null;`:

```ts
  posterCandidates: VideoPosterCandidate[];
```

In `CreateVideoData`, after `posterUrl?: string | null;`:

```ts
  posterCandidates?: VideoPosterCandidate[];
```

(`UpdateVideoData = Partial<CreateVideoData>` picks it up automatically. The `AssertExact` drift guards in `video-repository.ts` now compile only with the field present — that is the point. `toPrismaCreate`/`toPrismaUpdate` spread plain data; Prisma's composite-list input accepts a plain array, so no repository change is needed.)

- [ ] **Step 5: Strip from public wire, keep on admin detail**

In `src/lib/utils/to-public-video-row.ts`: add `'posterCandidates'` to the `VideoListingOnlyInternalField` union (after `'updatedBy'`), and add `posterCandidates: _posterCandidates,` to the destructuring list in `toPublicVideoRow` (the exhaustive `Omit` makes typecheck force exactly this). `toAdminVideoDetailRow` spreads the rest — no change there.

- [ ] **Step 6: Wire schema for the admin detail client**

In `src/lib/validation/video-schema.ts`, after the `posterUrl: nullableString,` line in `videoRowSchema`:

```ts
  // Stored candidate frames — admin detail wire only; stripped from listings.
  posterCandidates: z
    .array(z.object({ url: z.string(), atSeconds: z.number(), score: z.number() }))
    .optional(),
```

- [ ] **Step 7: Fix the typecheck ripple**

Run: `pnpm run typecheck`
Every spec building a full `Video` literal now needs `posterCandidates: []`. Add exactly that to each flagged literal (mechanical; do not restructure fixtures).

- [ ] **Step 8: Verify green**

Run: `pnpm exec vitest run src/lib/utils/to-public-video-row.spec.ts && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ poster candidates data model"
```

---

### Task 2: Candidate validation schema + namespace guard

**Files:**

- Create: `src/lib/validation/video-poster-candidate-schema.ts`
- Create: `src/lib/validation/video-poster-candidate-schema.spec.ts`
- Modify: `src/lib/actions/video-action-helpers.ts`
- Modify: `src/lib/actions/video-action-helpers.spec.ts`
- Modify: `src/lib/validation/video-draft-schema.ts`
- Modify: `src/lib/validation/video-draft-schema.spec.ts` (exists next to the schema)

**Interfaces:**

- Consumes: `VideoPosterCandidate` from `@/lib/types/domain/video` (Task 1); `extractS3KeyFromUrl` from `@/lib/utils/s3-key-utils`; `VIDEO_KEY_PREFIX` from `@/lib/constants/video-uploads`.
- Produces: `videoPosterCandidateSchema`, `posterCandidatesSchema` (array, max 10); `areCandidatesForVideo(candidates: VideoPosterCandidate[], videoId: string): boolean`; `videoDraftSchema` gains optional `posterUrl` + `posterCandidates`.

- [ ] **Step 1: Write failing schema tests**

`src/lib/validation/video-poster-candidate-schema.spec.ts` (MPL header):

```ts
import {
  posterCandidatesSchema,
  videoPosterCandidateSchema,
} from './video-poster-candidate-schema';

const candidate = {
  url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
  atSeconds: 3.7,
  score: 12.5,
};

describe('videoPosterCandidateSchema', () => {
  it('accepts a valid candidate', () => {
    expect(videoPosterCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it('rejects a non-URL url', () => {
    expect(videoPosterCandidateSchema.safeParse({ ...candidate, url: 'not-a-url' }).success).toBe(
      false
    );
  });

  it('rejects a negative atSeconds', () => {
    expect(videoPosterCandidateSchema.safeParse({ ...candidate, atSeconds: -1 }).success).toBe(
      false
    );
  });
});

describe('posterCandidatesSchema', () => {
  it('rejects more than 10 candidates', () => {
    expect(
      posterCandidatesSchema.safeParse(Array.from({ length: 11 }, () => candidate)).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/validation/video-poster-candidate-schema.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the schema**

`src/lib/validation/video-poster-candidate-schema.ts` (MPL header):

```ts
import { z } from 'zod';

import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { isHttpUrl } from '@/lib/utils/is-http-url';

/** One stored poster-frame candidate as accepted from the client. */
export const videoPosterCandidateSchema = z.object({
  // Never bare z.string().url() — it admits javascript:/data: schemes; mirror
  // the isHttpUrl refinement pattern from bio-link-input-schema.
  url: z.string().max(2048).refine(isHttpUrl, { message: 'Must be an http(s) URL' }),
  atSeconds: z.number().min(0),
  score: z.number().min(0),
}) satisfies z.ZodType<VideoPosterCandidate>;

/** Candidate list cap — 5 captured today; headroom, never unbounded. */
export const posterCandidatesSchema = z.array(videoPosterCandidateSchema).max(10);
```

- [ ] **Step 4: Write failing guard tests**

In `src/lib/actions/video-action-helpers.spec.ts`, add:

```ts
describe('areCandidatesForVideo', () => {
  const forVideo = (id: string, n: number) => ({
    url: `https://cdn.example.com/media/videos/${id}/poster-candidate-${n}.jpg`,
    atSeconds: n,
    score: 1,
  });

  it('accepts candidates namespaced to the video', () => {
    expect(areCandidatesForVideo([forVideo('vid1', 1), forVideo('vid1', 2)], 'vid1')).toBe(true);
  });

  it('rejects a candidate namespaced to another video', () => {
    expect(areCandidatesForVideo([forVideo('vid1', 1), forVideo('vid2', 2)], 'vid1')).toBe(false);
  });

  it('rejects a candidate outside the video namespace', () => {
    const foreign = {
      url: 'https://cdn.example.com/media/releases/r1/a.jpg',
      atSeconds: 1,
      score: 1,
    };
    expect(areCandidatesForVideo([foreign], 'vid1')).toBe(false);
  });

  it('accepts an empty list', () => {
    expect(areCandidatesForVideo([], 'vid1')).toBe(true);
  });
});
```

- [ ] **Step 5: Run to verify failure** — `pnpm exec vitest run src/lib/actions/video-action-helpers.spec.ts` → FAIL.

- [ ] **Step 6: Implement the guard**

In `src/lib/actions/video-action-helpers.ts` (add `VideoPosterCandidate` to the existing type import from `@/lib/types/domain/video`), after `isPosterReplaced`:

```ts
/**
 * Whether EVERY candidate URL resolves to an S3 key inside this video's own
 * namespace (`media/videos/{videoId}/…`) — the write-path injection guard for
 * admin-supplied candidate lists.
 */
export const areCandidatesForVideo = (
  candidates: VideoPosterCandidate[],
  videoId: string
): boolean =>
  candidates.every((candidate) =>
    (extractS3KeyFromUrl(candidate.url) ?? '').startsWith(`${VIDEO_KEY_PREFIX}${videoId}/`)
  );
```

(Check `extractS3KeyFromUrl`'s actual return contract in `src/lib/utils/s3-key-utils.ts` — if it returns `string` and never `null`, drop the `?? ''`.)

- [ ] **Step 7: Draft schema fields + tests**

In `src/lib/validation/video-draft-schema.spec.ts` add a failing test:

```ts
it('accepts posterUrl and posterCandidates', () => {
  const parsed = videoDraftSchema.safeParse({
    ...validDraft, // reuse the file's existing valid fixture name
    posterUrl: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
    posterCandidates: [
      {
        url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
        atSeconds: 3.7,
        score: 12.5,
      },
    ],
  });
  expect(parsed.success).toBe(true);
});
```

Then in `src/lib/validation/video-draft-schema.ts`, after `artistDetails`:

```ts
  posterUrl: z.string().max(2048).refine(isHttpUrl, { message: 'Must be an http(s) URL' }).optional(),
  posterCandidates: posterCandidatesSchema.optional(),
```

(import `isHttpUrl` from `@/lib/utils/is-http-url` — never bare `z.string().url()`, which admits `javascript:`/`data:` schemes)

with `import { posterCandidatesSchema } from './video-poster-candidate-schema';`.

- [ ] **Step 8: Verify green** — `pnpm exec vitest run src/lib/validation/video-poster-candidate-schema.spec.ts src/lib/actions/video-action-helpers.spec.ts src/lib/validation/video-draft-schema.spec.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ candidate validation schemas"
```

---

### Task 3: Draft action persists poster fields

**Files:**

- Modify: `src/lib/actions/create-video-draft-action.ts`
- Modify: `src/lib/actions/create-video-draft-action.spec.ts`

**Interfaces:**

- Consumes: `videoDraftSchema` poster fields (Task 2), `areCandidatesForVideo` (Task 2), `CreateVideoData.posterCandidates` (Task 1).
- Produces: a draft row whose `posterCandidates` + `posterUrl` are populated when the client sends valid, self-namespaced values; invalid poster fields are DROPPED (draft still created) and logged — the draft is never blocked.

- [ ] **Step 1: Write failing action tests**

In `create-video-draft-action.spec.ts` (follow the file's existing mock arrangement for `VideoService`, `requireRole`, `confirmVideoUpload`), add — using the file's existing valid draft input fixture, spread with poster fields:

```ts
const candidate = (n: number) => ({
  url: `https://cdn.example.com/media/videos/${VALID_ID}/poster-candidate-${n}.jpg`,
  atSeconds: n + 2.7,
  score: 10 + n,
});

it('persists posterUrl and posterCandidates on the draft', async () => {
  const result = await createVideoDraftAction({
    ...validInput,
    posterUrl: candidate(1).url,
    posterCandidates: [candidate(1), candidate(2)],
  });
  expect(result.success).toBe(true);
  expect(createVideoMock).toHaveBeenCalledWith(
    expect.objectContaining({
      posterUrl: candidate(1).url,
      posterCandidates: [candidate(1), candidate(2)],
    })
  );
});

it('drops poster fields when a candidate is outside the video namespace', async () => {
  const foreign = {
    url: 'https://cdn.example.com/media/videos/other/poster-candidate-1.jpg',
    atSeconds: 3,
    score: 1,
  };
  const result = await createVideoDraftAction({
    ...validInput,
    posterUrl: foreign.url,
    posterCandidates: [foreign],
  });
  expect(result.success).toBe(true);
  const arg = createVideoMock.mock.calls.at(-1)?.[0];
  expect(arg).not.toHaveProperty('posterCandidates');
  expect(arg?.posterUrl).toBeUndefined();
});

it('drops a posterUrl that is not one of the candidates', async () => {
  const result = await createVideoDraftAction({
    ...validInput,
    posterUrl: candidate(3).url,
    posterCandidates: [candidate(1)],
  });
  expect(result.success).toBe(true);
  const arg = createVideoMock.mock.calls.at(-1)?.[0];
  expect(arg?.posterUrl).toBeUndefined();
  expect(arg?.posterCandidates).toEqual([candidate(1)]);
});
```

(`VALID_ID` = the spec's existing preGeneratedId constant; `createVideoMock` = its existing `VideoService.createVideo` mock. Match the file's real names.)

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/actions/create-video-draft-action.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

In `create-video-draft-action.ts`, import `areCandidatesForVideo` from `./video-action-helpers` and `VideoPosterCandidate` type. Add above `buildDraftCreateInput`:

```ts
/** Poster fields for the draft — validated to the video's own namespace, else dropped. */
interface DraftPosterInput {
  posterUrl?: string;
  posterCandidates?: VideoPosterCandidate[];
}

/**
 * Resolve the poster fields the draft may persist. Candidates must all live
 * under this video's own S3 namespace and `posterUrl` must be one of them;
 * anything else is dropped (never blocks the draft) and logged.
 */
const resolveDraftPosterInput = (data: VideoDraftInput): DraftPosterInput => {
  const candidates = data.posterCandidates ?? [];
  if (candidates.length === 0) return {};
  if (!areCandidatesForVideo(candidates, data.preGeneratedId)) {
    logger.warn('video_draft_poster_candidates_rejected', { videoId: data.preGeneratedId });
    return {};
  }
  const posterUrl = candidates.some((c) => c.url === data.posterUrl) ? data.posterUrl : undefined;
  return { posterCandidates: candidates, ...(posterUrl ? { posterUrl } : {}) };
};
```

In `buildDraftCreateInput`, spread it into the returned object (after `mimeType`):

```ts
  ...resolveDraftPosterInput(data),
```

- [ ] **Step 4: Verify green** — `pnpm exec vitest run src/lib/actions/create-video-draft-action.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ draft persists poster fields"
```

---

### Task 4: Select-poster service method, Server Action, mutation hook

**Files:**

- Modify: `src/lib/services/video-service.ts` + `src/lib/services/video-service.spec.ts`
- Create: `src/lib/actions/select-video-poster-action.ts`
- Create: `src/lib/actions/select-video-poster-action.spec.ts`
- Modify: `src/hooks/mutations/use-video-mutations.ts` (+ its spec if one exists — check for `use-video-mutations.spec`)

**Interfaces:**

- Consumes: `VideoRepository.findById/update`, `runAdminEntityAction` from `./run-admin-entity-action`, `invalidateVideoQueries` + `useEntityMutation` (existing in the hooks file), `OBJECT_ID_REGEX` from `@/lib/utils/validation/object-id`.
- Produces: `VideoService.selectVideoPoster(id: string, candidateUrl: string): Promise<ServiceResponse<Video>>`; `selectVideoPosterAction(videoId: string, candidateUrl: string): Promise<AdminActionResult>`; `useSelectVideoPosterMutation()` → `{ selectVideoPoster, selectVideoPosterAsync, isSelectingVideoPoster }` taking `{ videoId, candidateUrl }`.

- [ ] **Step 1: Write failing service tests**

In `video-service.spec.ts` (mirror the file's `publishVideo` describe block and repository mocks):

```ts
describe('selectVideoPoster', () => {
  const stored = {
    url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
    atSeconds: 3.7,
    score: 12,
  };

  it('sets posterUrl when the URL is a stored candidate', async () => {
    findByIdMock.mockResolvedValue({ ...videoFixture, posterCandidates: [stored] });
    updateMock.mockResolvedValue({ ...videoFixture, posterUrl: stored.url });
    const result = await VideoService.selectVideoPoster('vid1', stored.url);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith('vid1', { posterUrl: stored.url });
  });

  it('fails when the URL is not a stored candidate', async () => {
    findByIdMock.mockResolvedValue({ ...videoFixture, posterCandidates: [stored] });
    const result = await VideoService.selectVideoPoster(
      'vid1',
      'https://cdn.example.com/media/videos/vid1/other.jpg'
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('fails when the video is missing', async () => {
    findByIdMock.mockResolvedValue(null);
    const result = await VideoService.selectVideoPoster('vid1', stored.url);
    expect(result.success).toBe(false);
  });
});
```

(Adapt mock names to the spec file's real ones.)

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/services/video-service.spec.ts` → FAIL.

- [ ] **Step 3: Implement the service method**

In `video-service.ts`, after `publishVideo` (mirror its error mapping style):

```ts
  /**
   * Set the live poster to one of the video's STORED candidate frames. The
   * membership check is the injection guard: only a URL already persisted in
   * `posterCandidates` can become `posterUrl` through this path.
   */
  static async selectVideoPoster(id: string, candidateUrl: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.findById(id);
      if (!video) return { success: false, error: 'Video not found' };
      if (!video.posterCandidates.some((candidate) => candidate.url === candidateUrl)) {
        return { success: false, error: 'Poster is not one of this video’s candidates' };
      }
      const updated = await VideoRepository.update(id, { posterUrl: candidateUrl });
      return { success: true, data: updated };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to set the poster',
      });
    }
  }
```

- [ ] **Step 4: Verify service green** — `pnpm exec vitest run src/lib/services/video-service.spec.ts` → PASS.

- [ ] **Step 5: Write failing action tests**

`src/lib/actions/select-video-poster-action.spec.ts` — copy the arrangement of `publish-video-action.spec.ts` (it mocks `runAdminEntityAction` or the service + auth; follow whichever it does), asserting:

- invalid `videoId` (fails `OBJECT_ID_REGEX`) → `{ success: false }` without calling the service;
- invalid `candidateUrl` (not a URL / > 2048 chars) → `{ success: false }` without calling the service;
- valid input → delegates to `VideoService.selectVideoPoster(videoId, candidateUrl)` with event `'media.video.poster_selected'`.

- [ ] **Step 6: Run to verify failure** — `pnpm exec vitest run src/lib/actions/select-video-poster-action.spec.ts` → FAIL (module not found).

- [ ] **Step 7: Implement the action**

`src/lib/actions/select-video-poster-action.ts` (MPL header):

```ts
'use server';

import 'server-only';

import { z } from 'zod';

import { VideoService } from '@/lib/services/video-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

const candidateUrlSchema = z.string().max(2048).refine(isHttpUrl); // isHttpUrl from '@/lib/utils/is-http-url' — never bare .url()

/**
 * Server Action: instant-persist an admin's poster pick. Validates the shape
 * here; `VideoService.selectVideoPoster` enforces the stored-candidate
 * membership rule. Returns the plain result the mutation hook maps to a toast.
 */
export const selectVideoPosterAction = async (
  videoId: string,
  candidateUrl: string
): Promise<AdminActionResult> => {
  if (!candidateUrlSchema.safeParse(candidateUrl).success) {
    return { success: false, error: 'Invalid poster URL' };
  }
  return runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: (id) => VideoService.selectVideoPoster(id, candidateUrl),
    event: 'media.video.poster_selected',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to set the poster',
  });
};
```

(Read `run-admin-entity-action.ts` first: if `AdminActionResult`'s failure shape differs from `{ success: false, error }`, match it. Confirm `runAdminEntityAction` enforces BOTH the admin role (`requireRole('admin')` or equivalent — the spec requires this action be admin-gated) and the `OBJECT_ID_REGEX` id check; if either is missing there, add it here explicitly before `runAdminEntityAction` is called.)

- [ ] **Step 8: Mutation hook**

In `use-video-mutations.ts`, after `useDeleteVideoMutation` (same pattern):

```ts
/**
 * Mutation hook wrapping {@link selectVideoPosterAction} — the instant-persist
 * poster pick from the candidate strip. Invalidates the video caches on a
 * successful result so the detail and listings refetch the new poster.
 */
export const useSelectVideoPosterMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string; candidateUrl: string }
  >(
    ({ videoId, candidateUrl }) => selectVideoPosterAction(videoId, candidateUrl),
    invalidateVideoQueries
  );

  return {
    selectVideoPoster: mutate,
    selectVideoPosterAsync: mutateAsync,
    isSelectingVideoPoster: isPending,
  };
};
```

If `src/hooks/mutations/use-video-mutations.spec.ts` exists, add the same coverage its siblings have for the new hook.

- [ ] **Step 9: Verify green** — `pnpm exec vitest run src/lib/actions/select-video-poster-action.spec.ts src/lib/services/video-service.spec.ts` (+ the hooks spec if present) → PASS.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ select poster server action"
```

---

### Task 5: Client candidate-upload fan-out hook

**Files:**

- Create: `src/app/components/forms/videos/use-poster-candidate-uploads.ts`
- Create: `src/app/components/forms/videos/use-poster-candidate-uploads.spec.ts`

**Interfaces:**

- Consumes: `getPresignedUploadUrlsAction('videos', preGeneratedId, files)` from `@/lib/actions/presigned-upload-actions` (one call presigns ALL candidates; `data` aligns with the input order); `uploadFileToS3(file, presigned)` from `@/lib/utils/direct-upload`; `PosterCandidate` from `./video-metadata`; `VideoPosterCandidate` from `@/lib/types/domain/video`.
- Produces:

```ts
export interface UsePosterCandidateUploadsResult {
  /** Kick the parallel presign+PUT fan-out for a fresh candidate set. */
  startUploads: (candidates: PosterCandidate[]) => void;
  /** Index-aligned uploaded candidates (null = that frame's upload failed). Empty until settled. */
  alignedNow: (VideoPosterCandidate | null)[];
  /** Resolves once the in-flight fan-out settles (immediately-[] when none started). */
  getSettledAligned: () => Promise<(VideoPosterCandidate | null)[]>;
}
export const usePosterCandidateUploads = ({ preGeneratedId }: { preGeneratedId: string }): UsePosterCandidateUploadsResult
```

- [ ] **Step 1: Write failing hook tests**

`use-poster-candidate-uploads.spec.ts` (MPL header; `renderHook` + `act` from `@testing-library/react`, mock both modules with `vi.mock`):

```ts
const makeCandidate = (n: number) => ({
  blob: new Blob([`frame-${n}`], { type: 'image/jpeg' }),
  atSeconds: n + 2.7,
  score: 10 + n,
});
```

Cover:

1. `startUploads` presigns once with `('videos', 'vid1', [...])` where entry `i` is `{ fileName: 'poster-candidate-{i+1}.jpg', contentType: 'image/jpeg', fileSize: blob.size }`, then PUTs each file; `getSettledAligned()` resolves `[{url: cdnUrl1, atSeconds, score}, …]` preserving each input's `atSeconds`/`score`.
2. Skip-and-continue: PUT for index 1 resolves `{ success: false }` → settled array has `null` at index 1, real entries elsewhere; `alignedNow` matches after settle.
3. Presign action resolves `{ success: false }` → settled `[]`, no PUT calls.
4. `getSettledAligned()` before any `startUploads` resolves `[]`.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/forms/videos/use-poster-candidate-uploads.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
/* MPL header */
'use client';

import { useCallback, useRef, useState } from 'react';

import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

import type { PosterCandidate } from './video-metadata';

export interface UsePosterCandidateUploadsResult {
  startUploads: (candidates: PosterCandidate[]) => void;
  alignedNow: (VideoPosterCandidate | null)[];
  getSettledAligned: () => Promise<(VideoPosterCandidate | null)[]>;
}

/** Wrap one captured frame as the JPEG File the presigned PUT expects. */
const candidateFile = (candidate: PosterCandidate, index: number): File =>
  new File([candidate.blob], `poster-candidate-${index + 1}.jpg`, { type: 'image/jpeg' });

/** PUT one candidate; null on any failure (skip-and-continue contract). */
const uploadOne = async (
  candidate: PosterCandidate,
  index: number,
  presigned: { uploadUrl: string; s3Key: string; cdnUrl: string } | undefined
): Promise<VideoPosterCandidate | null> => {
  if (!presigned) return null;
  const result = await uploadFileToS3(candidateFile(candidate, index), presigned);
  return result.success
    ? { url: result.cdnUrl, atSeconds: candidate.atSeconds, score: candidate.score }
    : null;
};

/**
 * Fire-and-track fan-out that persists every captured poster candidate to S3
 * the moment capture finishes — one presign batch, parallel PUTs,
 * skip-and-continue per frame. Zero successes degrades to the legacy
 * Save-time blob upload; nothing here ever blocks the video upload.
 */
export const usePosterCandidateUploads = ({
  preGeneratedId,
}: {
  preGeneratedId: string;
}): UsePosterCandidateUploadsResult => {
  const [alignedNow, setAlignedNow] = useState<(VideoPosterCandidate | null)[]>([]);
  const settledRef = useRef<Promise<(VideoPosterCandidate | null)[]>>(Promise.resolve([]));

  const runUploads = useCallback(
    async (candidates: PosterCandidate[]): Promise<(VideoPosterCandidate | null)[]> => {
      const presigned = await getPresignedUploadUrlsAction(
        'videos',
        preGeneratedId,
        candidates.map((candidate, index) => ({
          fileName: `poster-candidate-${index + 1}.jpg`,
          contentType: 'image/jpeg',
          fileSize: candidate.blob.size,
        }))
      );
      if (!presigned.success || !presigned.data) return [];
      const targets = presigned.data;
      const aligned = await Promise.all(
        candidates.map((candidate, index) => uploadOne(candidate, index, targets.at(index)))
      );
      setAlignedNow(aligned);
      return aligned;
    },
    [preGeneratedId]
  );

  const startUploads = useCallback(
    (candidates: PosterCandidate[]): void => {
      setAlignedNow([]);
      // Never rejects: presign/PUT failures resolve to []/nulls above; a thrown
      // network error degrades to the legacy Save-time path.
      settledRef.current = runUploads(candidates).catch(() => []);
    },
    [runUploads]
  );

  const getSettledAligned = useCallback(() => settledRef.current, []);

  return { startUploads, alignedNow, getSettledAligned };
};
```

- [ ] **Step 4: Verify green** — `pnpm exec vitest run src/app/components/forms/videos/use-poster-candidate-uploads.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ candidate upload fan-out"
```

---

### Task 6: Draft input carries poster fields (`useVideoDraft`)

**Files:**

- Modify: `src/app/components/forms/videos/use-video-draft.ts`
- Modify: `src/app/components/forms/videos/use-video-draft.spec.ts`

**Interfaces:**

- Consumes: `createVideoDraftAction` (Task 3 accepts the fields), `VideoPosterCandidate` (Task 1).
- Produces:

```ts
export interface DraftPosterFields {
  posterUrl?: string;
  posterCandidates?: VideoPosterCandidate[];
}
```

`UseVideoDraftArgs` gains `getPosterFields: () => Promise<DraftPosterFields>`. On draft success with a `posterUrl`, the hook writes it into RHF (`shouldDirty: false`) so the Save-time fallback never re-uploads the blob.

- [ ] **Step 1: Write failing tests**

In `use-video-draft.spec.ts` (extend the existing arrangement — it mocks `createVideoDraftAction` and drives `handleUploadComplete`):

```ts
const posterFields = {
  posterUrl: 'https://cdn.example.com/media/videos/vid1/poster-candidate-2.jpg',
  posterCandidates: [
    {
      url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
      atSeconds: 3.7,
      score: 12,
    },
    {
      url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-2.jpg',
      atSeconds: 6.5,
      score: 15,
    },
  ],
};

it('awaits getPosterFields and sends the fields with the draft', async () => {
  /* handleUploadComplete → expect createVideoDraftAction called with expect.objectContaining(posterFields) */
});

it('writes the draft posterUrl into the form without dirtying', async () => {
  /* expect form.setValue('posterUrl', posterFields.posterUrl, { shouldDirty: false }) after success */
});

it('sends no poster fields when getPosterFields resolves empty', async () => {
  /* getPosterFields: async () => ({}) → payload has neither key; setValue NOT called with posterUrl */
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/forms/videos/use-video-draft.spec.ts` → FAIL (missing required arg / assertions).

- [ ] **Step 3: Implement**

In `use-video-draft.ts`:

```ts
/** Poster fields resolved from the candidate fan-out at draft time. */
export interface DraftPosterFields {
  posterUrl?: string;
  posterCandidates?: VideoPosterCandidate[];
}
```

- `UseVideoDraftArgs` gains `getPosterFields: () => Promise<DraftPosterFields>`.
- `buildDraftInput` gains a `posterFields: DraftPosterFields` parameter and spreads:

```ts
  ...(posterFields.posterCandidates?.length ? { posterCandidates: posterFields.posterCandidates } : {}),
  ...(posterFields.posterUrl ? { posterUrl: posterFields.posterUrl } : {}),
```

- In `handleUploadComplete`'s async closure, before the action call:

```ts
const posterFields = await getPosterFields();
const result = await createVideoDraftAction(
  buildDraftInput(form.getValues(), preGeneratedId, getArtistDetails(), posterFields)
);
if (result.success) {
  if (posterFields.posterUrl) {
    form.setValue('posterUrl', posterFields.posterUrl, { shouldDirty: false });
  }
  setDraftId(result.videoId);
  globalThis.history.replaceState(null, '', `/admin/videos/${result.videoId}`);
}
```

Add `getPosterFields` to the `useCallback` dependency array. Update the JSDoc: the draft now carries the captured poster set, so abandoning after upload leaves a poster-bearing draft.

- [ ] **Step 4: Fix the compile break in `video-form.tsx`**

`useVideoDraft` now requires `getPosterFields`. Pass a stub for now (Task 7 replaces it):

```ts
    getPosterFields: async () => ({}),
```

- [ ] **Step 5: Verify green** — `pnpm exec vitest run src/app/components/forms/videos/use-video-draft.spec.ts && pnpm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ draft sends poster fields"
```

---

### Task 7: Strip hydration + instant select (UI)

**Files:**

- Create: `src/app/components/forms/videos/use-video-poster-strip.ts`
- Create: `src/app/components/forms/videos/use-video-poster-strip.spec.tsx`
- Modify: `src/app/components/forms/videos/video-poster-section.tsx`
- Modify: `src/app/components/forms/videos/video-poster-section.spec.tsx`
- Modify: `src/app/components/forms/video-form.tsx`
- Modify: `src/app/components/forms/video-form.spec.tsx` (only if assertions break; behavior is preserved for fresh capture)

**Interfaces:**

- Consumes: `usePosterCandidateUploads` (Task 5), `useSelectVideoPosterMutation` (Task 4), `DraftPosterFields` (Task 6), `VideoRow.posterCandidates` (Task 1), `PosterCandidate`/`bestPosterCandidateIndex` from `./video-metadata`.
- Produces:

```ts
/** One strip thumb: a fresh captured frame (blob) or a stored candidate (url). */
export type StripCandidate = PosterCandidate | VideoPosterCandidate;

export interface UseVideoPosterStripArgs {
  form: UseFormReturn<VideoFormData>;
  video: VideoRow | null | undefined;
  isPersisted: boolean;
  effectiveVideoId: string | undefined;
  preGeneratedId: string;
}
export interface UseVideoPosterStripResult {
  /** Wire to useVideoUpload's onPosterCandidates. */
  handlePosterCandidates: (candidates: PosterCandidate[]) => void;
  /** Thumbs for the section — fresh blobs this session, else stored candidates. */
  stripCandidates: StripCandidate[];
  /** Highlighted index; -1 = none (e.g. a manual poster is live). */
  selectedIndex: number;
  /** Click handler — local pre-persist, instant server persist after. */
  handleSelectCandidate: (index: number) => void;
  /** Selected fresh blob for the legacy Save-time fallback (null when stored/hydrated). */
  selectedPosterBlob: Blob | null;
  /** Poster fields for the draft payload (Task 6's getPosterFields). */
  getPosterDraftFields: () => Promise<DraftPosterFields>;
}
export const useVideoPosterStrip = (args: UseVideoPosterStripArgs): UseVideoPosterStripResult
```

`VideoPosterSection` prop `candidates` retypes to `StripCandidate[]`; everything else about its props is unchanged.

**Behavior rules (from the spec):**

- Fresh capture this session → strip shows blobs; selection is local index state; strip hidden while `uploadedPosterUrl !== null` (unchanged #612 behavior in-session).
- No fresh capture and `video.posterCandidates.length ≥ 2` → strip shows stored thumbs on the edit page (NEW); highlight = index whose `url === form posterUrl` (may be -1); a manual poster no longer permanently hides the strip on revisit.
- Click routing: always update local index for fresh mode; when `isPersisted` and the clicked frame has an uploaded URL (fresh: `alignedNow[index]?.url`; stored: `candidate.url`), optimistically `setValue('posterUrl', url, { shouldDirty: false })`, call `selectVideoPosterAsync({ videoId: effectiveVideoId, candidateUrl: url })`, revert the previous value + `toast.error('Could not set the poster — try again.')` on failure, `toast.success('Poster updated.')` on success. Not persisted yet → local only (draft creation snapshots the selection via `getPosterDraftFields`).
- `getPosterDraftFields`: `await getSettledAligned()`; `posterCandidates` = non-null entries; `posterUrl` = the entry aligned with the currently selected index (may be absent when that frame's upload failed).

- [ ] **Step 1: Write failing hook tests** (`use-video-poster-strip.spec.tsx`; mock `use-poster-candidate-uploads`, `use-video-mutations`, `sonner`; drive with `renderHook` around a real `useForm` — see `use-video-draft.spec` for the pattern):

1. Fresh capture: `handlePosterCandidates(five)` → `stripCandidates` are the blobs, `selectedIndex` = `bestPosterCandidateIndex`, `startUploads` called with the candidates.
2. Fresh click pre-persist (`isPersisted: false`) → index changes, mutation NOT called.
3. Fresh click post-persist with aligned URL → optimistic `posterUrl` setValue, mutation called with `{ videoId, candidateUrl }`; mock failure → posterUrl reverted + error toast.
4. Stored mode: no capture, `video.posterCandidates` = 3 entries, form `posterUrl` = entry 1's url → `stripCandidates` are the stored entries, `selectedIndex === 1`; form `posterUrl` set to a manual (non-candidate) URL → `selectedIndex === -1`.
5. Stored click → optimistic setValue + mutation; success toast on success.
6. `getPosterDraftFields`: aligned `[c1, null, c3]`, selected index 0 → `{ posterUrl: c1.url, posterCandidates: [c1, c3] }`; selected index 1 (failed frame) → no `posterUrl`, both survivors listed.

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/app/components/forms/videos/use-video-poster-strip.spec.tsx` → FAIL.

- [ ] **Step 3: Implement `use-video-poster-strip.ts`**

Structure (keep each function under the complexity cap — extract `resolveStoredSelectedIndex` and `persistPick` helpers):

```ts
/* MPL header */
'use client';
// imports per the Interfaces block above; useWatch for posterUrl

const resolveStoredSelectedIndex = (
  stored: VideoPosterCandidate[],
  posterUrl: string | undefined
): number => stored.findIndex((candidate) => candidate.url === posterUrl);

export const useVideoPosterStrip = ({
  form,
  video,
  isPersisted,
  effectiveVideoId,
  preGeneratedId,
}: UseVideoPosterStripArgs): UseVideoPosterStripResult => {
  const [freshCandidates, setFreshCandidates] = useState<PosterCandidate[]>([]);
  const [freshSelectedIndex, setFreshSelectedIndex] = useState(0);
  const uploads = usePosterCandidateUploads({ preGeneratedId });
  const { selectVideoPosterAsync } = useSelectVideoPosterMutation();
  const watchedPosterUrl = useWatch({ control: form.control, name: 'posterUrl' });

  const isFreshMode = freshCandidates.length > 0;
  const stored = video?.posterCandidates ?? [];
  const stripCandidates: StripCandidate[] = isFreshMode ? freshCandidates : stored;
  const selectedIndex = isFreshMode
    ? freshSelectedIndex
    : resolveStoredSelectedIndex(stored, watchedPosterUrl || undefined);

  const handlePosterCandidates = useCallback(
    (candidates: PosterCandidate[]): void => {
      setFreshCandidates(candidates);
      setFreshSelectedIndex(bestPosterCandidateIndex(candidates));
      uploads.startUploads(candidates);
    },
    [uploads]
  );

  const persistPick = useCallback(
    async (candidateUrl: string): Promise<void> => {
      if (!effectiveVideoId) return;
      const previous = form.getValues('posterUrl');
      form.setValue('posterUrl', candidateUrl, { shouldDirty: false });
      const result = await selectVideoPosterAsync({ videoId: effectiveVideoId, candidateUrl });
      if (result.success) {
        toast.success('Poster updated.');
      } else {
        form.setValue('posterUrl', previous ?? '', { shouldDirty: false });
        toast.error('Could not set the poster — try again.');
      }
    },
    [effectiveVideoId, form, selectVideoPosterAsync]
  );

  const handleSelectCandidate = useCallback(
    (index: number): void => {
      if (isFreshMode) setFreshSelectedIndex(index);
      const url = isFreshMode ? uploads.alignedNow.at(index)?.url : stored.at(index)?.url;
      if (isPersisted && url) void persistPick(url);
    },
    [isFreshMode, uploads.alignedNow, stored, isPersisted, persistPick]
  );

  const getPosterDraftFields = useCallback(async (): Promise<DraftPosterFields> => {
    const aligned = await uploads.getSettledAligned();
    const survivors = aligned.filter((entry): entry is VideoPosterCandidate => entry !== null);
    if (survivors.length === 0) return {};
    const selected = aligned.at(freshSelectedIndex)?.url;
    return { posterCandidates: survivors, ...(selected ? { posterUrl: selected } : {}) };
  }, [uploads, freshSelectedIndex]);

  const selectedPosterBlob = isFreshMode
    ? (freshCandidates.at(freshSelectedIndex)?.blob ?? null)
    : null;

  return {
    handlePosterCandidates,
    stripCandidates,
    selectedIndex,
    handleSelectCandidate,
    selectedPosterBlob,
    getPosterDraftFields,
  };
};
```

(The `stored` array identity comes from the TanStack Query result — stable per fetch; fine for the hooks above. If the linter flags dependency arrays, hoist `stored` into `useMemo` on `video`.)

- [ ] **Step 4: Verify hook green** — `pnpm exec vitest run src/app/components/forms/videos/use-video-poster-strip.spec.tsx` → PASS.

- [ ] **Step 5: Write failing section tests**

In `video-poster-section.spec.tsx` add:

1. Stored candidates (`[{url, atSeconds, score} × 3]`, no blobs) render 3 radio items with `src` = the CDN URLs and NO object-URL creation (`URL.createObjectURL` not called).
2. `selectedIndex={-1}` → no radio checked.
3. Stored strip renders even when `uploadedPosterUrl` is null and `existingPosterUrl` set (revisit case).
4. Fresh candidates + `uploadedPosterUrl` set → strip hidden (unchanged in-session manual-override behavior).

- [ ] **Step 6: Run to verify failure** — `pnpm exec vitest run src/app/components/forms/videos/video-poster-section.spec.tsx` → FAIL.

- [ ] **Step 7: Implement section changes**

In `video-poster-section.tsx`:

- Prop type: `candidates: StripCandidate[]` (import `StripCandidate` from `./use-video-poster-strip`; keep `PosterCandidate` import for `posterCandidateToFile`).
- Thumb URL effect — create object URLs only for blob arms:

```ts
const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
useEffect(() => {
  if (!candidates.length) {
    setCandidateUrls([]);
    return;
  }
  const created: string[] = [];
  const urls = candidates.map((candidate) => {
    if ('url' in candidate) return candidate.url;
    const objectUrl = URL.createObjectURL(candidate.blob);
    created.push(objectUrl);
    return objectUrl;
  });
  setCandidateUrls(urls);
  return () => created.forEach((url) => URL.revokeObjectURL(url));
}, [candidates]);
```

- Visibility: `const hasFreshCapture = candidates.some((candidate) => 'blob' in candidate);` and `const showStrip = candidates.length > 1 && (!hasFreshCapture || uploadedPosterUrl === null);`
- `selectedCandidateUrl` must tolerate `-1`: `const selectedCandidateUrl = selectedIndex >= 0 ? candidateUrls.at(selectedIndex) : undefined;`
- `PosterCandidateStrip`: key by `candidate.atSeconds` (both arms have it); `value={String(selectedIndex)}` already matches nothing at `-1`. Update the two JSDoc blocks: the strip now also renders stored candidates on edit visits and clicking persists instantly once a row exists.

- [ ] **Step 8: Verify section green** — `pnpm exec vitest run src/app/components/forms/videos/video-poster-section.spec.tsx` → PASS.

- [ ] **Step 9: Wire `VideoForm`**

In `video-form.tsx`:

- Delete the `posterCandidates`/`selectedCandidateIndex` `useState` pair, `handlePosterCandidates`, and the module-level `selectedCandidateBlob` helper (its logic moved into the strip hook — remove its tests' subject too if they exist as standalone unit tests; the behavior is covered by the strip hook spec).
- Add, after `resolvePersistedRow`:

```ts
const posterStrip = useVideoPosterStrip({
  form,
  video,
  isPersisted,
  effectiveVideoId,
  preGeneratedId,
});
```

(Order note: `useVideoDraft` needs `posterStrip.getPosterDraftFields`, and `resolvePersistedRow` needs `draftId` — so declare `posterStrip` AFTER the draft hook but pass `getPosterFields` via a ref-stable wrapper, OR compute `isPersisted` from `videoId/isEditMode/draftId` inline. Simplest working order: keep `useVideoDraft` where it is and hand it `getPosterFields: () => posterStripRef.current.getPosterDraftFields()` — no. Cleanest: declare `posterStrip` FIRST with `isPersisted`/`effectiveVideoId` computed from a `draftId` state the form already owns — `useVideoDraft` returns `draftId`, creating a cycle. Break it the way the codebase already breaks hook cycles (see the draft/upload comment at line 318): `useVideoPosterStrip` takes `isPersisted`/`effectiveVideoId` as MUTABLE refs is over-engineering — instead have `useVideoDraft` accept `getPosterFields` and `VideoForm` define it as a stable callback that closes over a ref updated each render:

```ts
const getPosterDraftFieldsRef = useRef<() => Promise<DraftPosterFields>>(async () => ({}));
const { draftId, handleUploadComplete } = useVideoDraft({
  form,
  preGeneratedId,
  isEditMode,
  getArtistDetails: buildArtistDetails,
  getPosterFields: () => getPosterDraftFieldsRef.current(),
});
const { isPersisted, effectiveVideoId } = resolvePersistedRow(videoId, isEditMode, draftId);
const posterStrip = useVideoPosterStrip({
  form,
  video,
  isPersisted,
  effectiveVideoId,
  preGeneratedId,
});
getPosterDraftFieldsRef.current = posterStrip.getPosterDraftFields;
```

This matches the existing "draft hook must sit before the upload hook" wiring comment style — document it the same way.)

- `useVideoUpload` gets `onPosterCandidates: posterStrip.handlePosterCandidates`.
- `selectedPosterBlob` for `resolveSubmitPosterUrl` becomes `posterStrip.selectedPosterBlob`.
- `VideoPosterSection` props: `candidates={posterStrip.stripCandidates}`, `selectedIndex={posterStrip.selectedIndex}`, `onSelectCandidate={posterStrip.handleSelectCandidate}` (rest unchanged).

- [ ] **Step 10: Full form spec pass**

Run: `pnpm exec vitest run src/app/components/forms/video-form.spec.tsx src/app/components/forms/videos`
Expected: PASS. Fix any assertion that referenced the removed `VideoForm` internals by asserting through the new props instead — do not weaken behavior assertions.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ poster strip hydrate+select"
```

---

### Task 8: Replace-flow candidates + S3 cleanup guards

**Files:**

- Modify: `src/lib/validation/create-video-schema.ts`
- Modify: `src/lib/actions/video-action-helpers.ts` + `.spec.ts`
- Modify: `src/lib/actions/update-video-action.ts` + `.spec.ts`
- Modify: `src/lib/actions/create-video-action.ts` + `.spec.ts`
- Modify: `src/lib/actions/delete-video-action.ts` + `.spec.ts`
- Modify: `src/app/components/forms/video-form.tsx` (submit merges uploaded candidates)

**Interfaces:**

- Consumes: `posterCandidatesSchema` (Task 2), `areCandidatesForVideo` (Task 2), `posterStrip.getPosterDraftFields` (Task 7), `objectToFormData` (JSON-stringifies arrays; `getActionState` parses `[`-prefixed values back).
- Produces: `VideoFormData.posterCandidates?: VideoPosterCandidate[]`; `'posterCandidates'` in `VIDEO_PERMITTED_FIELD_NAMES`; create action persists guarded candidates; update action persists them ONLY when `s3Key` is replaced; `deleteReplacedVideoAssets` skips candidate-switch deletes and frees replaced candidate sets; video hard-delete frees candidate objects.

- [ ] **Step 1: Form schema + permitted fields**

In `create-video-schema.ts` after `posterUrl`:

```ts
  posterCandidates: posterCandidatesSchema.optional(),
```

(import from `./video-poster-candidate-schema`). In `video-action-helpers.ts` add `'posterCandidates'` to `VIDEO_PERMITTED_FIELD_NAMES` (after `'posterUrl'`).

- [ ] **Step 2: Write failing cleanup-guard tests**

In `video-action-helpers.spec.ts` (extend the existing `deleteReplacedVideoAssets` block; its `current` fixture now has `posterCandidates`):

```ts
const candidateUrl = (n: number) =>
  `https://cdn.example.com/media/videos/vid1/poster-candidate-${n}.jpg`;
const currentWithCandidates = {
  ...currentVideo,
  posterUrl: candidateUrl(1),
  posterCandidates: [1, 2].map((n) => ({ url: candidateUrl(n), atSeconds: n, score: n })),
};
```

1. Candidate switch (`data.posterUrl = candidateUrl(2)`, no s3Key replace) → `deleteS3Object` NOT called (old poster is a stored candidate).
2. Manual poster replacing a candidate poster (`data.posterUrl = 'https://cdn.example.com/media/videos/vid1/manual.jpg'`) → NOT called for the old candidate either (still in the list).
3. Manual poster replaced by another manual poster (current.posterUrl NOT in candidates) → old key deleted (existing behavior preserved).
4. File replace with new candidates (`s3KeyReplaced: true`, `data.posterCandidates` = new set) → old video key AND BOTH old candidate keys deleted.
5. File replace WITHOUT new candidates (`data.posterCandidates` undefined) → old candidates untouched (only the video key).

- [ ] **Step 3: Run to verify failure** — `pnpm exec vitest run src/lib/actions/video-action-helpers.spec.ts` → FAIL.

- [ ] **Step 4: Implement cleanup changes**

Rewrite `deleteReplacedVideoAssets` in `video-action-helpers.ts`:

```ts
/** Whether `url` is one of the video's stored candidate frames. */
const isStoredCandidateUrl = (current: Video, url: string | null): boolean =>
  url !== null && current.posterCandidates.some((candidate) => candidate.url === url);

/** Old candidate keys freed when a file replace ships a fresh candidate set. */
const replacedCandidateKeys = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): string[] =>
  s3KeyReplaced && data.posterCandidates !== undefined
    ? current.posterCandidates
        .map((candidate) => extractS3KeyFromUrl(candidate.url))
        .filter(isVideoNamespacedKey)
    : [];

/**
 * Best-effort, fire-and-forget cleanup of S3 objects a successful update
 * orphaned: the old video key (file replaced), the old poster key (poster
 * replaced — unless it is a stored candidate, which must survive a
 * candidate-to-candidate switch), and the old candidate set (file replaced
 * with a fresh capture). Failures are swallowed by {@link deleteS3Object}.
 */
export const deleteReplacedVideoAssets = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): void => {
  const keysToDelete: string[] = [];

  if (s3KeyReplaced) {
    keysToDelete.push(current.s3Key);
  }
  keysToDelete.push(...replacedCandidateKeys(current, data, s3KeyReplaced));
  if (
    isPosterReplaced(current, data) &&
    current.posterUrl &&
    !isStoredCandidateUrl(current, current.posterUrl)
  ) {
    const oldPosterKey = extractS3KeyFromUrl(current.posterUrl);
    if (isVideoNamespacedKey(oldPosterKey) && !keysToDelete.includes(oldPosterKey)) {
      keysToDelete.push(oldPosterKey);
    }
  }
  if (keysToDelete.length === 0) return;

  Promise.allSettled(keysToDelete.map((key) => deleteS3Object(key))).catch(() => {
    // Silently ignore — S3 cleanup is best-effort.
  });
};
```

(Case 4 covers a candidate-poster on file replace via `replacedCandidateKeys`; the `!isStoredCandidateUrl` branch handles the manual-poster path.)

- [ ] **Step 5: Write failing create/update action tests**

- `create-video-action.spec.ts`: valid `posterCandidates` (namespaced to the preGeneratedId) reach `VideoService.createVideo` in the payload; foreign-namespace candidates are dropped (payload lacks the key) while the create still succeeds.
- `update-video-action.spec.ts`: candidates + a NEW `s3Key` → `VideoService.updateVideo` payload contains them; candidates with the UNCHANGED `s3Key` → payload does NOT contain `posterCandidates`.

- [ ] **Step 6: Run to verify failure** — `pnpm exec vitest run src/lib/actions/create-video-action.spec.ts src/lib/actions/update-video-action.spec.ts` → FAIL.

- [ ] **Step 7: Implement action changes**

In `video-action-helpers.ts` add one shared resolver:

```ts
/**
 * Candidate list an action may persist: present, namespaced to THIS video, and
 * — for updates — only alongside an actual file replace (`s3KeyReplaced`).
 * Anything else resolves to `undefined` (field omitted; never blocks the save).
 */
export const resolvePersistableCandidates = (
  data: VideoFormData,
  videoId: string | undefined,
  s3KeyReplaced: boolean
): VideoPosterCandidate[] | undefined =>
  s3KeyReplaced &&
  videoId !== undefined &&
  data.posterCandidates !== undefined &&
  data.posterCandidates.length > 0 &&
  areCandidatesForVideo(data.posterCandidates, videoId)
    ? data.posterCandidates
    : undefined;
```

- `buildVideoCreateInput`: add parameter-free change — after `posterUrl` line add `...(candidates !== undefined ? { posterCandidates: candidates } : {})` by giving it a fourth parameter `candidates: VideoPosterCandidate[] | undefined`; create action passes `resolvePersistableCandidates(parsed.data, preGeneratedId, true)` (a create IS a fresh file — `s3KeyReplaced` true by definition).
- `update-video-action.ts` `runVideoUpdate`: build the input, then:

```ts
const candidates = resolvePersistableCandidates(data, videoId, s3KeyReplaced);
const response = await VideoService.updateVideo(videoId, {
  ...buildVideoUpdateInput(data, userId),
  ...(candidates !== undefined ? { posterCandidates: candidates } : {}),
});
```

(Adapt `buildVideoCreateInput` call sites/specs to the new parameter.)

- [ ] **Step 8: Delete-action candidate cleanup**

Read `delete-video-action.ts`; it already best-effort deletes the video `s3Key` + the poster key from `posterUrl`. Write a failing test: a video with 2 stored candidates → `deleteS3Object` called for BOTH candidate keys (plus the existing keys, deduplicated — `posterUrl` may BE a candidate). Implement by mapping `video.posterCandidates` through `extractS3KeyFromUrl` + `isVideoNamespacedKey` into the existing keys-to-delete collection, deduplicating with a `Set`.

- [ ] **Step 9: Submit path merges candidates AND the picked posterUrl**

CORRECTION (final-review Critical, spec §7): this step originally merged only
`posterCandidates`, dropping §7's requirement that a file replace also carries
the new frame's `posterUrl` — which left the live poster pointing at a deleted
old-candidate object. The submitted posterUrl must be
`posterFields.posterUrl ?? resolvedPoster.posterUrl`, and
`replacedCandidateKeys` must spare the key an unchanged `posterUrl` still
references. Landed in `fix(video): 🐛 replace keeps picked poster`.

In `video-form.tsx` `onValidSubmit`, before `submitVideo` — the fresh capture's surviving uploads ride every create/update submit (the server drops them unless the file is new):

```ts
      const posterFields = await posterStrip.getPosterDraftFields();
      return submitVideo(
        {
          ...shaped,
          posterUrl: resolvedPoster.posterUrl,
          ...(posterFields.posterCandidates ? { posterCandidates: posterFields.posterCandidates } : {}),
        },
        ...
```

(Add `posterStrip` to the callback deps. `getSettledAligned` resolves `[]` when no capture happened, so edit saves without a new file send nothing.)

- [ ] **Step 10: Verify green** — `pnpm exec vitest run src/lib/actions src/app/components/forms/video-form.spec.tsx` → PASS.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(video): ✨ replace+cleanup candidates"
```

---

### Task 9: Seed candidates + E2E stored-pick spec

**PRECONDITION:** read `e2e/AGENTS.md` and EVERY file in `docs/lessons/e2e-playwright/` first. E2E runs ONLY against `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (`pnpm run e2e:docker:up`).

**Files:**

- Modify: `prisma/seed.ts`
- Create: `e2e/tests/admin-video-poster-select.spec.ts`
- Reference: `e2e/helpers/` (reuse the existing DB-access helper pattern — `deleteVideoCascade`'s file shows the connection recipe)

**Interfaces:**

- Consumes: seeded video `'E2E Video Golf'` (published INFORMATIONAL — no enrichment panel noise); the strip's `radiogroup` accessible name `'Captured poster frames'`; thumb labels `Frame at {atSeconds.toFixed(1)}s`; toast copy `'Poster updated.'` (Task 7).

- [ ] **Step 1: Seed three stored candidates onto Golf**

CORRECTION (found in execution): the E2E DB is seeded by `e2e/helpers/seed-test-db.ts` (via `e2e/global-setup.ts`), NOT `prisma/seed.ts` (dev DB only). The two files mirror the same rows — edit BOTH identically. In each seed's video-create data (after `posterUrl: null,`):

```ts
          // Stored poster candidates for the E2E poster-select spec (Golf only).
          ...(video.title === 'E2E Video Golf'
            ? {
                posterCandidates: [3.7, 6.5, 9.3].map((atSeconds, index) => ({
                  url: `https://cdn.e2e.invalid/media/videos/e2e/${slug}/poster-candidate-${index + 1}.jpg`,
                  atSeconds,
                  score: 10 + index,
                })),
              }
            : {}),
```

Per the `seed-changes-ripple-to-count-pins` lesson: this adds NO rows and changes no counts — but grep `e2e/tests` for `'E2E Video Golf'` and for poster assertions before proceeding; if another spec asserts Golf's poster state, pick a different seeded video and update this task accordingly.

- [ ] **Step 2: Write the E2E spec**

`e2e/tests/admin-video-poster-select.spec.ts` (MPL header; reuse the `adminPage` fixture and the navigation pattern from `admin-videos-list.spec.ts` / `admin-video-form.spec.ts` — copy their edit-page entry steps exactly):

```ts
test.describe('Admin video poster select — stored candidates', () => {
  test('strip hydrates from stored candidates and a click persists', async ({ adminPage }) => {
    // Navigate: /admin/videos → search 'E2E Video Golf' → open its edit page
    // (copy the exact row-open steps from admin-videos-list.spec.ts).

    const strip = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('radio')).toHaveCount(3);

    // posterUrl is null in seed → nothing checked yet.
    await expect(strip.getByRole('radio', { checked: true })).toHaveCount(0);

    await strip.getByRole('radio', { name: 'Frame at 6.5s' }).click();
    await expect(adminPage.getByText('Poster updated.')).toBeVisible();

    await adminPage.reload();
    await expect(
      adminPage
        .getByRole('radiogroup', { name: 'Captured poster frames' })
        .getByRole('radio', { name: 'Frame at 6.5s' })
    ).toBeChecked();
  });
});
```

Add a `finally`-style cleanup resetting Golf's `posterUrl` to `null` via the e2e helpers' Prisma recipe (mirror `deleteVideoCascade`'s connection handling), so repeated runs and neighboring specs see the seeded state.

- [ ] **Step 3: Run the new spec + neighbors locally**

```bash
pnpm run e2e:docker:up
pnpm run test:e2e -- admin-video-poster-select admin-video-form admin-video-draft-upload admin-videos-list admin-dashboard
```

Expected: all green. (The draft-upload keystone stays inert for candidates by construction — garbage bytes capture `[]`.) Per the lessons, also run any count-pinning spec the grep in Step 1 surfaced.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(video): ✅ e2e stored poster select"
```

---

### Task 10: Full gates + wrap-up

- [ ] **Step 1: Full gate run**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
```

Expected: all pass; `pnpm run test:coverage:check` must not regress `COVERAGE_METRICS.md`. Fix anything that fails before proceeding.

- [ ] **Step 2: Re-read the spec against the diff**

`docs/auto-generated/2026-08-04-video-poster-persist-design.md` §§1–11 — confirm each section maps to landed code (checklist in the PR description). Confirm no JSDoc near edited lines went stale (repo rule).

- [ ] **Step 3: Commit any residue, then hand off**

Follow superpowers:finishing-a-development-branch. PR notes must include the user-ops line: **after merge+deploy, run `pnpm exec prisma db push`** (additive `posterCandidates` composite type), and that pre-feature videos simply render no strip.

## Post-implementation verification (manual smoke, after deploy)

1. Upload a real video → draft appears; DB row has 5 `posterCandidates` + `posterUrl` = best frame before Save is ever clicked.
2. Leave the page without saving → revisit: poster present, strip shows 5 frames, current one highlighted.
3. Click another frame → 'Poster updated.' toast → reload → choice stuck.
4. Replace the video file on an existing video → new candidates replace the old; old candidate objects deleted from S3.
