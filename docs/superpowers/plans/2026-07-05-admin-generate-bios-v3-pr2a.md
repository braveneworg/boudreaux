# Admin Generate Bios v3 — PR 2a: Discovery Quality Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter blurry, low-resolution, and perceptually-duplicate images out of the AI bio-image re-host pass so the discovered-images palette shows only good, distinct photos.

**Architecture:** Add a pure-ish image-quality utility (`src/lib/utils/image-quality.ts`) that scores an image buffer with `sharp` — original dimensions, a Laplacian-variance sharpness score, and a 64-bit dHash perceptual hash. Wire a gate into the existing `BioImageService.rehostImages` Phase-2 loop: after the current exact-SHA-256 dedupe, reject images below an absolute quality floor (too small OR too blurry), then drop perceptual near-duplicates by reusing the existing `duplicateAliases` survivor-aliasing seam. No Lambda change; no schema change; the palette count already derives from persisted (surviving) images, so it reflects passing images for free.

**Tech Stack:** TypeScript 6 (strict), Next.js 16, `sharp` ^0.34.5 (libvips native addon), Vitest 4 (real sharp under a `forks`-pool project; mocked sharp elsewhere), the existing S3 re-host path.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from AGENTS.md and the PR-2 design (`docs/auto-generated/2026-07-04-admin-generate-bios-v3-design.md`).

- **TDD, non-negotiable:** write the failing test first, watch it fail, then implement. Gate before every commit: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` (all four pass).
- **Style:** arrow functions only (no `function`); named exports only; no `any`, no non-null `!`; no `eslint-disable`/`@ts-ignore`/`@ts-nocheck`; cyclomatic complexity ≤ 10 (this repo counts each `?.`, `??`, `||`, `&&`, `?:` toward it — extract helpers early). MPL header (`HEADER.txt`) on every new file.
- **Server-only boundary:** `bio-image-service.ts` and the new `image-quality.ts` both `import 'server-only'`; their specs must `vi.mock('server-only', () => ({}))`. Never import these into client components.
- **Coverage:** the pre-push gate runs `test:coverage:check` — hard threshold 95% branches + max 2% regression vs `COVERAGE_METRICS.md`. New branchy code (floor checks, near-dup loop) must cover BOTH sides of every branch.
- **`sharp` is a native addon:** it does NOT load reliably under Vitest's default `vmThreads` pool. Any spec that runs REAL sharp (decodes/generates images) must run under a `forks`-pool project (mirrors the existing `jsdom-forks` html-parser carve-out). Specs that only need the S3/thumbnail path keep the existing full `sharp` mock.
- **Do NOT change the E2E path:** `rehostImages` short-circuits via `shouldSkipRehost()` (BIO_GENERATOR_FAKE / E2E_MODE / NEXT_PUBLIC_E2E_MODE) before any buffer exists, so the quality gate never runs in E2E/fake mode. No E2E or seed changes in this PR.
- **Preserve the `rehostImages` contract:** position-preserving `results: Array<RehostedImage | null>` + `duplicateAliases: Map<number,string>`. A quality REJECT pushes `null` with NO alias (nothing to alias to). A near-DUPLICATE pushes `null` WITH an alias to the survivor's CDN url (same as the exact-dup branch). Lowest-input-index survivor wins — preserved by keeping all new logic inside the existing input-index-ordered Phase-2 loop.
- **Thresholds are tunable constants** with explanatory comments. Calibrate conservatively — dropping a legitimate image is worse than keeping a marginal one (admins can regenerate/upload).

## File Structure

- `src/lib/utils/image-quality.ts` — **new.** Pure/near-pure image-quality primitives over a `Buffer`: `hammingDistance` (pure), `perceptualDHash`, `laplacianVarianceSharpness`, `assessImageQuality`, `isBelowQualityFloor`, plus the tunable constants. Imports `sharp`; `import 'server-only'`.
- `src/lib/utils/image-quality.spec.ts` — **new.** REAL sharp, runs under a new `node-forks` vitest project. Generates deterministic in-memory images (solids/checkerboards/gradients via `sharp({ create })` and raw buffers) to exercise the pixel math.
- `vitest.config.ts` — **modify.** Add a `node-forks` project (`environment: 'node'`, `pool: 'forks'`) that owns the real-sharp specs, and exclude those specs from the default `node` project.
- `src/lib/services/bio-image-service.ts` — **modify.** Insert the gate into the `rehostImages` Phase-2 loop.
- `src/lib/services/bio-image-service.spec.ts` — **modify.** Mock the new `@/lib/utils/image-quality` module (control `assessImageQuality`; keep real `isBelowQualityFloor`/`hammingDistance`) and add reject/near-dup tests; adjust the default mock so existing distinct-image tests still survive.

---

## Task 1: dHash + Hamming distance + real-sharp test harness

Establishes the perceptual-hash primitive AND the `forks`-pool harness for real-sharp specs (the riskiest infra bit) first.

**Files:**

- Create: `src/lib/utils/image-quality.ts`
- Create: `src/lib/utils/image-quality.spec.ts`
- Modify: `vitest.config.ts` (add `node-forks` project; carve the real-sharp spec out of `node`)

**Interfaces:**

- Produces: `hammingDistance(a: bigint, b: bigint): number`; `perceptualDHash(buffer: Buffer): Promise<bigint>`; `NEAR_DUPLICATE_MAX_DISTANCE: number` (const `= 10`).
- Consumes: `sharp` (real).

- [ ] **Step 1: Register a `node-forks` vitest project for real-sharp specs**

In `vitest.config.ts`, just below the `HTML_PARSER_SPECS` const (line ~27), add:

```ts
// Specs that exercise REAL `sharp` (a libvips native addon) must run under the
// `forks` pool: the default `vmThreads` pool cannot reliably load native
// addons. Keep this list tight — every other `.spec.ts` stays on `vmThreads`.
const NATIVE_ADDON_SPECS = ['**/image-quality.spec.ts'];
```

Exclude those specs from the default `node` project (add to its `exclude`, line ~66):

```ts
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['**/*.spec.ts'],
            exclude: [
              '**/node_modules/**',
              'bio-generator/**',
              'stripe-webhook/**',
              ...NATIVE_ADDON_SPECS,
            ],
          },
        },
```

Add a new project after the `jsdom-forks` project (after line ~95):

```ts
        {
          // Real-`sharp` specs need the `forks` pool (native addon won't load
          // under vmThreads). Node environment, no DOM. See NATIVE_ADDON_SPECS.
          extends: true,
          test: {
            name: 'node-forks',
            environment: 'node',
            pool: 'forks',
            include: NATIVE_ADDON_SPECS,
            exclude: ['**/node_modules/**', 'bio-generator/**', 'stripe-webhook/**'],
          },
        },
```

- [ ] **Step 2: Write the failing test for `hammingDistance` + `perceptualDHash`**

Create `src/lib/utils/image-quality.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import sharp from 'sharp';

import { hammingDistance, perceptualDHash, NEAR_DUPLICATE_MAX_DISTANCE } from './image-quality';

vi.mock('server-only', () => ({}));

// A deterministic RGB image built from a per-pixel painter. channels=3.
const makeImage = async (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number]
): Promise<Buffer> => {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 3;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

const horizontalGradient = (width: number, height: number): Promise<Buffer> =>
  makeImage(width, height, (x) => {
    const v = Math.round((x / (width - 1)) * 255);
    return [v, v, v];
  });

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(0xffffn, 0xffffn)).toBe(0);
  });

  it('counts a single differing bit', () => {
    expect(hammingDistance(0b1010n, 0b1011n)).toBe(1);
  });

  it('counts all 64 bits differing', () => {
    const allOnes = (1n << 64n) - 1n;
    expect(hammingDistance(allOnes, 0n)).toBe(64);
  });
});

describe('perceptualDHash', () => {
  it('hashes the same photo at two sizes to a near-identical value', async () => {
    const big = await horizontalGradient(200, 160);
    const small = await horizontalGradient(80, 64);

    const hashBig = await perceptualDHash(big);
    const hashSmall = await perceptualDHash(small);

    expect(hammingDistance(hashBig, hashSmall)).toBeLessThanOrEqual(NEAR_DUPLICATE_MAX_DISTANCE);
  });

  it('hashes visually different images far apart', async () => {
    const gradient = await horizontalGradient(120, 96);
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });

    const distance = hammingDistance(
      await perceptualDHash(gradient),
      await perceptualDHash(checkerboard)
    );

    expect(distance).toBeGreaterThan(NEAR_DUPLICATE_MAX_DISTANCE);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/utils/image-quality.spec.ts`
Expected: FAIL — `image-quality.ts` does not exist yet (module-not-found / undefined exports).

- [ ] **Step 4: Implement `image-quality.ts` (dHash + hamming only)**

Create `src/lib/utils/image-quality.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import sharp from 'sharp';

/**
 * Maximum Hamming distance between two 64-bit dHashes for two images to count
 * as perceptual near-duplicates (resized / re-encoded copies of one photo).
 * 0 = identical hash, 64 = maximally different. Tunable.
 */
export const NEAR_DUPLICATE_MAX_DISTANCE = 10;

/** dHash grid: (DHASH_WIDTH - 1) comparisons per row x DHASH_HEIGHT rows = 64 bits. */
const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;

/** Count differing bits between two 64-bit perceptual hashes. */
export const hammingDistance = (a: bigint, b: bigint): number => {
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
};

/**
 * Compute a 64-bit difference hash (dHash). The image is reduced to a 9x8
 * greyscale grid; each of the 8 rows contributes 8 bits, one per
 * adjacent-pixel comparison (left brighter than right -> 1). Robust to
 * rescaling and re-encoding, so near-identical photos hash close together.
 */
export const perceptualDHash = async (buffer: Buffer): Promise<bigint> => {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  for (let row = 0; row < DHASH_HEIGHT; row++) {
    for (let col = 0; col < DHASH_WIDTH - 1; col++) {
      const left = data[row * DHASH_WIDTH + col];
      const right = data[row * DHASH_WIDTH + col + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/utils/image-quality.spec.ts`
Expected: PASS (6 tests). If sharp fails to load, confirm the spec ran under the `node-forks` project (the run header lists `node-forks`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/image-quality.ts src/lib/utils/image-quality.spec.ts vitest.config.ts
git commit -m "feat: ✨ add dHash + hamming image-quality primitives"
```

---

## Task 2: Laplacian-variance sharpness + full assessment + quality floor

**Files:**

- Modify: `src/lib/utils/image-quality.ts`
- Modify: `src/lib/utils/image-quality.spec.ts`

**Interfaces:**

- Consumes: `perceptualDHash` (Task 1), `sharp`.
- Produces: `laplacianVarianceSharpness(buffer: Buffer): Promise<number>`; `interface ImageQualityAssessment { width: number; height: number; sharpness: number; dHash: bigint }`; `assessImageQuality(buffer: Buffer): Promise<ImageQualityAssessment>`; `isBelowQualityFloor(assessment: ImageQualityAssessment): boolean`; consts `MIN_IMAGE_DIMENSION = 200`, `MIN_SHARPNESS_VARIANCE = 60`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/image-quality.spec.ts` (add the new symbols to the existing import from `./image-quality`: `laplacianVarianceSharpness, assessImageQuality, isBelowQualityFloor, MIN_IMAGE_DIMENSION, MIN_SHARPNESS_VARIANCE`):

```ts
describe('laplacianVarianceSharpness', () => {
  it('scores a high-contrast checkerboard far above a flat image', async () => {
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });
    const flat = await makeImage(120, 96, () => [128, 128, 128]);

    const sharpScore = await laplacianVarianceSharpness(checkerboard);
    const flatScore = await laplacianVarianceSharpness(flat);

    expect(sharpScore).toBeGreaterThan(flatScore);
  });

  it('scores a flat image below the sharpness floor', async () => {
    const flat = await makeImage(120, 96, () => [128, 128, 128]);
    expect(await laplacianVarianceSharpness(flat)).toBeLessThan(MIN_SHARPNESS_VARIANCE);
  });

  it('scores a crisp checkerboard above the sharpness floor', async () => {
    const checkerboard = await makeImage(120, 96, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });
    expect(await laplacianVarianceSharpness(checkerboard)).toBeGreaterThan(MIN_SHARPNESS_VARIANCE);
  });
});

describe('assessImageQuality', () => {
  it('reports the original dimensions and populated metrics', async () => {
    const image = await makeImage(240, 180, (x, y) => {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    });

    const assessment = await assessImageQuality(image);

    expect(assessment.width).toBe(240);
    expect(assessment.height).toBe(180);
    expect(assessment.sharpness).toBeGreaterThan(0);
    expect(typeof assessment.dHash).toBe('bigint');
  });
});

describe('isBelowQualityFloor', () => {
  it('rejects an image below the minimum dimension', () => {
    expect(
      isBelowQualityFloor({
        width: MIN_IMAGE_DIMENSION - 1,
        height: 400,
        sharpness: 500,
        dHash: 0n,
      })
    ).toBe(true);
  });

  it('rejects an image below the sharpness floor', () => {
    expect(
      isBelowQualityFloor({
        width: 400,
        height: 400,
        sharpness: MIN_SHARPNESS_VARIANCE - 1,
        dHash: 0n,
      })
    ).toBe(true);
  });

  it('passes an image that clears both floors', () => {
    expect(
      isBelowQualityFloor({
        width: 400,
        height: 400,
        sharpness: MIN_SHARPNESS_VARIANCE + 1,
        dHash: 0n,
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/lib/utils/image-quality.spec.ts`
Expected: FAIL — `laplacianVarianceSharpness`, `assessImageQuality`, `isBelowQualityFloor`, `MIN_*` are undefined.

- [ ] **Step 3: Implement the sharpness + assessment + floor**

Add to `src/lib/utils/image-quality.ts` (below the dHash constants, and export the new consts):

```ts
/**
 * Minimum width AND height (px) an image must have to survive the gate. Below
 * this it is too small to render acceptably in a bio and is dropped. Tunable.
 */
export const MIN_IMAGE_DIMENSION = 200;

/**
 * Minimum Laplacian-response variance an image must have to survive the gate.
 * Blurry / out-of-focus images produce weak edges and a low variance; sharp
 * images produce a high one. Conservative initial floor — raise it if blurry
 * images slip through, lower it if crisp images are dropped. Tunable.
 */
export const MIN_SHARPNESS_VARIANCE = 60;

/** 3x3 discrete Laplacian kernel; convolving with it isolates edge energy. */
const LAPLACIAN_KERNEL = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] };

export interface ImageQualityAssessment {
  width: number;
  height: number;
  sharpness: number;
  dHash: bigint;
}

/**
 * Score an image's sharpness as the variance of its Laplacian response over a
 * greyscale copy. A low score indicates a blurry / out-of-focus image.
 */
export const laplacianVarianceSharpness = async (buffer: Buffer): Promise<number> => {
  const { data } = await sharp(buffer)
    .greyscale()
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (data.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const value of data) {
    sum += value;
  }
  const mean = sum / data.length;

  let squaredError = 0;
  for (const value of data) {
    squaredError += (value - mean) ** 2;
  }
  return squaredError / data.length;
};

/** Decode `buffer` to produce a full quality assessment. */
export const assessImageQuality = async (buffer: Buffer): Promise<ImageQualityAssessment> => {
  const metadata = await sharp(buffer).metadata();
  const [sharpness, dHash] = await Promise.all([
    laplacianVarianceSharpness(buffer),
    perceptualDHash(buffer),
  ]);
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    sharpness,
    dHash,
  };
};

/**
 * True when an image fails the absolute quality floor (too small OR too blurry)
 * and must be dropped regardless of duplicates.
 */
export const isBelowQualityFloor = ({
  width,
  height,
  sharpness,
}: ImageQualityAssessment): boolean =>
  Math.min(width, height) < MIN_IMAGE_DIMENSION || sharpness < MIN_SHARPNESS_VARIANCE;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/lib/utils/image-quality.spec.ts`
Expected: PASS (all Task 1 + Task 2 tests). If `laplacianVarianceSharpness(flat)` is not below `MIN_SHARPNESS_VARIANCE=60`, the flat image's clamped-Laplacian variance is ~0, so this should hold comfortably; if calibration is off, adjust `MIN_SHARPNESS_VARIANCE` so a flat 128-grey image fails and the crisp checkerboard passes, and note the chosen value.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/image-quality.ts src/lib/utils/image-quality.spec.ts
git commit -m "feat: ✨ add sharpness + quality-floor assessment"
```

---

## Task 3: Wire the quality gate into `rehostImages`

**Files:**

- Modify: `src/lib/services/bio-image-service.ts`
- Modify: `src/lib/services/bio-image-service.spec.ts`

**Interfaces:**

- Consumes: `assessImageQuality`, `isBelowQualityFloor`, `hammingDistance`, `NEAR_DUPLICATE_MAX_DISTANCE` from `@/lib/utils/image-quality`.
- Produces: unchanged public contract of `BioImageService.rehostImages` (a REJECT → `null`, no alias; a near-DUPLICATE → `null` + alias).

- [ ] **Step 1: Write the failing service tests**

In `src/lib/services/bio-image-service.spec.ts`:

(a) Add a mock of the new module near the other `vi.mock` calls (after line ~32). Keep the real pure helpers (`isBelowQualityFloor`, `hammingDistance`, constants) and mock only `assessImageQuality`:

```ts
const assessImageQualityMock = vi.fn();
vi.mock('@/lib/utils/image-quality', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/image-quality')>()),
  assessImageQuality: (buffer: Buffer) => assessImageQualityMock(buffer),
}));
```

(b) In the top-level `beforeEach` (line ~49), give the default a PASSING assessment whose dHash is derived from the buffer bytes, so distinct images never collide as near-duplicates in existing multi-image tests:

```ts
assessImageQualityMock.mockImplementation((buffer: Buffer) => ({
  width: 800,
  height: 600,
  sharpness: 500,
  // sha256-derived 64-bit dHash: identical buffers hash identically (those
  // are caught by the exact-SHA-256 dedupe first), distinct buffers land far
  // apart in Hamming space so they are not treated as near-duplicates.
  dHash: BigInt(`0x${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`),
}));
```

Add `import { createHash } from 'crypto';` at the top of the spec if not already present.

(c) Add tests inside the `describe('BioImageService.rehostImages', ...)` block:

```ts
it('drops an image below the resolution floor and uploads nothing for it', async () => {
  assessImageQualityMock.mockResolvedValueOnce({
    width: 100,
    height: 100,
    sharpness: 500,
    dHash: 1n,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

  const { results, duplicateAliases } = await BioImageService.rehostImages(
    [{ url: 'https://x/small.jpg', index: 0 }],
    'artist-1'
  );

  expect(results).toEqual([null]);
  expect(duplicateAliases.size).toBe(0);
  expect(sendMock).not.toHaveBeenCalled();
});

it('drops a blurry image below the sharpness floor', async () => {
  assessImageQualityMock.mockResolvedValueOnce({
    width: 800,
    height: 600,
    sharpness: 5,
    dHash: 1n,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

  const { results, duplicateAliases } = await BioImageService.rehostImages(
    [{ url: 'https://x/blurry.jpg', index: 0 }],
    'artist-1'
  );

  expect(results).toEqual([null]);
  expect(duplicateAliases.size).toBe(0);
  expect(sendMock).not.toHaveBeenCalled();
});

it('aliases a perceptual near-duplicate to the surviving copy', async () => {
  // Two byte-distinct images (so SHA-256 does NOT collide) whose dHashes are
  // 1 bit apart -> within NEAR_DUPLICATE_MAX_DISTANCE.
  assessImageQualityMock
    .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0b1010n })
    .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0b1011n });

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(new Uint8Array([1, 1, 1, 1]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array([2, 2, 2, 2]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );
  vi.stubGlobal('fetch', fetchMock);

  const { results, duplicateAliases } = await BioImageService.rehostImages(
    [
      { url: 'https://x/a.jpg', index: 0 },
      { url: 'https://x/b.jpg', index: 1 },
    ],
    'artist-1'
  );

  expect(results[0]).not.toBeNull();
  expect(results[1]).toBeNull();
  expect(duplicateAliases.get(1)).toBe(results[0]?.url);
  expect(sendMock).toHaveBeenCalledTimes(1);
});

it('keeps two perceptually-distinct images', async () => {
  assessImageQualityMock
    .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0n })
    .mockResolvedValueOnce({
      width: 800,
      height: 600,
      sharpness: 500,
      dHash: (1n << 64n) - 1n,
    });

  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(new Uint8Array([1, 1, 1, 1]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array([2, 2, 2, 2]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );
  vi.stubGlobal('fetch', fetchMock);

  const { results, duplicateAliases } = await BioImageService.rehostImages(
    [
      { url: 'https://x/a.jpg', index: 0 },
      { url: 'https://x/b.jpg', index: 1 },
    ],
    'artist-1'
  );

  expect(results[0]).not.toBeNull();
  expect(results[1]).not.toBeNull();
  expect(duplicateAliases.size).toBe(0);
  expect(sendMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/lib/services/bio-image-service.spec.ts`
Expected: FAIL — the gate is not wired yet, so low-res/blurry images still upload and near-duplicates are not aliased.

- [ ] **Step 3: Wire the gate into `rehostImages`**

In `src/lib/services/bio-image-service.ts`, add the import (after line 15):

```ts
import {
  assessImageQuality,
  hammingDistance,
  isBelowQualityFloor,
  NEAR_DUPLICATE_MAX_DISTANCE,
} from '@/lib/utils/image-quality';
```

Add a survivor perceptual-hash list beside `seenHashes` (after line 208):

```ts
const seenHashes = new Map<string, string>();
// Survivor dHashes paired with their CDN url, for perceptual near-dup checks.
const seenPerceptualHashes: Array<{ hash: bigint; url: string }> = [];
const results: Array<RehostedImage | null> = [];
const duplicateAliases = new Map<number, string>();
```

Replace the body of the `try` (lines 226–244) with:

```ts
try {
  const { buffer } = result.value;
  const hash = createHash('sha256').update(buffer).digest('hex');
  const survivorUrl = seenHashes.get(hash);

  if (survivorUrl !== undefined) {
    logger.warn('bio_image_duplicate_skipped', { index: image.index });
    duplicateAliases.set(image.index, survivorUrl);
    results.push(null);
    continue;
  }

  const assessment = await assessImageQuality(buffer);

  if (isBelowQualityFloor(assessment)) {
    logger.warn('bio_image_low_quality_skipped', {
      index: image.index,
      width: assessment.width,
      height: assessment.height,
      sharpness: assessment.sharpness,
    });
    results.push(null);
    continue;
  }

  const nearDuplicate = seenPerceptualHashes.find(
    (seen) => hammingDistance(seen.hash, assessment.dHash) <= NEAR_DUPLICATE_MAX_DISTANCE
  );
  if (nearDuplicate !== undefined) {
    logger.warn('bio_image_near_duplicate_skipped', { index: image.index });
    duplicateAliases.set(image.index, nearDuplicate.url);
    results.push(null);
    continue;
  }

  const rehosted = await processThumbnail(buffer, artistId, image.index);
  seenHashes.set(hash, rehosted.url);
  seenPerceptualHashes.push({ hash: assessment.dHash, url: rehosted.url });
  results.push(rehosted);
} catch (error) {
  logger.warn('Bio image fetch or upload failed', { error });
  results.push(null);
}
```

Check the cyclomatic complexity of `rehostImages` after this change (`pnpm run lint`). If it exceeds 10, extract the Phase-2 per-image body into a helper (e.g. `classifyAndRehost`) that returns a small discriminated result the loop applies — the plan's reviewer will expect complexity ≤ 10.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/lib/services/bio-image-service.spec.ts`
Expected: PASS — all new tests plus every pre-existing `rehostImages` test (exact-dedupe, ordering, concurrency ≤ 8) still green.

- [ ] **Step 5: Full gate**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
Expected: all pass. Then confirm no coverage regression: `pnpm run test:coverage:check` (branches ≥ 95%, within 2% of baseline).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/bio-image-service.ts src/lib/services/bio-image-service.spec.ts
git commit -m "feat: ✨ gate bio images on quality + near-dupes"
```

---

## Self-Review

**Spec coverage (PR-2 design → this plan):**

- "Blur/low-res rejection: Laplacian-variance sharpness score + a minimum-dimension floor. Thresholds constant + tunable." → `laplacianVarianceSharpness` + `MIN_SHARPNESS_VARIANCE` + `MIN_IMAGE_DIMENSION` (Task 2), gated in Task 3.
- "Perceptual dedupe: aHash/dHash from the decoded buffer, reusing the existing `seenHashes` / `duplicateAliases` seam; catches resized/re-encoded copies exact SHA-256 misses." → `perceptualDHash` (Task 1) + `seenPerceptualHashes` + `duplicateAliases` reuse (Task 3).
- "Pure functions over image buffers → straightforward unit tests with fixtures." → `image-quality.ts` + real-sharp spec with generated images (Tasks 1–2).
- "Target, not floor … render the count … stop when candidates run dry; no padding." → rejects/near-dups become `null` → not persisted → palette count reflects survivors automatically (no code; noted). No padding is added anywhere.
- Lambda expansion + conditional async → **explicitly out of scope** (PR 2b), per the user's slicing decision.

**Placeholder scan:** every code step contains complete code and exact commands. Steps that must "watch it fail" first fail because the module/exports do not exist yet (module-not-found / undefined), not because of any planted syntax error.

**Type consistency:** `ImageQualityAssessment` fields (`width`, `height`, `sharpness`, `dHash: bigint`) are used identically in the util, the floor predicate, and every service-spec mock. `assessImageQuality`/`isBelowQualityFloor`/`hammingDistance`/`NEAR_DUPLICATE_MAX_DISTANCE` signatures match between `image-quality.ts` and the `bio-image-service.ts` import. `RehostImagesResult` contract is unchanged.

**Risks flagged:**

- **Threshold calibration** (`MIN_SHARPNESS_VARIANCE`) is the main risk — a clamped-uint8 Laplacian variance is a proxy, and the "right" floor is content-dependent. The value is a conservative constant with a tunable comment; tests assert relative ordering (flat < floor < checkerboard) rather than absolute magnitudes, so the gate's _logic_ is verified even if the number is later tuned.
- **More unresolved `image:N` placeholders:** dropping more images means the Lambda's inline `image:N` references resolve less often; the existing sanitizer already strips unresolved placeholders (same as today's fetch-failure path), so no new handling is needed — accepted per "quality over quantity."
- **Native-addon test pool:** if `node-forks` still can't load sharp in CI, fall back to generating the raw pixel buffers directly and testing the pure bit/variance math without a sharp round-trip — but prefer the real-sharp path first.
