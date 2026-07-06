# Bio Image Volume (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get ~3× more vision-verified photos into the Lambda output (raise the vision cap to 180, env-tunable) and instrument the web re-host stage so the 52→10 drop can be measured before it is fixed.

**Architecture:** Two independent changes. (1) In the bio-generator Lambda, the scraped-candidate cap becomes a code-default (180) function that an optional `VISION_CANDIDATE_LIMIT` env var can override — every extra candidate still passes the same fail-closed Gemini face-vision gate, so precision is unchanged. (2) In the web app, `BioImageService.rehostImages` emits one structured summary per generation counting each drop reason, so the next Ceschi regen reveals the real 52→10 split. The web _fix_ (Phase 2b) is a separate, measurement-gated plan.

**Tech Stack:** TypeScript, Node 24, bio-generator Lambda (own pnpm project + Vitest + `tsc`), Next.js web app (Vitest), Winston logger (`loggers.media`).

## Global Constraints

- TDD: write the failing test first, watch it fail, then implement. Copy the exact code from each step.
- No `any`, no non-null `!`, arrow functions over `function`, named exports, no `eslint-disable` / `@ts-*` suppressions.
- The vision-limit **default ships in code (180)**; `VISION_CANDIDATE_LIMIT` is an optional per-deploy override. Do **not** pin it in `template.yaml` — a CFN/env-pinned config previously drifted prod (the removed `GeminiModel` parameter). No template change in this plan.
- Do not loosen quality floors (`MIN_IMAGE_DIMENSION`, `MIN_SHARPNESS_VARIANCE`, `NEAR_DUPLICATE_MAX_DISTANCE`).
- bio-generator is a **separate pnpm project**: gate it with `cd bio-generator && pnpm run test:run` and `pnpm exec tsc --noEmit`. The root Vitest excludes `bio-generator/**`. Root `pnpm run lint` (`eslint .`) covers `bio-generator/src`.
- Web gate: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- Commits: Conventional Commits `type(scope): <gitmoji> subject`, subject ≤50 chars, body lines ≤72, no AI-attribution / Co-authored-by lines. Never bypass hooks.

---

### Task 1: Env-overridable vision candidate limit (Lambda, 60 → 180)

**Files:**

- Modify: `bio-generator/src/handler.ts` (replace `MAX_VISION_CANDIDATES` const at ~line 82; update its use in `applyVerifiedScrapedImages` at ~line 480)
- Test: `bio-generator/src/handler.spec.ts` (import at line 5-10; existing cap test at ~line 824)

**Interfaces:**

- Produces: `DEFAULT_VISION_CANDIDATE_LIMIT: number` (= 180) and `visionCandidateLimit(): number` — exported from `handler.ts`, replacing the removed `export const MAX_VISION_CANDIDATES`.

- [ ] **Step 1: Write the failing tests for `visionCandidateLimit()`**

In `bio-generator/src/handler.spec.ts`, update the import to drop `MAX_VISION_CANDIDATES` and add the two new symbols:

```ts
import {
  DEFAULT_VISION_CANDIDATE_LIMIT,
  lambdaHandler,
  MAX_FOLLOWED_LINKS,
  runBioGeneration,
  runLambda,
  visionCandidateLimit,
} from './handler.js';
```

Add a new describe block (place it after the `runBioGeneration` describe, before `describe('followKnownLinksForImages'`):

```ts
describe('visionCandidateLimit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to 180 when VISION_CANDIDATE_LIMIT is unset or empty', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '');
    expect(visionCandidateLimit()).toBe(180);
    expect(DEFAULT_VISION_CANDIDATE_LIMIT).toBe(180);
  });

  it('uses VISION_CANDIDATE_LIMIT when it is a positive integer', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '250');
    expect(visionCandidateLimit()).toBe(250);
  });

  it('falls back to the default when VISION_CANDIDATE_LIMIT is not a positive integer', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', 'nonsense');
    expect(visionCandidateLimit()).toBe(DEFAULT_VISION_CANDIDATE_LIMIT);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd bio-generator && pnpm exec vitest run src/handler.spec.ts -t "visionCandidateLimit"`
Expected: FAIL — `visionCandidateLimit` / `DEFAULT_VISION_CANDIDATE_LIMIT` are not exported (import resolves to `undefined`).

- [ ] **Step 3: Implement the limit in `handler.ts`**

Replace this block (~line 82-83):

```ts
/** Global cap on scraped candidates entering vision verification. */
export const MAX_VISION_CANDIDATES = 60;
```

with:

```ts
/** Default cap on scraped candidates entering vision verification. */
export const DEFAULT_VISION_CANDIDATE_LIMIT = 180;

/**
 * Cap on scraped candidates entering vision verification. The default ships in
 * code; `VISION_CANDIDATE_LIMIT` is an optional per-deploy override for tuning
 * (up to ~300) without a code change. Deliberately NOT pinned in template.yaml,
 * so it can never silently drift the way the removed GeminiModel parameter did.
 */
export const visionCandidateLimit = (): number => {
  const raw = Number(process.env.VISION_CANDIDATE_LIMIT);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_VISION_CANDIDATE_LIMIT;
};
```

- [ ] **Step 4: Point the slice at the new function**

In `applyVerifiedScrapedImages` (~line 480), change:

```ts
const verified = await verify(candidates.slice(0, MAX_VISION_CANDIDATES), context);
```

to:

```ts
const verified = await verify(candidates.slice(0, visionCandidateLimit()), context);
```

- [ ] **Step 5: Update the existing cap test to the new symbol**

In `bio-generator/src/handler.spec.ts`, the test `'caps scraped candidates at MAX_VISION_CANDIDATES before vision verification'` (~line 824) references the removed const. Replace both occurrences of `MAX_VISION_CANDIDATES` inside it with `visionCandidateLimit()`:

```ts
        images: Array.from({ length: visionCandidateLimit() + 5 }, (_, i) => ({
          url: `https://a.example/photo-${i}.jpg`,
          alt: `Photo ${i}`,
          sourceUrl: 'https://a.example/bio',
        })),
```

```ts
const [candidates] = (verifyMock as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown[]];
expect(candidates).toHaveLength(visionCandidateLimit());
```

Also rename the test title to `'caps scraped candidates at the vision candidate limit before vision verification'`.

- [ ] **Step 6: Run the full bio-generator suite + typecheck**

Run: `cd bio-generator && pnpm run test:run && pnpm exec tsc --noEmit`
Expected: PASS — all tests green (263 + 3 new), `tsc` clean.

- [ ] **Step 7: Lint the changed Lambda files**

Run (from repo root): `pnpm exec eslint --config eslint.config.mjs --max-warnings 0 bio-generator/src/handler.ts bio-generator/src/handler.spec.ts`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add bio-generator/src/handler.ts bio-generator/src/handler.spec.ts
git commit -m "feat(bio-generator): ✨ raise vision cap to 180, env-tunable"
```

---

### Task 2: Instrument `rehostImages` with a drop-reason summary (web)

**Files:**

- Modify: `src/lib/services/bio-image-service.ts` (`rehostImages`, lines ~195-280)
- Test: `src/lib/services/bio-image-service.spec.ts` (add `loggers` import; new test in the `BioImageService.rehostImages` describe at ~line 302)

**Interfaces:**

- Produces: a `logger.info('bio_image_rehost_summary', { input, accepted, fetchFailed, exactDuplicate, lowQuality, nearDuplicate })` call at the end of every non-skip `rehostImages` run. No signature change to `rehostImages`.

- [ ] **Step 1: Write the failing test**

In `src/lib/services/bio-image-service.spec.ts`, add the logger import near the top imports:

```ts
import { loggers } from '@/lib/utils/logger';
```

Add this test inside `describe('BioImageService.rehostImages', ...)`:

```ts
it('logs a rehost summary counting accepted images and each drop reason', async () => {
  const infoSpy = vi.spyOn(loggers.media, 'info');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      )
  );

  await BioImageService.rehostImages(
    [
      { url: 'https://x/a.jpg', index: 0 },
      { url: 'https://x/b.jpg', index: 1 },
    ],
    'artist-1'
  );

  expect(infoSpy).toHaveBeenCalledWith(
    'bio_image_rehost_summary',
    expect.objectContaining({
      input: 2,
      accepted: 2,
      fetchFailed: 0,
      exactDuplicate: 0,
      lowQuality: 0,
      nearDuplicate: 0,
    })
  );
  infoSpy.mockRestore();
});
```

(Two distinct buffers with the default above-floor `assessImageQualityMock` → both accepted.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/bio-image-service.spec.ts -t "logs a rehost summary"`
Expected: FAIL — `loggers.media.info` was not called with `'bio_image_rehost_summary'` (0 calls).

- [ ] **Step 3: Add counters in `rehostImages`**

In `src/lib/services/bio-image-service.ts`, immediately after `const duplicateAliases = new Map<number, string>();` (~line 218) add:

```ts
let accepted = 0;
let fetchFailed = 0;
let exactDuplicate = 0;
let lowQuality = 0;
let nearDuplicate = 0;
```

Increment inside each existing branch of the `for` loop:

- In the `if (result.status === 'rejected')` branch, before `results.push(null)`: `fetchFailed += 1;`
- In the exact-duplicate branch (`if (survivorUrl !== undefined)`), before `results.push(null)`: `exactDuplicate += 1;`
- In the low-quality branch (`if (isBelowQualityFloor(assessment))`), before `results.push(null)`: `lowQuality += 1;`
- In the near-duplicate branch (`if (nearDuplicate_ !== undefined)` — the existing `nearDuplicate` local shadows; rename the counter usage carefully, see note), before `results.push(null)`: `nearDuplicate += 1;`
- After `results.push(rehosted);` (successful upload): `accepted += 1;`
- In the `catch` block, before `results.push(null)`: `fetchFailed += 1;`

**Naming note:** the existing code already has a local `const nearDuplicate = seenPerceptualHashes.find(...)`. Rename that local to `nearDuplicateMatch` to free the name for the counter. Update its two references (`if (nearDuplicateMatch !== undefined)` and `duplicateAliases.set(image.index, nearDuplicateMatch.url)`).

- [ ] **Step 4: Emit the summary before returning**

Immediately before `return { results, duplicateAliases };` (~line 279) add:

```ts
logger.info('bio_image_rehost_summary', {
  input: images.length,
  accepted,
  fetchFailed,
  exactDuplicate,
  lowQuality,
  nearDuplicate,
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/services/bio-image-service.spec.ts`
Expected: PASS — the new test and all existing `rehostImages` tests green.

- [ ] **Step 6: Web gate on the changed files**

Run: `pnpm run typecheck` (expect exit 0), then
`pnpm exec eslint --config eslint.config.mjs --fix --max-warnings 0 src/lib/services/bio-image-service.ts src/lib/services/bio-image-service.spec.ts` (expect exit 0), then
`pnpm exec prettier --write src/lib/services/bio-image-service.ts src/lib/services/bio-image-service.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/bio-image-service.ts src/lib/services/bio-image-service.spec.ts
git commit -m "feat(bio): ✨ log rehost drop-reason summary"
```

---

## After Phase 1 (operational, not a code task)

1. Full gate both workspaces (web `typecheck`/`test:run`/`lint`/`format`; bio-generator `test:run` + `tsc`).
2. Open a PR; on merge, **Deploy Bio Generator first** (produces the larger candidate set), then Web CD.
3. Regenerate Ceschi. Read two things from the logs: bio-generator `vision_verified kept: N` (should rise well above 20) and web `bio_image_rehost_summary` (the real 52→10 → new split).
4. That summary scopes **Phase 2b** (a separate plan): fix whichever losses are _recoverable_ (403 retry with headers / #548 proxy path if `fetchFailed` dominates; revisit dedupe only if it is merging distinct images). Quality floors stay.

## Self-Review

- **Spec coverage:** Workstream 1 (vision cap 60→180, env-overridable) → Task 1. Workstream 2a (instrument `rehostImages`) → Task 2. Workstream 2b (fix) → explicitly deferred to a measurement-gated follow-up plan (spec's "measure-first"). Covers/quality-floor non-goals honored (no changes). Testing section satisfied (cap-respected + env-override; summary counts).
- **Placeholder scan:** none — every step has exact code/commands.
- **Type consistency:** `DEFAULT_VISION_CANDIDATE_LIMIT` / `visionCandidateLimit()` used identically in `handler.ts` and `handler.spec.ts`; the `nearDuplicate` counter vs `nearDuplicateMatch` local shadow is called out explicitly in Task 2 Step 3.
