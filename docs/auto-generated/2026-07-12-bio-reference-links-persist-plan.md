# Persist Bio Reference Links Into the Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an admin-added "Reference link" persist immediately as a custom `ArtistBioLink` so it appears in the draggable Discovered-links palette, survives reload, and still seeds generation.

**Architecture:** Reuse the existing custom-link persistence path (`useCreateBioLinkMutation` → `createArtistBioLinkAction` → `ArtistService.createBioLink` → `ArtistRepository.createBioLink`). Add a URL-derived label util, add service-layer dedupe (both link inputs route through the same action), then fire the create mutation from the reference-links input's Add handler. No schema change.

**Tech Stack:** TypeScript (strict), React 19 / Next.js 16 App Router, TanStack Query 5, Prisma 6 (MongoDB), Vitest 4 + @testing-library/react.

## Global Constraints

- MPL header (from `HEADER.txt`) at the top of every **new** source file:
  ```
  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
  ```
- No `any`, no non-null `!`, no `eslint-disable`/`@ts-*` suppressions. Arrow functions only. Named exports only. Explicit return types on exported functions.
- Test globals (`describe`/`it`/`expect`/`vi`) are ambient — never import them from `vitest`.
- Commits: Conventional Commits `type: <gitmoji> subject`, subject ≤50 chars **including** the gitmoji. Feature branch only (currently `feature/design-tweaks-et-al`) — never commit to `main`. Do not touch the unrelated in-progress datepicker/date-mask working-tree changes; `git add` only the files each task names.
- Full gate must pass before the branch is done: `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. Coverage must not regress the `COVERAGE_METRICS.md` baseline.

---

## Task 1: `deriveBioLinkLabel` util

Reference links are URL-only, but `createBioLinkInputSchema` requires a non-empty `label`. This pure util synthesizes one from the URL's hostname.

**Files:**

- Create: `src/lib/utils/derive-bio-link-label.ts`
- Test: `src/lib/utils/derive-bio-link-label.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `export const deriveBioLinkLabel = (url: string): string` — returns the URL's hostname minus a leading `www.`; returns the raw input string if the URL cannot be parsed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/derive-bio-link-label.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { deriveBioLinkLabel } from './derive-bio-link-label';

describe('deriveBioLinkLabel', () => {
  it('returns the hostname for an http(s) URL', () => {
    expect(deriveBioLinkLabel('https://en.wikipedia.org/wiki/Ceschi')).toBe('en.wikipedia.org');
  });

  it('strips a leading www. from the hostname', () => {
    expect(deriveBioLinkLabel('https://www.pitchfork.com/reviews/x')).toBe('pitchfork.com');
  });

  it('returns the raw input when the URL cannot be parsed', () => {
    expect(deriveBioLinkLabel('not a url')).toBe('not a url');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/utils/derive-bio-link-label.spec.ts`
Expected: FAIL — cannot resolve `./derive-bio-link-label`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/derive-bio-link-label.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Human-ish label for a URL-only reference link: the hostname minus a leading
 * `www.` (e.g. `https://www.pitchfork.com/x` → `pitchfork.com`). Falls back to
 * the raw input when the URL cannot be parsed (defensive — callers pass a value
 * that already passed `isHttpUrl`). Used to give a persisted reference link a
 * non-empty label without asking the admin for one.
 */
export const deriveBioLinkLabel = (url: string): string => {
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/utils/derive-bio-link-label.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/derive-bio-link-label.ts src/lib/utils/derive-bio-link-label.spec.ts
git commit -m "feat: ✨ add deriveBioLinkLabel util"
```

---

## Task 2: `ArtistRepository.findBioLinkByUrl`

A pure query used to dedupe the add-link path. Exact-match on `artistId` + `url`.

**Files:**

- Modify: `src/lib/repositories/artist-repository.ts` (add method next to `createBioLink`, ~line 770)
- Test: `src/lib/repositories/artist-repository.spec.ts` (add `findFirst` to the `artistBioLink` prisma mock ~line 29; add a `describe('findBioLinkByUrl')` block near the existing `describe('createBioLink')` ~line 1082)

**Interfaces:**

- Consumes: `ArtistBioLinkRecord` from `@/lib/types/domain/artist` (already imported in the repo).
- Produces: `static async findBioLinkByUrl(artistId: string, url: string): Promise<ArtistBioLinkRecord | null>`.

- [ ] **Step 1: Write the failing test**

First, add `findFirst: vi.fn(),` to the `artistBioLink` block of the prisma mock in `src/lib/repositories/artist-repository.spec.ts` (the block that currently lists `delete`, `findMany`, `deleteMany`, `create`, `aggregate`):

```ts
    artistBioLink: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
```

Then add this block immediately after the closing `});` of `describe('createBioLink', ...)`:

```ts
describe('findBioLinkByUrl', () => {
  it('returns the matching row for the artist and URL', async () => {
    const row = { id: 'link-7', artistId: 'a1', url: 'https://example.com' };
    vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(row as never);

    const found = await ArtistRepository.findBioLinkByUrl('a1', 'https://example.com');

    expect(prisma.artistBioLink.findFirst).toHaveBeenCalledWith({
      where: { artistId: 'a1', url: 'https://example.com' },
    });
    expect(found).toEqual(row);
  });

  it('returns null when no row matches', async () => {
    vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(null as never);

    const found = await ArtistRepository.findBioLinkByUrl('a1', 'https://none.example');

    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts -t findBioLinkByUrl`
Expected: FAIL — `ArtistRepository.findBioLinkByUrl is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/repositories/artist-repository.ts`, add immediately after the `createBioLink` method (matches the existing `runQuery` + cast pattern used by the neighbouring methods):

```ts
  /** Finds one bio link row for an artist by exact URL, or null when none.
   *  Used to dedupe the admin add-link path so the same URL is never stored
   *  twice (whether it was previously added as custom or discovered). */
  static async findBioLinkByUrl(
    artistId: string,
    url: string
  ): Promise<ArtistBioLinkRecord | null> {
    return runQuery(() =>
      prisma.artistBioLink.findFirst({ where: { artistId, url } })
    ) as Promise<ArtistBioLinkRecord | null>;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/repositories/artist-repository.spec.ts -t findBioLinkByUrl`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/artist-repository.ts src/lib/repositories/artist-repository.spec.ts
git commit -m "feat: ✨ add findBioLinkByUrl repo query"
```

---

## Task 3: Dedupe in `ArtistService.createBioLink`

Business rule: if the artist already has a link with this URL, return it instead of creating a duplicate. Both the reference-links input and the "Add link" editor route through `createArtistBioLinkAction` → this service method, so dedupe here covers both.

**Files:**

- Modify: `src/lib/services/artist-service.ts:876-879` (`createBioLink`)
- Test: `src/lib/services/artist-service.spec.ts` (add `findBioLinkByUrl: vi.fn()` to the `ArtistRepository` mock ~line 64; update + extend `describe('createBioLink')` ~line 2132)

**Interfaces:**

- Consumes: `ArtistRepository.findBioLinkByUrl` (Task 2), `ArtistRepository.createBioLink`, `CreateArtistBioLinkData`, `ArtistBioLinkRecord`.
- Produces: unchanged signature `static async createBioLink(input: CreateArtistBioLinkData): Promise<ArtistBioLinkRecord>` — now idempotent by URL.

- [ ] **Step 1: Write the failing test**

Add `findBioLinkByUrl: vi.fn(),` to the mocked `ArtistRepository` object (next to `createBioLink: vi.fn(),`):

```ts
    createBioLink: vi.fn(),
    findBioLinkByUrl: vi.fn(),
```

Replace the existing `describe('createBioLink', ...)` block with:

```ts
describe('createBioLink', () => {
  it('creates a new row when no existing link has that URL', async () => {
    vi.mocked(ArtistRepository.findBioLinkByUrl).mockResolvedValue(null);
    const row = { id: 'link-1', artistId: 'a1', label: 'Site', url: 'https://cdn/x' };
    vi.mocked(ArtistRepository.createBioLink).mockResolvedValue(row as never);

    const result = await ArtistService.createBioLink({
      artistId: 'a1',
      label: 'Site',
      url: 'https://cdn/x',
    });

    expect(ArtistRepository.findBioLinkByUrl).toHaveBeenCalledWith('a1', 'https://cdn/x');
    expect(ArtistRepository.createBioLink).toHaveBeenCalledWith({
      artistId: 'a1',
      label: 'Site',
      url: 'https://cdn/x',
    });
    expect(result).toBe(row);
  });

  it('returns the existing row and does not create a duplicate URL', async () => {
    const existing = {
      id: 'link-9',
      artistId: 'a1',
      label: 'Existing',
      url: 'https://cdn/x',
      kind: null,
      origin: 'custom',
      sortOrder: 2,
    };
    vi.mocked(ArtistRepository.findBioLinkByUrl).mockResolvedValue(existing);

    const result = await ArtistService.createBioLink({
      artistId: 'a1',
      label: 'Duplicate attempt',
      url: 'https://cdn/x',
    });

    expect(result).toBe(existing);
    expect(ArtistRepository.createBioLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/artist-service.spec.ts -t createBioLink`
Expected: FAIL — the dedupe test fails because the current method always calls `createBioLink` (and `findBioLinkByUrl` is never called).

- [ ] **Step 3: Write minimal implementation**

Replace `ArtistService.createBioLink` (`src/lib/services/artist-service.ts:876-879`) with:

```ts
  /** Persists one admin-authored bio link and returns the created row.
   *  Dedupes by URL: if the artist already has a link with this URL (custom or
   *  generated), returns that existing row instead of creating a duplicate, so
   *  the reference-links input and the Add-link editor stay idempotent. */
  static async createBioLink(input: CreateArtistBioLinkData): Promise<ArtistBioLinkRecord> {
    const existing = await ArtistRepository.findBioLinkByUrl(input.artistId, input.url);
    if (existing) {
      return existing;
    }
    return ArtistRepository.createBioLink(input);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/services/artist-service.spec.ts -t createBioLink`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/artist-service.ts src/lib/services/artist-service.spec.ts
git commit -m "feat: ✨ dedupe bio links by url"
```

---

## Task 4: Persist reference links from the Add handler

Wire the reference-links input so Add both keeps the local seed badge (unchanged) and persists the link to the palette via the create mutation.

**Files:**

- Modify: `src/app/components/forms/artist-bio-generation-section.tsx` (imports; add the mutation hook; extend `addLink`, ~line 167-176)
- Test: `src/app/components/forms/artist-bio-generation-section.spec.tsx` (mock `use-bio-media-mutations`; add one behaviour test)

**Interfaces:**

- Consumes: `deriveBioLinkLabel` (Task 1); `useCreateBioLinkMutation(artistId)` from `@/app/hooks/mutations/use-bio-media-mutations` returning `{ createBioLink, isCreatingBioLink }`; `createBioLink` accepts `{ artistId, label, url, kind? }` (`CreateBioLinkInput`).
- Produces: no exported signature change.

- [ ] **Step 1: Write the failing test**

In `src/app/components/forms/artist-bio-generation-section.spec.tsx`, add this mock next to the existing `vi.mock('@/app/hooks/mutations/use-bio-mutations', ...)` block:

```ts
const createBioLinkMock = vi.fn();
vi.mock('@/app/hooks/mutations/use-bio-media-mutations', () => ({
  useCreateBioLinkMutation: () => ({
    createBioLink: createBioLinkMock,
    isCreatingBioLink: false,
  }),
}));
```

Add `createBioLinkMock.mockReset();` inside the existing `beforeEach` (next to `generateMock.mockReset();`).

Add this test inside `describe('ArtistBioGenerationSection', ...)`:

```ts
  it('persists an added reference link so it joins the palette', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.type(
      screen.getByLabelText(/reference links/i),
      'https://www.pitchfork.com/artist{Enter}'
    );

    expect(createBioLinkMock).toHaveBeenCalledWith({
      artistId: ARTIST_ID,
      label: 'pitchfork.com',
      url: 'https://www.pitchfork.com/artist',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/forms/artist-bio-generation-section.spec.tsx -t "joins the palette"`
Expected: FAIL — `createBioLinkMock` not called (the component does not persist yet).

- [ ] **Step 3: Write minimal implementation**

In `src/app/components/forms/artist-bio-generation-section.tsx`:

Add imports (keep import ordering/grouping consistent with the file — `useCreateBioLinkMutation` beside the existing `use-bio-mutations` import; `deriveBioLinkLabel` in the `@/lib` group):

```ts
import { useCreateBioLinkMutation } from '@/app/hooks/mutations/use-bio-media-mutations';
import { deriveBioLinkLabel } from '@/lib/utils/derive-bio-link-label';
```

Inside the component, next to the existing `useGenerateArtistBioMutation()` / status hooks:

```ts
const { createBioLink } = useCreateBioLinkMutation(artistId);
```

Replace `addLink` (currently lines ~167-176) with:

```ts
const addLink = (): void => {
  const candidate = linkDraft.trim();
  if (!candidate) return;
  if (!isHttpUrl(candidate)) {
    toast.error('Links must start with http:// or https://');
    return;
  }
  const isNew = !links.includes(candidate);
  setLinks((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]));
  setLinkDraft('');
  // Persist a genuinely new reference link as a custom palette row so it is
  // draggable into the editors and survives reload; it still seeds the next
  // generation via `links`. A dup URL is skipped here (the service also
  // dedupes) and errors surface via the mutation hook's toast.
  if (isNew) {
    createBioLink({ artistId, label: deriveBioLinkLabel(candidate), url: candidate });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/components/forms/artist-bio-generation-section.spec.tsx`
Expected: PASS — the new test plus all pre-existing tests in the file (seed forwarding, dup, remove, Enter, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/forms/artist-bio-generation-section.tsx src/app/components/forms/artist-bio-generation-section.spec.tsx
git commit -m "feat: ✨ persist bio reference links"
```

---

## Final verification (run before considering the branch done)

- [ ] **Full gate:**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
```

Expected: all green; `git status` shows only the files from Tasks 1–4 changed (plus any `format` write-backs) and leaves the pre-existing datepicker/date-mask working-tree changes untouched.

- [ ] **Coverage regression check:**

```bash
pnpm run test:coverage:check
```

Expected: branches ≥ baseline in `COVERAGE_METRICS.md` (within tolerance). The new util, repo query, service branch, and component branch are all exercised by the tests above.

- [ ] **Manual smoke (optional, dev):** on `/admin/artists/[artistId]`, add a Reference link → it appears in the Discovered-links palette and is draggable into a bio editor; reload → the link is still in the palette; add the same URL again → no duplicate tile.

## Spec coverage self-check

- Persist on Add → Task 4. Auto-label → Task 1. Live-palette render (no new code — verified `buildBioContent` returns `content` on `hasPersistedMedia`) → covered by design, exercised by Task 4's mutation invalidation (existing hook). Dedupe (both inputs) → Tasks 2 + 3. Seed behaviour unchanged → Task 4 keeps `links`/badges. No schema change → confirmed. All spec "Files touched" map to Tasks 1–4.
