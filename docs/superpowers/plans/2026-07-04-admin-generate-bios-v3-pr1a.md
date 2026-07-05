# Admin Generate Bios v3 — PR 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin "discovered images/links" palette a _persistent_ bio-media library (visible regardless of generation-job status), and add the admin write-backend (repository → service → validation → server actions) that PR 1b's upload dialog and attribution editor will consume.

**Architecture:** The persisted `ArtistBioImage`/`ArtistBioLink` rows already reach the client through `useArtistBioGenerationStatusQuery` (via `ArtistRepository.getBioGenerationState`); today two `status === 'succeeded'` gates hide them (server `BioGenerationService.getGenerationStatus`, client `BioMediaPalettes`). PR 1a relaxes both gates so the palette shows persisted rows whenever they exist, then adds `createBioImage` / `updateBioImageAttribution` down the stack (repo → service → Zod input schemas → two admin server actions) with no UI consumer yet — that arrives in PR 1b.

**Tech Stack:** TypeScript 6 (strict), Next.js 16 App Router, React 19, Prisma 6 + MongoDB, Zod 4, TanStack Query 5, Vitest 4 + @testing-library/react. Server Actions for mutations; repository pattern for all Prisma access.

## Global Constraints

- **TDD, no exceptions:** write the failing test, watch it fail, implement minimally, watch it pass, commit. Every task.
- **Gate before every commit** (husky enforces a subset; run manually if unsure): `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- **No `any`, no non-null `!`.** Prefer a narrower type or handle the null. Explicit types on exported functions.
- **Arrow functions only** (no `function` declarations); **named exports only** (App Router special files excepted).
- **MPL header** (3-line block from `HEADER.txt`) at the top of every **new** source file.
- **Path aliases** for all imports (`@/lib/*`, `@/app/*`, …) — no `../../` except adjacent files.
- **Vitest globals:** `describe`/`it`/`expect`/`vi`/`beforeEach`/`afterEach` are global — never import them. Every server-touching spec starts with `vi.mock('server-only', () => ({}));`.
- **Never** suppress lint/type errors (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`). Fix the code.
- Commits: `type(scope): <gitmoji> subject` (subject ≤50 chars), no AI attribution, feature branch only.

## Deviations from the spec (justified by the code)

The committed spec (`docs/auto-generated/2026-07-04-admin-generate-bios-v3-design.md`) assumed PR 1a needed a _new query hook_ and _server-side seeding_ for the persistent sidebar. The actual code shows the persisted rows already flow via the existing status query — so:

- **No new hook/route/include** is added for reads. The persistent sidebar is achieved by relaxing the two existing `status === 'succeeded'` gates (Tasks 1–2).
- **No server-side seeding** is added to `page.tsx` (it's a thin passthrough; data is client-fetched). Unchanged.
- The **write backend** (create/update actions, Tasks 3–6) is built here as planned, with **no UI consumer until PR 1b** (unit-tested foundation).

## File Structure

| File                                                                 | Action                         | Responsibility                                                     |
| -------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `src/lib/services/bio-generation-service.ts`                         | Modify (`getGenerationStatus`) | Build `content` when persisted rows exist, not only on `succeeded` |
| `src/lib/services/bio-generation-service.spec.ts`                    | Modify                         | Cover the ungated behavior                                         |
| `src/app/components/forms/bio-media-palettes.tsx`                    | Modify (line ~42 + JSDoc)      | Read `content` regardless of status                                |
| `src/app/components/forms/bio-media-palettes.spec.tsx`               | Modify                         | Cover the ungated behavior                                         |
| `src/lib/types/domain/artist.ts`                                     | Modify                         | Add `CreateArtistBioImageData` input type                          |
| `src/lib/repositories/artist-repository.ts`                          | Modify                         | Add `createBioImage`, `updateBioImageAttribution`                  |
| `src/lib/repositories/artist-repository.spec.ts`                     | Modify                         | Cover the two new repo methods                                     |
| `src/lib/services/artist-service.ts`                                 | Modify                         | Add `createBioImage`, `updateBioImageAttribution`                  |
| `src/lib/services/artist-service.spec.ts`                            | Modify                         | Cover the two new service methods                                  |
| `src/lib/validation/bio-image-input-schema.ts`                       | Create                         | Zod input schemas for create + attribution update                  |
| `src/lib/validation/bio-image-input-schema.spec.ts`                  | Create                         | Schema tests                                                       |
| `src/lib/utils/audit-log.ts`                                         | Modify                         | Add `media.artist_bio_image.created` / `.updated` events           |
| `src/lib/actions/create-artist-bio-image-action.ts`                  | Create                         | Admin action to persist one bio image                              |
| `src/lib/actions/create-artist-bio-image-action.spec.ts`             | Create                         | Action tests                                                       |
| `src/lib/actions/update-artist-bio-image-attribution-action.ts`      | Create                         | Admin action to edit attribution                                   |
| `src/lib/actions/update-artist-bio-image-attribution-action.spec.ts` | Create                         | Action tests                                                       |

---

### Task 1: Ungate persisted bio media on the server

**Files:**

- Modify: `src/lib/services/bio-generation-service.ts` (`getGenerationStatus`, ~lines 514–535)
- Test: `src/lib/services/bio-generation-service.spec.ts` (`getGenerationStatus` describe, ~lines 907–1015)

**Interfaces:**

- Produces: `BioGenerationService.getGenerationStatus(artistId)` returns `content` populated when `status === 'succeeded'` **or** persisted `bioImages`/`bioLinks` exist. Existing callers unaffected (the client still empty-gates on zero rows).

- [ ] **Step 1: Write the failing tests.** Append inside the existing `describe('BioGenerationService.getGenerationStatus', …)` block:

```ts
it('surfaces persisted bio images even when the job never succeeded', async () => {
  getBioGenerationStateMock.mockResolvedValue(
    state({
      bioStatus: null,
      bioImages: [
        {
          url: 'u',
          thumbnailUrl: null,
          title: null,
          attribution: null,
          license: null,
          sourceUrl: null,
          isPrimary: false,
        },
      ],
    })
  );

  const result = await BioGenerationService.getGenerationStatus('a1');

  expect(result?.status).toBeNull();
  expect(result?.content?.images).toHaveLength(1);
});

it('keeps surfacing persisted media after a failed regeneration', async () => {
  getBioGenerationStateMock.mockResolvedValue(
    state({
      bioStatus: 'failed',
      bioError: 'boom',
      bioLinks: [{ label: 'L', url: 'u2', kind: null }],
    })
  );

  const result = await BioGenerationService.getGenerationStatus('a1');

  expect(result?.status).toBe('failed');
  expect(result?.content?.links).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `pnpm exec vitest run src/lib/services/bio-generation-service.spec.ts -t "getGenerationStatus"`
Expected: FAIL — the two new tests report `content` is `null` (`Received: null`).

- [ ] **Step 3: Implement the ungate.** In `getGenerationStatus`, replace the `content` assignment (currently gated only on `status === 'succeeded'`) with:

```ts
const status = (state.bioStatus as BioStatus | null) ?? null;
const hasPersistedMedia = state.bioImages.length > 0 || state.bioLinks.length > 0;
const content: GeneratedBioContent | null =
  status === 'succeeded' || hasPersistedMedia
    ? {
        shortBio: state.shortBio ?? '',
        longBio: state.bio ?? '',
        altBio: state.altBio ?? '',
        genres: state.genres ?? null,
        images: state.bioImages,
        links: state.bioLinks,
        model: state.bioModel ?? '',
      }
    : null;
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/services/bio-generation-service.spec.ts`
Expected: PASS — new tests pass; all existing `getGenerationStatus` tests still pass (their non-succeeded states have empty `bioImages`/`bioLinks`, so `content` stays `null`).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/services/bio-generation-service.ts src/lib/services/bio-generation-service.spec.ts
git commit -m "feat: ✨ surface persisted bio media before job succeeds"
```

---

### Task 2: Ungate the palette on the client

**Files:**

- Modify: `src/app/components/forms/bio-media-palettes.tsx` (line ~42 + component JSDoc)
- Test: `src/app/components/forms/bio-media-palettes.spec.tsx`

**Interfaces:**

- Consumes: `getGenerationStatus` from Task 1 (server now returns `content` for persisted rows).
- Produces: `BioMediaPalettes` renders whenever `status.data.content` has ≥1 link or image, regardless of `status`.

- [ ] **Step 1: Write the failing test.** Append inside the top-level `describe` in `bio-media-palettes.spec.tsx`:

```tsx
it('renders the palettes when persisted content exists without a succeeded job', () => {
  mockStatus({ status: null, error: null, content: contentWith([LINK_ROW], [IMAGE_ROW]) });

  render(<BioMediaPalettes artistId="artist-1" />);

  expect(screen.getByRole('group', { name: 'Discovered images' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm exec vitest run src/app/components/forms/bio-media-palettes.spec.tsx -t "without a succeeded job"`
Expected: FAIL — nothing renders (`Unable to find role="group"`), because the current gate requires `status === 'succeeded'`.

- [ ] **Step 3: Implement the ungate.** In `bio-media-palettes.tsx`, replace the content derivation line:

```tsx
const content = status.data?.content ?? null;
```

(was `const content = status.data?.status === 'succeeded' ? status.data.content : null;`)

Then update the component's JSDoc sentence to keep the comment accurate:

```tsx
 * Renders nothing until the artist has at least one persisted bio image or
 * link; while either delete mutation is pending both palettes' delete buttons
 * are disabled.
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm exec vitest run src/app/components/forms/bio-media-palettes.spec.tsx`
Expected: PASS — the new test passes; all existing "renders nothing" tests still pass (they mock `content: null`, so the empty-gate still hides the palette).

- [ ] **Step 5: Commit.**

```bash
git add src/app/components/forms/bio-media-palettes.tsx src/app/components/forms/bio-media-palettes.spec.tsx
git commit -m "feat: ✨ show persisted bio palette regardless of status"
```

---

### Task 3: Repository — `createBioImage` + `updateBioImageAttribution`

**Files:**

- Modify: `src/lib/types/domain/artist.ts` (add input type)
- Modify: `src/lib/repositories/artist-repository.ts` (add two methods after `updateBioImageUrl`, ~line 583)
- Test: `src/lib/repositories/artist-repository.spec.ts` (extend the `artistBioImage` prisma mock; add two describe blocks)

**Interfaces:**

- Produces:
  - `CreateArtistBioImageData` (domain input type — see Step 1).
  - `ArtistRepository.createBioImage(data: CreateArtistBioImageData): Promise<ArtistBioImageRecord>` — appends after the artist's current max `sortOrder`.
  - `ArtistRepository.updateBioImageAttribution(imageId: string, attribution: string | null): Promise<void>`.

- [ ] **Step 1: Add the domain input type.** In `src/lib/types/domain/artist.ts`, after `ArtistBioImageRecord`, add:

```ts
/** Fields for creating one bio image row (manual upload / curated addition). */
export interface CreateArtistBioImageData {
  artistId: string;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  attribution?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  width?: number | null;
  height?: number | null;
  isPrimary?: boolean;
  kind?: string | null;
  alt?: string | null;
}
```

- [ ] **Step 2: Extend the prisma mock + write the failing tests.** In `artist-repository.spec.ts`, add `create` and `aggregate` to the `artistBioImage` mock:

```ts
    artistBioImage: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
```

Then add two describe blocks (place them near the existing `updateBioImageUrl` / `deleteBioImage` blocks):

```ts
describe('createBioImage', () => {
  it('appends a new bio image row after the current max sortOrder', async () => {
    vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
      _max: { sortOrder: 2 },
    } as never);
    vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-9' } as never);

    const created = await ArtistRepository.createBioImage({
      artistId: 'a1',
      url: 'https://cdn.example/x.webp',
      attribution: 'Uploaded',
    });

    expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artistId: 'a1',
        url: 'https://cdn.example/x.webp',
        attribution: 'Uploaded',
        isPrimary: false,
        sortOrder: 3,
      }),
    });
    expect(created).toEqual({ id: 'img-9' });
  });

  it('starts sortOrder at 0 when the artist has no bio images yet', async () => {
    vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-1' } as never);

    await ArtistRepository.createBioImage({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

    expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sortOrder: 0 }),
    });
  });
});

describe('updateBioImageAttribution', () => {
  it('updates the attribution field by id', async () => {
    vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

    await ArtistRepository.updateBioImageAttribution('img-1', 'New credit');

    expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { attribution: 'New credit' },
    });
  });

  it('supports clearing the attribution to null', async () => {
    vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

    await ArtistRepository.updateBioImageAttribution('img-1', null);

    expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { attribution: null },
    });
  });
});
```

- [ ] **Step 3: Run to verify they fail.**

Run: `pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts -t "createBioImage"`
Expected: FAIL — `ArtistRepository.createBioImage is not a function`.

- [ ] **Step 4: Implement the two methods.** In `artist-repository.ts`, add `CreateArtistBioImageData` to the existing domain-type import from `@/lib/types/domain/artist`, then add after `updateBioImageUrl`:

```ts
  /** Creates a single bio image row (manual upload / curated addition),
   *  appending it after the artist's current highest `sortOrder`. */
  static async createBioImage(data: CreateArtistBioImageData): Promise<ArtistBioImageRecord> {
    return runQuery(async () => {
      const { _max } = await prisma.artistBioImage.aggregate({
        where: { artistId: data.artistId },
        _max: { sortOrder: true },
      });
      const sortOrder = (_max.sortOrder ?? -1) + 1;
      return prisma.artistBioImage.create({
        data: {
          artistId: data.artistId,
          url: data.url,
          thumbnailUrl: data.thumbnailUrl ?? null,
          title: data.title ?? null,
          attribution: data.attribution ?? null,
          license: data.license ?? null,
          sourceUrl: data.sourceUrl ?? null,
          originalUrl: data.originalUrl ?? null,
          width: data.width ?? null,
          height: data.height ?? null,
          isPrimary: data.isPrimary ?? false,
          kind: data.kind ?? null,
          alt: data.alt ?? null,
          sortOrder,
        },
      });
    }) as Promise<ArtistBioImageRecord>;
  }

  /** Updates a single bio image row's attribution text (admin edit). */
  static async updateBioImageAttribution(
    imageId: string,
    attribution: string | null
  ): Promise<void> {
    await runQuery(() =>
      prisma.artistBioImage.update({ where: { id: imageId }, data: { attribution } })
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts`
Expected: PASS — new blocks pass; existing repo tests unaffected.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/types/domain/artist.ts src/lib/repositories/artist-repository.ts src/lib/repositories/artist-repository.spec.ts
git commit -m "feat: ✨ add bio-image create + attribution repo methods"
```

---

### Task 4: Service — `createBioImage` + `updateBioImageAttribution`

**Files:**

- Modify: `src/lib/services/artist-service.ts` (add two methods near `deleteBioImage`, ~line 861)
- Test: `src/lib/services/artist-service.spec.ts` (extend the `ArtistRepository` mock; add two describe blocks)

**Interfaces:**

- Consumes: `ArtistRepository.createBioImage`, `ArtistRepository.updateBioImageAttribution` (Task 3).
- Produces:
  - `ArtistService.createBioImage(input: CreateArtistBioImageData): Promise<ArtistBioImageRecord>`.
  - `ArtistService.updateBioImageAttribution(imageId: string, attribution: string | null): Promise<void>`.
  - (Sanitization of attribution happens in the action layer — Task 6 — per spec.)

- [ ] **Step 1: Extend the repo mock + write failing tests.** In `artist-service.spec.ts`, add to the mocked `ArtistRepository` object:

```ts
    createBioImage: vi.fn(),
    updateBioImageAttribution: vi.fn(),
```

Then add:

```ts
describe('createBioImage', () => {
  it('delegates to the repository and returns the created row', async () => {
    const row = { id: 'img-1', artistId: 'a1', url: 'https://cdn/x.webp' };
    vi.mocked(ArtistRepository.createBioImage).mockResolvedValue(row as never);

    const result = await ArtistService.createBioImage({
      artistId: 'a1',
      url: 'https://cdn/x.webp',
    });

    expect(ArtistRepository.createBioImage).toHaveBeenCalledWith({
      artistId: 'a1',
      url: 'https://cdn/x.webp',
    });
    expect(result).toBe(row);
  });
});

describe('updateBioImageAttribution', () => {
  it('delegates the attribution update to the repository', async () => {
    vi.mocked(ArtistRepository.updateBioImageAttribution).mockResolvedValue(undefined as never);

    await ArtistService.updateBioImageAttribution('img-1', 'Credit');

    expect(ArtistRepository.updateBioImageAttribution).toHaveBeenCalledWith('img-1', 'Credit');
  });
});
```

- [ ] **Step 2: Run to verify they fail.**

Run: `pnpm exec vitest run src/lib/services/artist-service.spec.ts -t "createBioImage"`
Expected: FAIL — `ArtistService.createBioImage is not a function`.

- [ ] **Step 3: Implement.** In `artist-service.ts`, add `CreateArtistBioImageData` and `ArtistBioImageRecord` to the existing `@/lib/types/domain/artist` import, then add near `deleteBioImage`:

```ts
  /** Persists one manually-added bio image and returns the created row. */
  static async createBioImage(input: CreateArtistBioImageData): Promise<ArtistBioImageRecord> {
    return ArtistRepository.createBioImage(input);
  }

  /** Updates one bio image's attribution text. */
  static async updateBioImageAttribution(
    imageId: string,
    attribution: string | null
  ): Promise<void> {
    await ArtistRepository.updateBioImageAttribution(imageId, attribution);
  }
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/services/artist-service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/services/artist-service.ts src/lib/services/artist-service.spec.ts
git commit -m "feat: ✨ add bio-image create + attribution service methods"
```

---

### Task 5: Validation — bio-image input schemas

**Files:**

- Create: `src/lib/validation/bio-image-input-schema.ts`
- Test: `src/lib/validation/bio-image-input-schema.spec.ts`

**Interfaces:**

- Produces:
  - `createBioImageInputSchema` + `CreateBioImageInput` (attribution **required**).
  - `updateBioImageAttributionInputSchema` + `UpdateBioImageAttributionInput` (attribution nullable).

- [ ] **Step 1: Write the failing tests.** Create `src/lib/validation/bio-image-input-schema.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createBioImageInputSchema,
  updateBioImageAttributionInputSchema,
} from './bio-image-input-schema';

const validCreate = {
  artistId: '507f1f77bcf86cd799439011',
  url: 'https://cdn.example/x.webp',
  attribution: 'Uploaded by admin',
};

describe('createBioImageInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(createBioImageInputSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a missing attribution', () => {
    const { attribution, ...rest } = validCreate;
    expect(createBioImageInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-ObjectId artistId', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, artistId: 'nope' }).success).toBe(
      false
    );
  });

  it('rejects a non-url image url', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, url: 'not-a-url' }).success).toBe(
      false
    );
  });
});

describe('updateBioImageAttributionInputSchema', () => {
  const imageId = '507f1f77bcf86cd799439011';

  it('accepts a text attribution', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: 'New credit' }).success
    ).toBe(true);
  });

  it('accepts a null attribution (clearing)', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: null }).success
    ).toBe(true);
  });

  it('rejects a non-ObjectId imageId', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId: 'nope', attribution: 'x' }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `pnpm exec vitest run src/lib/validation/bio-image-input-schema.spec.ts`
Expected: FAIL — `Cannot find module './bio-image-input-schema'`.

- [ ] **Step 3: Implement the schemas.** Create `src/lib/validation/bio-image-input-schema.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** A Mongo ObjectId (24 hex chars). */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

/** Admin input for creating one bio image (manual upload / curated addition). */
export const createBioImageInputSchema = z.object({
  artistId: objectId,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable().optional(),
  title: z.string().max(300).nullable().optional(),
  attribution: z.string().max(500),
  alt: z.string().max(500).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export type CreateBioImageInput = z.infer<typeof createBioImageInputSchema>;

/** Admin input for editing one bio image's attribution. */
export const updateBioImageAttributionInputSchema = z.object({
  imageId: objectId,
  attribution: z.string().max(500).nullable(),
});

export type UpdateBioImageAttributionInput = z.infer<typeof updateBioImageAttributionInputSchema>;
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/validation/bio-image-input-schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/validation/bio-image-input-schema.ts src/lib/validation/bio-image-input-schema.spec.ts
git commit -m "feat: ✨ add bio-image input validation schemas"
```

---

### Task 6: Audit events + the two admin server actions

**Files:**

- Modify: `src/lib/utils/audit-log.ts` (add two `AuditEvent` union members)
- Create: `src/lib/actions/create-artist-bio-image-action.ts`
- Test: `src/lib/actions/create-artist-bio-image-action.spec.ts`
- Create: `src/lib/actions/update-artist-bio-image-attribution-action.ts`
- Test: `src/lib/actions/update-artist-bio-image-attribution-action.spec.ts`

**Interfaces:**

- Consumes: `ArtistService.createBioImage` / `updateBioImageAttribution` (Task 4), the schemas (Task 5), `requireRole`, `runAdminEntityAction`, `sanitizeBioText`.
- Produces:
  - `createArtistBioImageAction(input: CreateBioImageInput): Promise<{ success: boolean; data?: ArtistBioImageRecord; error?: string }>`.
  - `updateArtistBioImageAttributionAction(input: UpdateBioImageAttributionInput): Promise<AdminActionResult>`.

- [ ] **Step 1: Add the audit events.** In `src/lib/utils/audit-log.ts`, add to the `AuditEvent` union (beside `'media.artist_bio_image.deleted'`):

```ts
  | 'media.artist_bio_image.created'
  | 'media.artist_bio_image.updated'
```

- [ ] **Step 2: Write the failing create-action tests.** Create `src/lib/actions/create-artist-bio-image-action.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { createArtistBioImageAction } from './create-artist-bio-image-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({ loggers: { s3: { error: vi.fn() } } }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const artistId = '507f1f77bcf86cd799439011';
const validInput = { artistId, url: 'https://cdn.example/x.webp', attribution: 'Uploaded' };
const createdRow = { id: 'img-1', artistId, url: 'https://cdn.example/x.webp' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.existsById).mockResolvedValue(true);
  vi.mocked(ArtistService.createBioImage).mockResolvedValue(createdRow as never);
});

describe('createArtistBioImageAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects invalid input (missing attribution)', async () => {
    const result = await createArtistBioImageAction({
      artistId,
      url: 'https://cdn.example/x.webp',
    } as never);

    expect(result.success).toBe(false);
  });

  it('returns Artist not found when the artist does not exist', async () => {
    vi.mocked(ArtistService.existsById).mockResolvedValue(false);

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Artist not found' });
  });

  it('creates the bio image via the service and returns it', async () => {
    const result = await createArtistBioImageAction(validInput);

    expect(ArtistService.createBioImage).toHaveBeenCalledWith(validInput);
    expect(result).toEqual({ success: true, data: createdRow });
  });

  it('logs a security event on success', async () => {
    await createArtistBioImageAction(validInput);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.created',
      userId: 'user-123',
      metadata: { artistId, artistBioImageId: 'img-1' },
    });
  });

  it('revalidates the admin artists path on success', async () => {
    await createArtistBioImageAction(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ArtistService.createBioImage).mockRejectedValue(new Error('db'));

    const result = await createArtistBioImageAction(validInput);

    expect(result).toEqual({ success: false, error: 'Failed to add bio image' });
  });
});
```

- [ ] **Step 3: Run to verify they fail.**

Run: `pnpm exec vitest run src/lib/actions/create-artist-bio-image-action.spec.ts`
Expected: FAIL — `Cannot find module './create-artist-bio-image-action'`.

- [ ] **Step 4: Implement the create action.** Create `src/lib/actions/create-artist-bio-image-action.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  createBioImageInputSchema,
  type CreateBioImageInput,
} from '@/lib/validation/bio-image-input-schema';

/** Result of adding one bio image. */
export interface CreateBioImageActionResult {
  success: boolean;
  data?: ArtistBioImageRecord;
  error?: string;
}

/**
 * Admin action: persist one manually-added bio image (attribution required) so
 * it appears in the discovered-images palette. Variant generation is triggered
 * separately by the upload orchestration (PR 1b).
 */
export const createArtistBioImageAction = async (
  input: CreateBioImageInput
): Promise<CreateBioImageActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = createBioImageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    if (!(await ArtistService.existsById(parsed.data.artistId))) {
      return { success: false, error: 'Artist not found' };
    }

    const created = await ArtistService.createBioImage(parsed.data);

    logSecurityEvent({
      event: 'media.artist_bio_image.created',
      userId: session.user.id,
      metadata: { artistId: parsed.data.artistId, artistBioImageId: created.id },
    });

    revalidatePath('/admin/artists');

    return { success: true, data: created };
  } catch (error) {
    loggers.s3.error('Create artist bio image action error', error);
    return { success: false, error: 'Failed to add bio image' };
  }
};
```

- [ ] **Step 5: Run create-action tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/actions/create-artist-bio-image-action.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing update-action tests.** Create `src/lib/actions/update-artist-bio-image-attribution-action.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ArtistService } from '@/lib/services/artist-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { updateArtistBioImageAttributionAction } from './update-artist-bio-image-attribution-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/artist-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/sanitize-bio-html', () => ({ sanitizeBioText: (s: string) => `clean:${s}` }));

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const imageId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ArtistService.updateBioImageAttribution).mockResolvedValue(undefined as never);
});

describe('updateArtistBioImageAttributionAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await updateArtistBioImageAttributionAction({ imageId, attribution: 'x' });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid image id', async () => {
    const result = await updateArtistBioImageAttributionAction({
      imageId: 'nope',
      attribution: 'x',
    });

    expect(result).toEqual({ success: false, error: 'Invalid artist bio image ID' });
  });

  it('sanitizes the attribution and updates via the service', async () => {
    const result = await updateArtistBioImageAttributionAction({
      imageId,
      attribution: 'Raw <b>credit</b>',
    });

    expect(ArtistService.updateBioImageAttribution).toHaveBeenCalledWith(
      imageId,
      'clean:Raw <b>credit</b>'
    );
    expect(result).toEqual({ success: true });
  });

  it('passes a null attribution through unchanged (clearing)', async () => {
    await updateArtistBioImageAttributionAction({ imageId, attribution: null });

    expect(ArtistService.updateBioImageAttribution).toHaveBeenCalledWith(imageId, null);
  });

  it('logs a security event on success', async () => {
    await updateArtistBioImageAttributionAction({ imageId, attribution: 'Credit' });

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist_bio_image.updated',
      userId: 'user-123',
      metadata: { artistBioImageId: imageId },
    });
  });
});
```

- [ ] **Step 7: Run to verify they fail.**

Run: `pnpm exec vitest run src/lib/actions/update-artist-bio-image-attribution-action.spec.ts`
Expected: FAIL — `Cannot find module './update-artist-bio-image-attribution-action'`.

- [ ] **Step 8: Implement the update action** (reuses `runAdminEntityAction` for the admin gate + ObjectId check + audit + revalidate; validation and sanitization run inside `perform`, after the auth gate). Create `src/lib/actions/update-artist-bio-image-attribution-action.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  updateBioImageAttributionInputSchema,
  type UpdateBioImageAttributionInput,
} from '@/lib/validation/bio-image-input-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Admin action: edit one bio image's attribution. The value is re-sanitized to
 * plain text before persisting. Uses the shared admin runner for the auth gate,
 * ObjectId validation, audit log, and revalidation.
 */
export const updateArtistBioImageAttributionAction = async (
  input: UpdateBioImageAttributionInput
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: input.imageId,
    entityLabel: 'artist bio image',
    perform: async (id) => {
      const parsed = updateBioImageAttributionInputSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message };
      }
      const attribution =
        parsed.data.attribution === null ? null : sanitizeBioText(parsed.data.attribution);
      await ArtistService.updateBioImageAttribution(id, attribution);
      return { success: true };
    },
    event: 'media.artist_bio_image.updated',
    metadataKey: 'artistBioImageId',
    revalidate: ['/admin/artists'],
    failureError: 'Failed to update bio image attribution',
  });
```

- [ ] **Step 9: Run update-action tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/actions/update-artist-bio-image-attribution-action.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add src/lib/utils/audit-log.ts \
  src/lib/actions/create-artist-bio-image-action.ts \
  src/lib/actions/create-artist-bio-image-action.spec.ts \
  src/lib/actions/update-artist-bio-image-attribution-action.ts \
  src/lib/actions/update-artist-bio-image-attribution-action.spec.ts
git commit -m "feat: ✨ add admin bio-image create + attribution actions"
```

---

### Task 7: Finalize — full gate + push

- [ ] **Step 1: Run the full gate.**

Run: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
Expected: all pass; `format` leaves no diff (or auto-formats — re-stage if so).

- [ ] **Step 2: Push the branch** (feature branch only — never `main`):

```bash
git push -u origin worktree-admin-generate-bios-v3
```

- [ ] **Step 3: Open a PR** for review (title `feat: admin bios v3 — persistent palette + bio-image write backend (PR 1a)`), summarizing the two ungate changes and the new write backend, and noting PRs 1b/2/3 follow.

---

## Self-Review

**1. Spec coverage (PR 1a scope):**

- "Sidebar renders bioImages independent of generation status" → Tasks 1 (server) + 2 (client). ✓
- "Backend actions `createArtistBioImageAction` + `updateArtistBioImageAttributionAction` (requireRole admin)" → Task 6, backed by Tasks 3–5. ✓
- "reuse presigned upload + variants" → deferred to the PR 1b upload orchestration by design; the create action persists a row from an already-uploaded CDN url and does not itself upload. Noted in the create action JSDoc. ✓ (documented deviation)
- "Query/hook exposing persisted bioImages" and "seed server-side" → **not needed**; persisted rows already flow via the existing status query. Documented under "Deviations from the spec." ✓
- "No UI removal, no picker repoint, no migration in 1a" → honored; those are PR 1b. ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"similar to Task N". Every code step shows complete code; every test step shows complete test code; every run step shows the exact command + expected result. ✓

**3. Type consistency:** `CreateArtistBioImageData` (domain) is produced in Task 3 and consumed by name in Task 4; `CreateBioImageInput`/`UpdateBioImageAttributionInput` (Zod-inferred) are produced in Task 5 and consumed in Task 6; `ArtistBioImageRecord` return type is consistent across repo → service → action; action result shapes (`AdminActionResult`, `CreateBioImageActionResult`) match the mocked assertions. Audit events `media.artist_bio_image.created`/`.updated` are added (Task 6 Step 1) before the actions that emit them. ✓
