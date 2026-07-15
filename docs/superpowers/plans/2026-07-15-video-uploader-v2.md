# Video Uploader v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the admin video uploader so credits are entered through searchable comboboxes (primary artist, featured artists, producers), the release date can be looked up from the web at upload time, publishing is an explicit action distinct from saving (with future-dated scheduling), Music is the default category, and the ZinePanel loses its right/bottom content border.

**Architecture:** The RHF field `artist` stays the single canonical `"Primary feat. A feat. B"` string; the new artist/featured comboboxes are a structured editor that derives from and recomposes it, so the existing `syncVideoArtists` string-parsing, probe prefill, artist-review, and enrichment paths are untouched. Producers are a brand-new `Producer`/`VideoProducer` vertical mirroring `VideoArtist`, synced on save. The release-date button synchronously invokes a new bio-generator Lambda task that reuses the existing `resolveReleaseDateSuggestion` adjudicator. Scheduling is query-time: the public "published" gate moves from `publishedAt != null` to `publishedAt <= now`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 6 strict, Prisma 6 + MongoDB, TanStack Query 5, React Hook Form 7 + Zod 4, shadcn/ui + Tailwind v4, Vitest 4, Playwright, AWS SDK Lambda v3, bio-generator Lambda (Serper + Gemini).

## Global Constraints

Copied verbatim from the spec and repo guidelines — every task's requirements implicitly include these:

- **Spec:** `docs/superpowers/specs/2026-07-15-video-uploader-v2-design.md`.
- **TDD non-negotiable:** write the failing test, watch it fail, then implement. Every task ships tests.
- **Gate before committing:** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` must all pass.
- **No `any`, no non-null assertion (`!`)**, explicit param + return types, `interface` for object shapes, `as const` over enums.
- **Arrow functions only** (except App Router special files). **Named exports only** (except App Router default-export files).
- **Never suppress lint/type errors** — no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`. Fix the code.
- **Prefer destructuring** including function params. Implicit return for single-expression bodies.
- **Reuse before creating** — search for an existing component/type/util first. UI primitives come from `@/components/ui` (shadcn); icons from `lucide-react`.
- **MPL header** (from `HEADER.txt`) at the top of every new source file.
- **Path aliases:** `@/*`→`src/*`, `@/components/*`→`src/app/components/*`, `@/ui/*`→`src/app/components/ui/*`, `@/hooks/*`→`src/app/hooks/*`, `@/lib/*`→`src/lib/*`, `@/utils/*`→`src/lib/utils/*`.
- **Repository pattern:** all Prisma access through `src/lib/repositories/**`; services hold business logic; components stay presentation-focused. Mutations → Server Actions; queries → API routes wrapped in a `useEntityQuery` hook that forwards the `AbortSignal` and takes a spread-last `QueryOptionsOverride` tail.
- **Vitest globals** (`describe`/`it`/`expect`/`vi`) — never import from `vitest`. Server-only specs start with `vi.mock('server-only', () => ({}))`. One condition per test.
- **Commits:** Conventional Commits `type(scope): <gitmoji> subject`, subject ≤48 visible chars before the gitmoji. **Never** add `Co-authored-by` / AI attribution. Never commit to `main`. Never `--no-verify`.
- **Coverage:** don't regress the `COVERAGE_METRICS.md` baseline (branches ≥95.17%).
- **E2E DB isolation (MANDATORY):** only `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`. Never read `.env*`. Never set/export `DATABASE_URL` from the host shell.
- **Seed ripple lesson (`#LESSONS`):** changing the E2E seed breaks count-pinning specs — before pushing a seed change, `grep` `e2e/tests` for count assertions (`getByText('1[0-9]'`, `published · `) and run those specs locally.
- **`prisma generate` mid-work:** after any `prisma/schema.prisma` edit run `pnpm exec prisma generate` before typecheck (the post-merge hook only fires on committed merges). Do **not** run `prisma db push` in the worktree — it is a deploy-time ops step (see spec §Ops).

## Canonical decisions (from the approved spec — read before Tasks 13–16)

- `Video.artist` remains the source of truth. **`composeArtistString(primary, featured[])`** joins each featured name with its own ` feat. ` token → `"X"`, `"X feat. Y"`, `"X feat. Y feat. Z"`. This is the ONLY encoding that round-trips through the untouched `splitFeaturedArtists` (which splits on `feat.`/`ft.`/`featuring` tokens, never commas). Repeated tokens for 2+ featured is intentional and rare; single-featured (the common case) reads cleanly.
- Producers are their own model — never `VideoArtistRole`. New producers are created on video **save**, not when the pill is added.
- Publishing: **Save never publishes a draft** (strips `publishedAt` from the create/draft payload). **Publish** stamps the date field, or today if empty. On an already-published/scheduled video, **Save persists date-field edits** (it is a normal field then) and an **Unpublish** button (state-only) replaces Publish.
- Scheduling is query-time (`publishedAt <= now`); no cron.

---

## Task 1: ZinePanel — drop right/bottom content border

**Files:**
- Modify: `src/app/components/ui/zine-panel.tsx:82`
- Test: `src/app/components/ui/zine-panel.spec.tsx` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — visual-only change to the existing `ZinePanel`.

- [ ] **Step 1: Write the failing test**

Create/extend `src/app/components/ui/zine-panel.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ZinePanel } from './zine-panel';

describe('ZinePanel', () => {
  it('draws the black border only on the top and left edges', () => {
    render(
      <ZinePanel accent="storm" tape={false} data-testid="panel">
        <p>content</p>
      </ZinePanel>
    );
    const panel = screen.getByTestId('panel');
    expect(panel.className).toContain('border-t-2');
    expect(panel.className).toContain('border-l-2');
    expect(panel.className).not.toContain('border-2');
  });

  it('keeps the accent offset shadow as the right/bottom edge', () => {
    render(
      <ZinePanel accent="storm" tape={false} data-testid="panel">
        <p>content</p>
      </ZinePanel>
    );
    expect(screen.getByTestId('panel').className).toContain('shadow-zine');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/ui/zine-panel.spec.tsx`
Expected: FAIL — className still contains `border-2` (all four sides).

- [ ] **Step 3: Implement the minimal change**

In `src/app/components/ui/zine-panel.tsx`, change the section className (line 82) from:

```tsx
'bg-menu-item-tan-100 shadow-zine relative mt-3 mb-4 w-full overflow-visible rounded-none border-2 border-black',
```

to:

```tsx
'bg-menu-item-tan-100 shadow-zine relative mt-3 mb-4 w-full overflow-visible rounded-none border-t-2 border-l-2 border-black',
```

Update the component's doc comment (lines 62-68) if it mentions a full border; the accent offset shadow (`shadow-zine`) now provides the right/bottom edge.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/ui/zine-panel.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format
git add src/app/components/ui/zine-panel.tsx src/app/components/ui/zine-panel.spec.tsx
git commit -m "style(ui): 🎨 drop zine panel right/bottom border"
```

---

## Task 2: Default the video category to MUSIC

**Files:**
- Modify: `src/app/components/forms/videos/video-form-helpers.ts` (`buildVideoDefaults`, ~line 28)
- Test: `src/app/components/forms/videos/video-form-helpers.spec.ts` (extend; create if absent)

**Interfaces:**
- Consumes: `VideoFormData` from `@/lib/validation/create-video-schema`.
- Produces: `buildVideoDefaults()` now returns `category: 'MUSIC'`.

- [ ] **Step 1: Write the failing test**

```ts
import { buildVideoDefaults } from './video-form-helpers';

describe('buildVideoDefaults', () => {
  it('defaults the category to MUSIC', () => {
    expect(buildVideoDefaults().category).toBe('MUSIC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-form-helpers.spec.ts`
Expected: FAIL — `category` is currently `undefined`.

- [ ] **Step 3: Implement**

In `buildVideoDefaults()` add `category: 'MUSIC',` and remove the now-stale comment clause claiming `category` is intentionally left undefined (keep the `mimeType`-undefined rationale — `mimeType` stays out of the defaults):

```ts
export const buildVideoDefaults = (): DefaultValues<VideoFormData> => ({
  title: '',
  artist: '',
  category: 'MUSIC',
  description: '',
  releasedOn: '',
  durationSeconds: '',
  s3Key: '',
  fileName: '',
  fileSize: '',
  posterUrl: '',
  publishedAt: '',
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-form-helpers.spec.ts`
Expected: PASS.

Note: the E2E test `admin-video-form.spec.ts` asserts `Music` and `Informational` radios render and toggle — still valid (a default checked value does not remove either radio). No E2E change needed here.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/videos/video-form-helpers.ts src/app/components/forms/videos/video-form-helpers.spec.ts
git commit -m "feat(videos): ✨ default category to Music"
```

---

## Task 3: Repository publish-visibility gate (`publishedAt <= now`)

**Files:**
- Modify: `src/lib/repositories/video-repository.ts` (`buildListWhere` ~55-87, `findPublished` ~159, `findManyByIds` ~180, `searchPublished` ~196, `count` ~210)
- Test: `src/lib/repositories/video-repository.spec.ts`

**Interfaces:**
- Consumes: existing `VideoListFilters`, `VideoCountFilters` from `@/lib/types/domain/video`.
- Produces: a new module-level helper `publishedVisibleClause(now: Date): Prisma.VideoWhereInput` → `{ publishedAt: { not: null, lte: now } }`, used by the three public reads and the `count({ published: true })` branch. **Admin listing toggle semantics (`buildListWhere({ published })`) stay presence-based** (`publishedAt != null`) so an admin can still find a scheduled video under the "published" filter.

**Design note:** Only the PUBLIC visibility reads change to `<= now`; the admin listing `published` toggle keeps presence semantics. The dashboard `count({ published: true })` uses `<= now` (a scheduled video counts toward the "draft" side via `total - published`, per spec §6).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/repositories/video-repository.spec.ts` (follow the file's existing prisma-mock pattern — inspect how `findPublished`/`count` are already tested and mirror it):

```ts
describe('publish-visibility gate', () => {
  it('findPublished excludes future-dated (scheduled) videos', async () => {
    // Arrange the prisma.video.findMany mock, then:
    await VideoRepository.findPublished({});
    const where = findManyMock.mock.calls[0][0].where;
    // The published clause now bounds publishedAt at or before "now".
    const publishedClause = where.AND.find(
      (c: { publishedAt?: { lte?: Date } }) => c.publishedAt?.lte instanceof Date
    );
    expect(publishedClause).toBeDefined();
  });

  it('count({ published: true }) bounds publishedAt at or before now', async () => {
    await VideoRepository.count({ published: true });
    const where = countMock.mock.calls[0][0].where;
    expect(where.publishedAt.lte).toBeInstanceOf(Date);
  });

  it('admin listing published filter stays presence-based (not null)', () => {
    // buildListWhere is not exported; assert via a method that uses it with a
    // published toggle, e.g. the admin list read. Confirm the clause is
    // { publishedAt: { not: null } } with NO lte bound.
  });
});
```

If `buildListWhere` is private and hard to assert directly, drive it through the public admin-list method the repository already exposes (inspect the file for the admin listing read, e.g. `findForAdmin`/`list`) and assert its `where`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/repositories/video-repository.spec.ts`
Expected: FAIL — current published clause is `{ publishedAt: { not: null } }` with no `lte`.

- [ ] **Step 3: Implement**

Add the helper near `buildListWhere` and thread `visibleAt` through the public reads. Extend `VideoListFilters` in `src/lib/types/domain/video.ts` with `visibleAt?: Date`.

```ts
// video-repository.ts — new helper above buildListWhere
/** Clause matching videos whose publish date has arrived (public visibility). */
const publishedVisibleClause = (now: Date): Prisma.VideoWhereInput => ({
  publishedAt: { not: null, lte: now },
});
```

In `buildListWhere`, when `filters.visibleAt` is supplied use the visibility clause; otherwise keep the presence toggle:

```ts
const buildListWhere = (filters: VideoListFilters): Prisma.VideoWhereInput => {
  const { search, published, archived, visibleAt } = filters;
  const and: Prisma.VideoWhereInput[] = [];

  if (archived) {
    and.push({ archivedAt: { not: null } });
  } else {
    and.push({ OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] });
  }
  if (visibleAt) {
    and.push(publishedVisibleClause(visibleAt));
  } else if (published === true) {
    and.push({ publishedAt: { not: null } });
  } else if (published === false) {
    and.push({ OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] });
  }
  if (search) {
    and.push({
      OR: [
        { title: containsInsensitive(search) },
        { artist: containsInsensitive(search) },
        { description: containsInsensitive(search) },
      ],
    });
  }

  return { AND: and };
};
```

Change the three public reads to pass `visibleAt: new Date()` instead of `published: true`:

```ts
// findPublished
where: buildListWhere({ visibleAt: new Date() }),
// findManyByIds
where: { ...buildListWhere({ visibleAt: new Date() }), id: { in: ids } },
// searchPublished
where: {
  ...buildListWhere({ visibleAt: new Date() }),
  OR: [{ title: containsInsensitive(q) }, { artist: containsInsensitive(q) }],
},
```

Change `count`'s `published === true` branch:

```ts
static async count(filters: VideoCountFilters = {}): Promise<number> {
  const where: Prisma.VideoWhereInput =
    filters.published === true
      ? publishedVisibleClause(new Date())
      : filters.published === false
        ? { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] }
        : {};
  return runQuery(() => prisma.video.count({ where }));
}
```

Update the doc comments on `findPublished`/`findManyByIds`/`searchPublished`/`count` to say "published and visible (publishedAt ≤ now)". Run `pnpm exec prisma generate` first if types complain.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/repositories/video-repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/repositories/video-repository.ts src/lib/repositories/video-repository.spec.ts src/lib/types/domain/video.ts
git commit -m "feat(videos): ✨ gate public visibility on publish date"
```

---

## Task 4: Admin "Scheduled" badge

**Files:**
- Modify: `src/app/admin/data-views/components/video-admin-card.tsx` (`VideoStatusBadges` ~61-74, `VideoAdminCard` ~81-142)
- Test: `src/app/admin/data-views/components/video-admin-card.spec.tsx` (extend; create if absent)

**Interfaces:**
- Consumes: the admin `video` row (has `publishedAt: Date | null`, `archivedAt: Date | null`).
- Produces: a three-state publish badge — **Draft** (`publishedAt` null), **Scheduled** (`publishedAt` in the future), **Published** (`publishedAt` at/or before now).

- [ ] **Step 1: Write the failing tests**

```tsx
// Render VideoAdminCard with a video whose publishedAt is in the future.
it('shows a Scheduled badge for a future publish date', () => {
  renderCard({ publishedAt: new Date(Date.now() + 86_400_000), archivedAt: null });
  expect(screen.getByText('Scheduled')).toBeInTheDocument();
});

it('shows Published for a past publish date', () => {
  renderCard({ publishedAt: new Date(Date.now() - 86_400_000), archivedAt: null });
  expect(screen.getByText('Published')).toBeInTheDocument();
});

it('shows Draft when publishedAt is null', () => {
  renderCard({ publishedAt: null, archivedAt: null });
  expect(screen.getByText('Draft')).toBeInTheDocument();
});
```

Provide a `renderCard` helper that supplies the required `VideoAdminCard` props (video row + the `onPublish`/`onUnpublish`/`onArchive`/`onRestore`/`onDelete` no-op handlers) — mirror any existing render helper in the spec file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/admin/data-views/components/video-admin-card.spec.tsx`
Expected: FAIL — no "Scheduled" label exists yet.

- [ ] **Step 3: Implement**

Add a pure status helper and a third badge. Replace `VideoStatusBadges` and the `isPublished` derivation:

```tsx
type PublishState = 'draft' | 'scheduled' | 'published';

/** Derive the publish state from a video's publish date relative to now. */
const derivePublishState = (publishedAt: Date | null): PublishState => {
  if (publishedAt === null) return 'draft';
  return publishedAt.getTime() > Date.now() ? 'scheduled' : 'published';
};

const PUBLISH_BADGE: Record<PublishState, { label: string; variant: 'default' | 'secondary' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  published: { label: 'Published', variant: 'default' },
};

const VideoStatusBadges = ({
  publishState,
  isArchived,
}: {
  publishState: PublishState;
  isArchived: boolean;
}): ReactElement => {
  const { label, variant } = PUBLISH_BADGE[publishState];
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={variant}>{label}</Badge>
      {isArchived ? <Badge variant="outline">Archived</Badge> : null}
    </div>
  );
};
```

In `VideoAdminCard`, derive `const publishState = derivePublishState(video.publishedAt);` and pass it to `VideoStatusBadges`. Keep `const isPublished = video.publishedAt !== null;` for the existing publish/unpublish toggle button (`confirmPublish` and the `VideoPublishDialog verb`), since the row action still toggles on presence — a scheduled video is "published enough" to be unpublished.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/admin/data-views/components/video-admin-card.spec.tsx`
Expected: PASS. Also run the file's existing tests to confirm no regression.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/admin/data-views/components/video-admin-card.tsx src/app/admin/data-views/components/video-admin-card.spec.tsx
git commit -m "feat(videos): ✨ scheduled badge in admin list"
```

---

## Task 5: Prisma `Producer` + `VideoProducer` models, domain types, drift guard

**Files:**
- Modify: `prisma/schema.prisma` (add two models after `VideoArtist`; add `videoProducers` to `Video`)
- Create: `src/lib/types/domain/producer.ts`
- Modify: `src/lib/types/domain/index.ts` (export the new module)
- Modify: `src/lib/repositories/video-repository.ts` (add drift guards near line 28)
- Test: covered by drift guards (compile-time) + `src/lib/types/domain/producer.spec.ts` (a trivial shape test)

**Interfaces:**
- Produces: `Producer`, `CreateProducerData`, `VideoProducer` domain types; Prisma models `Producer` and `VideoProducer`; `Video.videoProducers` relation.

- [ ] **Step 1: Write the failing test**

`src/lib/types/domain/producer.spec.ts`:

```ts
import type { Producer, VideoProducer } from './producer';

describe('producer domain types', () => {
  it('a Producer has id + name', () => {
    const p: Producer = {
      id: 'p1',
      name: 'Test Producer',
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(p.name).toBe('Test Producer');
  });

  it('a VideoProducer links a video to a producer', () => {
    const vp: VideoProducer = { id: 'vp1', videoId: 'v1', producerId: 'p1', sortOrder: 0 };
    expect(vp.producerId).toBe('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/types/domain/producer.spec.ts`
Expected: FAIL — module `./producer` does not exist.

- [ ] **Step 3: Implement schema + types**

In `prisma/schema.prisma`, add after the `VideoArtist` model (~line 1069):

```prisma
// Producer catalog — separate from the Artist catalog. Producers are credited
// on videos via VideoProducer join rows (mirrors VideoArtist).
model Producer {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  name      String   @unique
  createdBy String?  @db.ObjectId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  videoProducers VideoProducer[]
}

// Join between a Video and the Producer catalog.
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

Add the relation to the `Video` model (next to `videoArtists`):

```prisma
  videoProducers VideoProducer[] // Linked Producer rows credited on this video
```

Create `src/lib/types/domain/producer.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the `Producer` model. Drift-checked
 * against `Prisma.ProducerGetPayload` in `video-repository`.
 */
export interface Producer {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data accepted by the repository to create a producer. */
export interface CreateProducerData {
  name: string;
  createdBy?: string | null;
}

/**
 * Hand-written mirror of the `VideoProducer` join. Drift-checked against
 * `Prisma.VideoProducerGetPayload` in `video-repository`.
 */
export interface VideoProducer {
  id: string;
  videoId: string;
  producerId: string;
  sortOrder: number;
}

/** Lightweight producer shape returned to the admin form (search + pills). */
export interface ProducerSummary {
  id: string;
  name: string;
}
```

Add to `src/lib/types/domain/index.ts`:

```ts
export * from './producer';
```

Add drift guards in `video-repository.ts` near the existing `_videoDrift` (line 28-29):

```ts
type _ProducerDrift = AssertExact<Producer, Prisma.ProducerGetPayload<Record<string, never>>>;
const _producerDrift: _ProducerDrift = true;
type _VideoProducerDrift = AssertExact<
  VideoProducer,
  Omit<Prisma.VideoProducerGetPayload<Record<string, never>>, 'video' | 'producer'>
>;
const _videoProducerDrift: _VideoProducerDrift = true;
```

Import `Producer` and `VideoProducer` from `@/lib/types/domain` at the top of `video-repository.ts`.

- [ ] **Step 4: Regenerate the client, then run the test**

```bash
pnpm exec prisma generate
pnpm exec vitest run src/lib/types/domain/producer.spec.ts
```
Expected: PASS. If the drift guards fail to compile, reconcile the domain type with the generated payload (they must match field-for-field).

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format
git add prisma/schema.prisma src/lib/types/domain/producer.ts src/lib/types/domain/index.ts src/lib/types/domain/producer.spec.ts src/lib/repositories/video-repository.ts
git commit -m "feat(videos): ✨ producer + video-producer models"
```

---

## Task 6: `ProducerRepository`

**Files:**
- Create: `src/lib/repositories/producer-repository.ts`
- Test: `src/lib/repositories/producer-repository.spec.ts`

**Interfaces:**
- Consumes: `prisma`, `runQuery` (follow the pattern in `video-repository.ts` / `video-artist-repository.ts`), `Producer`/`ProducerSummary`/`CreateProducerData`, `VideoProducer` from `@/lib/types/domain`.
- Produces:
  - `ProducerRepository.search(q: string, take: number): Promise<ProducerSummary[]>` — case-insensitive `name contains`, ordered by name asc.
  - `ProducerRepository.findOrCreateByName(name: string, createdBy?: string): Promise<ProducerSummary>` — unique-name find (case-insensitive) else create; recovers from a duplicate-name race by re-finding.
  - `ProducerRepository.replaceForVideo(videoId: string, producerIds: string[]): Promise<void>` — delete existing joins for the video and insert dense-ordered new ones in a transaction.
  - `ProducerRepository.findByVideoId(videoId: string): Promise<ProducerSummary[]>` — the producers credited on a video (ordered by `sortOrder`), joined to names.

- [ ] **Step 1: Write the failing tests**

Mirror `video-artist-repository.spec.ts` (inspect it for the prisma-mock + `runQuery` mocking pattern). Cover:

```ts
describe('ProducerRepository', () => {
  it('search filters by case-insensitive name contains, ordered asc', async () => {
    await ProducerRepository.search('rick', 10);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'rick', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 10,
      })
    );
  });

  it('findOrCreateByName returns an existing producer without creating', async () => {
    findFirstMock.mockResolvedValue({ id: 'p1', name: 'Rick' });
    const result = await ProducerRepository.findOrCreateByName('Rick');
    expect(createMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'p1', name: 'Rick' });
  });

  it('findOrCreateByName creates when no match exists', async () => {
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: 'p2', name: 'New Producer' });
    const result = await ProducerRepository.findOrCreateByName('New Producer', 'user1');
    expect(createMock).toHaveBeenCalled();
    expect(result.id).toBe('p2');
  });

  it('replaceForVideo deletes prior joins then inserts dense-ordered rows', async () => {
    await ProducerRepository.replaceForVideo('v1', ['p1', 'p2']);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { videoId: 'v1' } });
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        { videoId: 'v1', producerId: 'p1', sortOrder: 0 },
        { videoId: 'v1', producerId: 'p2', sortOrder: 1 },
      ],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/repositories/producer-repository.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CreateProducerData, ProducerSummary } from '@/lib/types/domain/producer';

import { runQuery } from './run-query'; // use the SAME import the other repos use

const producerSummarySelect = { id: true, name: true } as const;

export class ProducerRepository {
  /** Case-insensitive name search for the admin producers combobox. */
  static async search(q: string, take: number): Promise<ProducerSummary[]> {
    return runQuery(() =>
      prisma.producer.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take,
        select: producerSummarySelect,
      })
    );
  }

  /** Find a producer by exact (case-insensitive) name, or create it. */
  static async findOrCreateByName(name: string, createdBy?: string): Promise<ProducerSummary> {
    const trimmed = name.trim();
    const existing = await runQuery(() =>
      prisma.producer.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
        select: producerSummarySelect,
      })
    );
    if (existing) return existing;

    const data: CreateProducerData = { name: trimmed, createdBy: createdBy ?? null };
    try {
      return await runQuery(() =>
        prisma.producer.create({ data, select: producerSummarySelect })
      );
    } catch {
      // Unique-name race: another request created it first — re-find.
      const recovered = await runQuery(() =>
        prisma.producer.findFirst({
          where: { name: { equals: trimmed, mode: 'insensitive' } },
          select: producerSummarySelect,
        })
      );
      if (recovered) return recovered;
      throw new Error(`Failed to create producer "${trimmed}"`);
    }
  }

  /** Replace a video's producer joins with a dense-ordered new set. */
  static async replaceForVideo(videoId: string, producerIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction([
        prisma.videoProducer.deleteMany({ where: { videoId } }),
        prisma.videoProducer.createMany({
          data: producerIds.map((producerId, sortOrder) => ({ videoId, producerId, sortOrder })),
        }),
      ])
    );
  }

  /** Producers credited on a video, ordered by sortOrder. */
  static async findByVideoId(videoId: string): Promise<ProducerSummary[]> {
    const rows = await runQuery(() =>
      prisma.videoProducer.findMany({
        where: { videoId },
        orderBy: { sortOrder: 'asc' },
        select: { producer: { select: producerSummarySelect } },
      })
    );
    return rows.map(({ producer }) => producer);
  }
}
```

Verify the real `runQuery` import path by inspecting an existing repo (e.g. `video-artist-repository.ts`) and match it exactly. If `replaceForVideo` with an empty `producerIds` array must skip `createMany`, guard it (Prisma `createMany` with `data: []` is a no-op but assert against the repo's convention).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/repositories/producer-repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/repositories/producer-repository.ts src/lib/repositories/producer-repository.spec.ts
git commit -m "feat(videos): ✨ producer repository"
```

---

## Task 7: `ProducerService`, query key, rate-limit tier, `GET /api/producers/search`

**Files:**
- Create: `src/lib/services/producer-service.ts`
- Modify: `src/lib/query-keys.ts` (add a top-level `producers` key)
- Modify: `src/lib/config/rate-limit-tiers.ts` (add a producer-search tier)
- Create: `src/app/api/producers/search/route.ts`
- Test: `src/lib/services/producer-service.spec.ts`, `src/app/api/producers/search/route.spec.ts`

**Interfaces:**
- Consumes: `ProducerRepository` (Task 6), `withAdmin`, `withRateLimit`.
- Produces:
  - `ProducerService.search(q: string): Promise<ProducerSummary[]>` (clamps `take`, returns `[]` for < 2 chars).
  - `ProducerService.syncVideoProducers(videoId, producers: Array<{ id?: string; name: string }>, createdBy?): Promise<void>` — resolve each entry (existing `id` kept, otherwise `findOrCreateByName`), dedupe by id, then `replaceForVideo`.
  - `queryKeys.producers.search(query: string)`.
  - `producerSearchLimiter` + `PRODUCER_SEARCH_LIMIT = 20`.
  - `GET /api/producers/search?q=` → `{ results: ProducerSummary[] }`, admin-only, rate-limited.

- [ ] **Step 1: Write the failing tests**

`producer-service.spec.ts`:

```ts
vi.mock('server-only', () => ({});
// mock ProducerRepository

describe('ProducerService.search', () => {
  it('returns [] for a query shorter than 2 chars', async () => {
    expect(await ProducerService.search('a')).toEqual([]);
    expect(ProducerRepository.search).not.toHaveBeenCalled();
  });

  it('delegates to the repository for a valid query', async () => {
    (ProducerRepository.search as Mock).mockResolvedValue([{ id: 'p1', name: 'Rick' }]);
    expect(await ProducerService.search('rick')).toEqual([{ id: 'p1', name: 'Rick' }]);
  });
});

describe('ProducerService.syncVideoProducers', () => {
  it('creates new producers and keeps existing ids, deduped', async () => {
    (ProducerRepository.findOrCreateByName as Mock).mockResolvedValue({ id: 'p2', name: 'New' });
    await ProducerService.syncVideoProducers(
      'v1',
      [{ id: 'p1', name: 'Rick' }, { name: 'New' }],
      'user1'
    );
    expect(ProducerRepository.replaceForVideo).toHaveBeenCalledWith('v1', ['p1', 'p2']);
  });
});
```

`route.spec.ts` (mirror `api/artists/name-lookup/route.spec.ts` for the withAdmin+withRateLimit harness):

```ts
it('returns 200 with results for an admin request', async () => { /* ... */ });
it('returns [] for a short query', async () => { /* ... */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/services/producer-service.spec.ts src/app/api/producers/search/route.spec.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`src/lib/services/producer-service.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ProducerRepository } from '@/lib/repositories/producer-repository';
import type { ProducerSummary } from '@/lib/types/domain/producer';

const MIN_SEARCH_LENGTH = 2;
const SEARCH_TAKE = 10;

/** One producer entry from the admin form: an existing id or a new free-text name. */
export interface ProducerInput {
  id?: string;
  name: string;
}

export class ProducerService {
  /** Search producers by name for the admin combobox. */
  static async search(query: string): Promise<ProducerSummary[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) return [];
    return ProducerRepository.search(trimmed, SEARCH_TAKE);
  }

  /** Resolve the form's producer entries and replace a video's producer joins. */
  static async syncVideoProducers(
    videoId: string,
    producers: ProducerInput[],
    createdBy?: string
  ): Promise<void> {
    const ids: string[] = [];
    for (const entry of producers) {
      const name = entry.name.trim();
      if (!name) continue;
      const resolved =
        entry.id !== undefined
          ? { id: entry.id, name }
          : await ProducerRepository.findOrCreateByName(name, createdBy);
      if (!ids.includes(resolved.id)) ids.push(resolved.id);
    }
    await ProducerRepository.replaceForVideo(videoId, ids);
  }
}
```

`query-keys.ts` — add a top-level `producers` key alongside `videos`/`artists`:

```ts
producers: {
  all: ['producers'] as const,
  search: (query: string) =>
    [...queryKeys.producers.all, 'search', query.trim().toLowerCase()] as const,
},
```

`rate-limit-tiers.ts` — append:

```ts
/** Producer name search (admin video form) — 20 requests per minute. */
export const producerSearchLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const PRODUCER_SEARCH_LIMIT = 20;
```

`src/app/api/producers/search/route.ts` (mirror the name-lookup route's decorator composition):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { PRODUCER_SEARCH_LIMIT, producerSearchLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ProducerService } from '@/lib/services/producer-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

export const GET = withRateLimit(
  producerSearchLimiter,
  PRODUCER_SEARCH_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const query = request.nextUrl.searchParams.get('q') ?? '';
    try {
      const results = await ProducerService.search(query);
      return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Unexpected error in producer search route', { error });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  })
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/services/producer-service.spec.ts src/app/api/producers/search/route.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/services/producer-service.ts src/lib/query-keys.ts src/lib/config/rate-limit-tiers.ts src/app/api/producers
git commit -m "feat(videos): ✨ producer service + search route"
```

---

## Task 8: `useProducersSearchQuery` hook

**Files:**
- Create: `src/app/hooks/use-producers-search-query.ts`
- Test: `src/app/hooks/use-producers-search-query.spec.ts`

**Interfaces:**
- Consumes: `queryKeys.producers.search`, `fetchAndParse`, `QueryOptionsOverride`.
- Produces: `useProducersSearchQuery(query: string, options?: QueryOptionsOverride<ProducerSummary[]>)` → `{ isPending, error, data, refetch }`. Disabled when `query.trim().length < 2`. Forwards the `AbortSignal`.

- [ ] **Step 1: Write the failing test**

Mirror `use-artist-list-query.spec.ts` (mock `fetchAndParse`, wrap in a `QueryClientProvider`):

```ts
it('does not fetch for a query shorter than 2 chars', async () => {
  renderHook(() => useProducersSearchQuery('a'), { wrapper });
  expect(fetchAndParse).not.toHaveBeenCalled();
});

it('fetches and returns parsed results for a valid query', async () => {
  (fetchAndParse as Mock).mockResolvedValue({ results: [{ id: 'p1', name: 'Rick' }] });
  const { result } = renderHook(() => useProducersSearchQuery('rick'), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual([{ id: 'p1', name: 'Rick' }]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/hooks/use-producers-search-query.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const producerSummarySchema = z.object({ id: z.string(), name: z.string() });
const producerSearchResponseSchema = z.object({ results: z.array(producerSummarySchema) });
type ProducerSummary = z.infer<typeof producerSummarySchema>;

const MIN_SEARCH_LENGTH = 2;

const fetchProducerSearch = async (
  query: string,
  signal?: AbortSignal
): Promise<ProducerSummary[]> => {
  const { results } = await fetchAndParse(
    `/api/producers/search?q=${encodeURIComponent(query)}`,
    producerSearchResponseSchema,
    { signal, errorMessage: 'Failed to search producers' }
  );
  return results;
};

/**
 * Search the producer catalog for the admin video form combobox. Disabled for
 * queries under two characters; forwards the AbortSignal for auto-cancellation.
 *
 * @param query - The current combobox search text.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isPending, error, data, refetch }`.
 */
export const useProducersSearchQuery = (
  query: string,
  options: QueryOptionsOverride<ProducerSummary[]> = {}
) => {
  const trimmed = query.trim();
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.producers.search(trimmed),
    queryFn: ({ signal }) => fetchProducerSearch(trimmed, signal),
    enabled: trimmed.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    ...options,
  });
  return { isPending, error, data, refetch };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/hooks/use-producers-search-query.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/hooks/use-producers-search-query.ts src/app/hooks/use-producers-search-query.spec.ts
git commit -m "feat(videos): ✨ producer search query hook"
```

---

## Task 9: `ProducerMultiCombobox` field component

**Files:**
- Create: `src/app/components/forms/fields/producer-multi-combobox.tsx`
- Test: `src/app/components/forms/fields/producer-multi-combobox.spec.tsx`

**Interfaces:**
- Consumes: `useProducersSearchQuery` (Task 8), `useDebounce`, shadcn `Command`/`Popover`/`Badge`/`Button`.
- Produces: a controlled multi-select over producer objects:

```ts
export interface ProducerPill {
  id?: string; // absent = new producer, created on save
  name: string;
}
export interface ProducerMultiComboboxProps {
  value: ProducerPill[];
  onChange: (next: ProducerPill[]) => void;
  label?: string;
  disabled?: boolean;
}
```

Behavior: type to search (debounced 300ms); clicking a result adds `{ id, name }`; typing a name with no exact match and pressing Enter (or clicking "Add \"<name>\"") adds `{ name }` marked new; pills render below with an X to remove; a "new" pill shows a subtle "new" affordance (e.g. an outline `Badge`); duplicates (case-insensitive by name) are ignored.

- [ ] **Step 1: Write the failing tests**

```tsx
it('adds an existing producer from the search results', async () => {
  // mock useProducersSearchQuery to return [{ id: 'p1', name: 'Rick' }]
  const onChange = vi.fn();
  render(<ProducerMultiCombobox value={[]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.type(screen.getByPlaceholderText(/search producers/i), 'rick');
  await userEvent.click(await screen.findByText('Rick'));
  expect(onChange).toHaveBeenCalledWith([{ id: 'p1', name: 'Rick' }]);
});

it('adds a new free-text producer with no id', async () => {
  // mock the query to return []
  const onChange = vi.fn();
  render(<ProducerMultiCombobox value={[]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.type(screen.getByPlaceholderText(/search producers/i), 'Brand New{Enter}');
  expect(onChange).toHaveBeenCalledWith([{ name: 'Brand New' }]);
});

it('renders removable pills and removes on X click', async () => {
  const onChange = vi.fn();
  render(<ProducerMultiCombobox value={[{ id: 'p1', name: 'Rick' }]} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('Remove Rick'));
  expect(onChange).toHaveBeenCalledWith([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/fields/producer-multi-combobox.spec.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Model on `artist-multi-select.tsx` and `multi-combobox.tsx` but hold objects, not ids, and add free-text creation. Keep each subcomponent under the complexity cap (extract the trigger label, the results list, and the pills into named components). Key details:

- Local `search` state → `useDebounce(search, 300)` → `useProducersSearchQuery(debounced, { enabled: open })`.
- `Command` with `shouldFilter={false}` (server filters). `CommandInput` bound to `search`.
- Results map to `CommandItem`s; selecting calls `addPill({ id, name })`.
- A trailing `CommandItem` "Add \"{search}\"" appears when `search.trim()` is non-empty and no result name equals it case-insensitively; selecting it calls `addPill({ name: search.trim() })`. Also bind Enter on the input to the same add-new path.
- `addPill` ignores case-insensitive duplicates by `name`, then `onChange([...value, pill])`.
- Pills: `Badge` per `value` entry with an X button `aria-label={`Remove ${name}`}`; a pill without `id` also renders a small outline `Badge` reading `new`.
- Root trigger is a `Button role="combobox"`; honor `disabled`.

Return type annotated `React.ReactElement`. Include the MPL header and `'use client'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/fields/producer-multi-combobox.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/fields/producer-multi-combobox.tsx src/app/components/forms/fields/producer-multi-combobox.spec.tsx
git commit -m "feat(videos): ✨ producer multi-combobox field"
```

---

## Task 10: Video schema `producers` + action sync wiring

**Files:**
- Create: `src/lib/validation/video-producer-schema.ts`
- Modify: `src/lib/validation/create-video-schema.ts` (add `producers` to `videoFormSchema`)
- Modify: `src/lib/actions/video-action-helpers.ts` (`VIDEO_PERMITTED_FIELD_NAMES` + a `syncVideoProducers` call in `kickPostSaveEnrichment` OR a dedicated helper)
- Modify: `src/lib/actions/create-video-action.ts`, `src/lib/actions/update-video-action.ts` (thread producers into the post-save path)
- Test: `src/lib/validation/video-producer-schema.spec.ts`, plus extend `video-action-helpers.spec.ts`, `create-video-action.spec.ts`, `update-video-action.spec.ts`

**Interfaces:**
- Consumes: `ProducerService.syncVideoProducers` (Task 7).
- Produces: `videoProducerSchema` (`{ id?: string; name: string }`), `VideoFormData.producers?: VideoProducerInput[]`, producers synced on create and update.

**Design note:** Producers sync belongs with the artist sync in `kickPostSaveEnrichment` so it runs in the same `after()` background pass and never fails the admin's save. Add a `producers` field to `KickPostSaveEnrichmentInput` and call `ProducerService.syncVideoProducers` there (best-effort, logged on failure). The update action already gates the kick on `artistChanged || s3KeyReplaced || artistDetailsProvided`; add `|| producersProvided` so a producers-only edit still syncs.

- [ ] **Step 1: Write the failing tests**

`video-producer-schema.spec.ts`:

```ts
import { videoProducerSchema } from './video-producer-schema';

it('accepts an existing producer with id + name', () => {
  expect(videoProducerSchema.safeParse({ id: 'p1', name: 'Rick' }).success).toBe(true);
});
it('accepts a new producer with name only', () => {
  expect(videoProducerSchema.safeParse({ name: 'New' }).success).toBe(true);
});
it('rejects an empty name', () => {
  expect(videoProducerSchema.safeParse({ name: '' }).success).toBe(false);
});
```

Extend `video-action-helpers.spec.ts`:

```ts
it('kickPostSaveEnrichment syncs producers when provided', async () => {
  await kickPostSaveEnrichment({
    videoId: 'v1',
    artist: 'X',
    category: 'INFORMATIONAL',
    reProbe: false,
    producers: [{ name: 'New Producer' }],
  });
  expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
    'v1',
    [{ name: 'New Producer' }],
    undefined
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/validation/video-producer-schema.spec.ts src/lib/actions/video-action-helpers.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/validation/video-producer-schema.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** One producer entry from the admin video form: existing id or new name. */
export const videoProducerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
});

export type VideoProducerInput = z.infer<typeof videoProducerSchema>;
```

In `create-video-schema.ts`, import it and add to `videoFormSchema`:

```ts
producers: z.array(videoProducerSchema).max(20).optional(),
```

In `video-action-helpers.ts`:
- Add `'producers'` to `VIDEO_PERMITTED_FIELD_NAMES`.
- Import `ProducerService` and `VideoProducerInput`.
- Extend `KickPostSaveEnrichmentInput` with `producers?: VideoProducerInput[]` and `createdBy?: string`.
- After the artist sync in `kickPostSaveEnrichment`, add:

```ts
if (producers?.length) {
  try {
    await ProducerService.syncVideoProducers(videoId, producers, createdBy);
  } catch (error) {
    logger.warn('Post-save video producer sync failed', { videoId, error: toMessage(error) });
  }
}
```

In `create-video-action.ts` (`runVideoCreate`, inside the `after()` kick) add `producers: data.producers, createdBy: userId` to the `kickPostSaveEnrichment` call.

In `update-video-action.ts` (`scheduleUpdateEnrichment`) add:

```ts
const producersProvided = (data.producers?.length ?? 0) > 0;
if (!artistChanged && !s3KeyReplaced && !artistDetailsProvided && !producersProvided) return;
after(() =>
  kickPostSaveEnrichment({
    videoId: current.id,
    artist: data.artist,
    category: data.category,
    reProbe: s3KeyReplaced,
    artistDetails: data.artistDetails,
    producers: data.producers,
    createdBy: userId, // thread userId into scheduleUpdateEnrichment's signature
  })
);
```

Thread `userId` into `scheduleUpdateEnrichment(current, data, s3KeyReplaced, userId)` and its call site in `runVideoUpdate`.

Update the client mutation serializer expectation: `objectToFormData` JSON-stringifies the `producers` array and `getActionState` decodes it via the `[`-prefix branch (same mechanism as `artistDetails`) — no `repeatKeys` entry needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/validation/video-producer-schema.spec.ts src/lib/actions/`
Expected: PASS. Fix any updated snapshots of `VIDEO_PERMITTED_FIELD_NAMES` in existing specs.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/validation/video-producer-schema.ts src/lib/validation/create-video-schema.ts src/lib/actions/video-action-helpers.ts src/lib/actions/create-video-action.ts src/lib/actions/update-video-action.ts src/lib/actions/*.spec.ts
git commit -m "feat(videos): ✨ persist producers on save"
```

---

## Task 11: `GET /api/videos/[id]/producers` + `useVideoProducersQuery` (edit prefill)

**Files:**
- Create: `src/app/api/videos/[id]/producers/route.ts`
- Modify: `src/lib/query-keys.ts` (`videos.producers(id)`)
- Create: `src/app/hooks/use-video-producers-query.ts`
- Test: `src/app/api/videos/[id]/producers/route.spec.ts`, `src/app/hooks/use-video-producers-query.spec.ts`

**Interfaces:**
- Consumes: `ProducerRepository.findByVideoId` (Task 6), `withAdmin`, `withRateLimit` (`pollingLimiter`/`POLLING_LIMIT` is fine — read-only admin poll).
- Produces:
  - `GET /api/videos/[id]/producers` → `{ producers: ProducerSummary[] }`, admin-only.
  - `queryKeys.videos.producers(id)`.
  - `useVideoProducersQuery(videoId: string, options?)` → `{ isPending, error, data, refetch }`, disabled when `videoId` empty.

- [ ] **Step 1: Write the failing tests**

Route spec (mirror an existing `api/videos/[id]/*` route spec for the dynamic-param harness — the handler receives `context.params: Promise<{ id: string }>`). Cover a 200 with producers and a 400 for an invalid ObjectId. Hook spec mirrors `use-artist-list-query.spec.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/api/videos/[id]/producers/route.spec.ts src/app/hooks/use-video-producers-query.spec.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

Route:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ProducerRepository } from '@/lib/repositories/producer-repository';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

export const GET = withRateLimit(
  pollingLimiter,
  POLLING_LIMIT
)(
  withAdmin(
    async (
      _request: NextRequest,
      { params }: { params: Promise<{ id: string }> }
    ): Promise<NextResponse> => {
      const { id } = await params;
      if (!isValidObjectId(id)) {
        return NextResponse.json({ error: 'Invalid video id' }, { status: 400 });
      }
      try {
        const producers = await ProducerRepository.findByVideoId(id);
        return NextResponse.json(
          { producers },
          { headers: { 'Cache-Control': 'private, no-store' } }
        );
      } catch (error) {
        logger.error('Unexpected error in video producers route', { error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }
  )
);
```

`query-keys.ts` — add to the `videos` block:

```ts
producers: (id: string) => [...queryKeys.videos.all, 'producers', id] as const,
```

Hook `use-video-producers-query.ts` — mirror the producer-search hook, parse `{ producers: [{id,name}] }`, key `queryKeys.videos.producers(videoId)`, `enabled: videoId.length > 0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/api/videos/[id]/producers/route.spec.ts src/app/hooks/use-video-producers-query.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/api/videos/\[id\]/producers src/lib/query-keys.ts src/app/hooks/use-video-producers-query.ts src/app/hooks/use-video-producers-query.spec.ts
git commit -m "feat(videos): ✨ read a video's producers"
```

---

## Task 12: Wire `ProducerMultiCombobox` into the video form

**Files:**
- Create: `src/app/components/forms/videos/video-producers-section.tsx`
- Modify: `src/app/components/forms/video-form.tsx` (register `producers` field state, mount the section, prefill in edit mode)
- Modify: `src/app/components/forms/videos/video-form-helpers.ts` (`buildVideoDefaults` → `producers: []`; `mapVideoToFormValues` leaves producers to the query)
- Test: `src/app/components/forms/videos/video-producers-section.spec.tsx`

**Interfaces:**
- Consumes: `ProducerMultiCombobox` (Task 9), `useVideoProducersQuery` (Task 11), the RHF `control`/`setValue` for `producers`.
- Produces: a `VideoProducersSection` mounting the combobox bound to the `producers` form field, prefilled from the query in edit mode.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the producers combobox and reflects the field value as pills', () => {
  // Render VideoProducersSection inside a test form whose producers field is
  // [{ id: 'p1', name: 'Rick' }]; assert the Rick pill is visible.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-producers-section.spec.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`video-producers-section.tsx` — a `Controller`/`FormField` over `producers` rendering `ProducerMultiCombobox` (value/onChange bridged to the field):

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Controller } from 'react-hook-form';

import { ProducerMultiCombobox, type ProducerPill } from '@/app/components/forms/fields/producer-multi-combobox';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control } from 'react-hook-form';

interface VideoProducersSectionProps {
  control: Control<VideoFormData>;
}

export const VideoProducersSection = ({
  control,
}: VideoProducersSectionProps): React.ReactElement => (
  <section className="space-y-3">
    <h2 className="font-semibold">Producers</h2>
    <Controller
      control={control}
      name="producers"
      render={({ field }) => (
        <ProducerMultiCombobox
          label="Producers"
          value={(field.value ?? []) as ProducerPill[]}
          onChange={field.onChange}
        />
      )}
    />
  </section>
);
```

In `video-form.tsx`:
- Add `producers: []` to `buildVideoDefaults()` (Task 12 change in helpers).
- In edit mode, prefill: `const { data: producerData } = useVideoProducersQuery(videoId ?? '', { enabled: isEditMode });` and in the existing `useEffect` that runs `form.reset(mapVideoToFormValues(video))`, once producers load `form.setValue('producers', producerData ?? [])` (or extend the reset to include producers when both `video` and `producerData` are ready). Ensure the reset doesn't clobber producers on refetch — set producers via a dedicated effect keyed on `producerData`.
- Mount `<VideoProducersSection control={control} />` after `VideoArtistReviewSection` (credits grouped together).

Add `producers` to the `VideoFormData` defaults typing (it's optional in the schema; default to `[]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-producers-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/videos/video-producers-section.tsx src/app/components/forms/video-form.tsx src/app/components/forms/videos/video-form-helpers.ts src/app/components/forms/videos/video-producers-section.spec.tsx
git commit -m "feat(videos): ✨ producers section in uploader"
```

---

## Task 13: `composeArtistString` util

**Files:**
- Modify: `src/lib/utils/artist-name-split.ts` (add `composeArtistString`)
- Test: `src/lib/utils/artist-name-split.spec.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `composeArtistString(primary: string, featured: string[]): string` — trims inputs, drops empties, joins each featured with a ` feat. ` token so it round-trips through `splitFeaturedArtists`.

- [ ] **Step 1: Write the failing tests**

```ts
import { composeArtistString, splitFeaturedArtists } from './artist-name-split';

describe('composeArtistString', () => {
  it('returns the primary alone when there are no featured', () => {
    expect(composeArtistString('X', [])).toBe('X');
  });
  it('joins a single featured with a feat. token', () => {
    expect(composeArtistString('X', ['Y'])).toBe('X feat. Y');
  });
  it('joins multiple featured each with its own feat. token', () => {
    expect(composeArtistString('X', ['Y', 'Z'])).toBe('X feat. Y feat. Z');
  });
  it('round-trips through splitFeaturedArtists', () => {
    const composed = composeArtistString('X', ['Y', 'Z']);
    const parts = splitFeaturedArtists(composed);
    expect(parts).toEqual([
      { name: 'X', role: 'primary' },
      { name: 'Y', role: 'featured' },
      { name: 'Z', role: 'featured' },
    ]);
  });
  it('trims and drops empty featured entries', () => {
    expect(composeArtistString('  X  ', [' Y ', '', '  '])).toBe('X feat. Y');
  });
  it('returns an empty string for an empty primary', () => {
    expect(composeArtistString('', ['Y'])).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts`
Expected: FAIL — `composeArtistString` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/utils/artist-name-split.ts`:

```ts
/**
 * Compose a primary artist plus featured names into the canonical
 * `Video.artist` string. Each featured name gets its own ` feat. ` token so
 * the result round-trips exactly through {@link splitFeaturedArtists} (which
 * splits only on feat/ft/featuring tokens, never commas). Blank primary yields
 * an empty string; blank featured entries are dropped.
 */
export const composeArtistString = (primary: string, featured: string[]): string => {
  const base = primary.trim();
  if (base === '') return '';
  const extras = featured.map((name) => name.trim()).filter((name) => name !== '');
  return extras.reduce((acc, name) => `${acc} feat. ${name}`, base);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/utils/artist-name-split.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/utils/artist-name-split.ts src/lib/utils/artist-name-split.spec.ts
git commit -m "feat(videos): ✨ compose canonical artist string"
```

---

## Task 14: `ArtistSearchCombobox` (single primary, free-text)

**Files:**
- Create: `src/app/components/forms/fields/artist-search-combobox.tsx`
- Test: `src/app/components/forms/fields/artist-search-combobox.spec.tsx`

**Interfaces:**
- Consumes: `useArtistListQuery` (existing), `useDebounce`, shadcn `Command`/`Popover`/`Button`.
- Produces: a single-select-with-free-text combobox:

```ts
export interface ArtistSearchComboboxProps {
  value: string;               // the current primary artist name (free text)
  onChange: (name: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}
```

Behavior: shows `value` as the trigger label; opening reveals a `CommandInput` (debounced search via `useArtistListQuery({ search }, { enabled: open })`); clicking a result sets `value` to that artist's display name; typing a name and pressing Enter (or "Use \"<name>\"") sets `value` to the free text. It writes a **name string**, not an id — the existing artist-review flow resolves/creates by name on save.

- [ ] **Step 1: Write the failing tests**

```tsx
it('selects an existing artist by display name', async () => {
  // mock useArtistListQuery → [{ id:'a1', displayName:'Real Artist', surname:'Artist' }]
  const onChange = vi.fn();
  render(<ArtistSearchCombobox value="" onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'real');
  await userEvent.click(await screen.findByText('Real Artist'));
  expect(onChange).toHaveBeenCalledWith('Real Artist');
});

it('accepts a free-text primary artist', async () => {
  const onChange = vi.fn();
  render(<ArtistSearchCombobox value="" onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'Nobody Known{Enter}');
  expect(onChange).toHaveBeenCalledWith('Nobody Known');
});

it('shows the current value in the trigger', () => {
  render(<ArtistSearchCombobox value="Existing Name" onChange={vi.fn()} />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Existing Name');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/fields/artist-search-combobox.spec.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Model on `artist-multi-select.tsx` but single-value + free-text, holding a **name string**. Use `useArtistListQuery(buildArtistListParams(debouncedSearch), { enabled: open })` and map rows to display names via the existing `getArtistDisplayName` logic (reuse the helper from `artist-multi-select` if exported, else replicate the tiny `displayName ?? [firstName, surname].join(' ')`). Selecting a row → `onChange(displayName); close`. A trailing "Use \"{search}\"" item + Enter → `onChange(search.trim()); close`. Keep helpers under the complexity cap. `'use client'` + MPL header + `React.ReactElement` return type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/fields/artist-search-combobox.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/fields/artist-search-combobox.tsx src/app/components/forms/fields/artist-search-combobox.spec.tsx
git commit -m "feat(videos): ✨ primary artist search combobox"
```

---

## Task 15: `FeaturedArtistsCombobox` (multi pills, free-text)

**Files:**
- Create: `src/app/components/forms/fields/featured-artists-combobox.tsx`
- Test: `src/app/components/forms/fields/featured-artists-combobox.spec.tsx`

**Interfaces:**
- Consumes: `useArtistListQuery`, `useDebounce`, shadcn primitives.
- Produces:

```ts
export interface FeaturedArtistsComboboxProps {
  value: string[];             // featured artist names (free text allowed)
  onChange: (next: string[]) => void;
  disabled?: boolean;          // disabled until a primary artist is set
  label?: string;
}
```

Behavior mirrors `ProducerMultiCombobox` but holds **name strings** (not objects) and searches artists via `useArtistListQuery`. Clicking a result appends its display name; free text + Enter appends the typed name; pills below with X removal; case-insensitive de-dupe. When `disabled`, render a hint ("Add a primary artist first").

- [ ] **Step 1: Write the failing tests**

```tsx
it('adds a featured artist from search results', async () => { /* select 'Real Artist' → onChange(['Real Artist']) */ });
it('adds a free-text featured artist on Enter', async () => { /* type 'Guest{Enter}' → onChange(['Guest']) */ });
it('removes a featured pill', async () => { /* value ['Guest'] → click Remove Guest → onChange([]) */ });
it('is disabled with a hint when no primary is set', () => {
  render(<FeaturedArtistsCombobox value={[]} onChange={vi.fn()} disabled />);
  expect(screen.getByText(/add a primary artist first/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/fields/featured-artists-combobox.spec.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Reuse the same structure as `ProducerMultiCombobox` (Task 9) but strings + artist search + the disabled hint. Consider extracting a shared internal "pill list" presentational subcomponent if it keeps both under the complexity cap; otherwise duplicate the small pills block. MPL header, `'use client'`, explicit return type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/fields/featured-artists-combobox.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/fields/featured-artists-combobox.tsx src/app/components/forms/fields/featured-artists-combobox.spec.tsx
git commit -m "feat(videos): ✨ featured artists combobox"
```

---

## Task 16: Wire primary + featured comboboxes into the form

**Files:**
- Create: `src/app/components/forms/videos/use-video-artist-fields.ts`
- Modify: `src/app/components/forms/videos/video-metadata-section.tsx` (replace the `artist` TextField with the two comboboxes)
- Modify: `src/app/components/forms/video-form.tsx` (pass the artist-fields controller down)
- Test: `src/app/components/forms/videos/use-video-artist-fields.spec.ts`, update `video-metadata-section.spec.tsx` if present

**Interfaces:**
- Consumes: `splitFeaturedArtists` + `composeArtistString` (Task 13), `ArtistSearchCombobox` (Task 14), `FeaturedArtistsCombobox` (Task 15), RHF `control`/`setValue`, `useWatch`.
- Produces: `useVideoArtistFields({ control, setValue })` →

```ts
interface VideoArtistFields {
  primary: string;
  featured: string[];
  setPrimary: (name: string) => void;
  setFeatured: (names: string[]) => void;
}
```

The hook derives `{ primary, featured }` from the watched `artist` string via `splitFeaturedArtists`, and both setters recompose with `composeArtistString` and `setValue('artist', composed, { shouldDirty: true, shouldValidate: true })`. `artist` stays the single source of truth (probe prefill, `form.reset`, and the artist-review section keep working unchanged).

- [ ] **Step 1: Write the failing tests**

```ts
// use-video-artist-fields.spec.ts — render the hook against a real useForm
it('derives primary and featured from the artist string', () => {
  // set artist to 'X feat. Y' → primary 'X', featured ['Y']
});
it('setPrimary recomposes the artist string preserving featured', () => {
  // start artist 'X feat. Y'; setPrimary('Z') → artist becomes 'Z feat. Y'
});
it('setFeatured recomposes the artist string preserving primary', () => {
  // start artist 'X'; setFeatured(['A','B']) → artist becomes 'X feat. A feat. B'
});
```

Use `renderHook` with a wrapper that provides a `useForm` instance and passes its `control`/`setValue` into the hook; read back `form.getValues('artist')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/videos/use-video-artist-fields.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`use-video-artist-fields.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import { useWatch } from 'react-hook-form';

import { composeArtistString, splitFeaturedArtists } from '@/lib/utils/artist-name-split';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface UseVideoArtistFieldsArgs {
  control: Control<VideoFormData>;
  setValue: UseFormSetValue<VideoFormData>;
}

export interface VideoArtistFields {
  primary: string;
  featured: string[];
  setPrimary: (name: string) => void;
  setFeatured: (names: string[]) => void;
}

/**
 * Structured editor over the canonical `artist` string. Derives the primary
 * name and featured names from the current value; both setters recompose the
 * string and write it back so `artist` stays the single source of truth.
 */
export const useVideoArtistFields = ({
  control,
  setValue,
}: UseVideoArtistFieldsArgs): VideoArtistFields => {
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });

  const { primary, featured } = useMemo(() => {
    const parts = splitFeaturedArtists(artist ?? '');
    const primaryPart = parts.find((p) => p.role === 'primary')?.name ?? '';
    const featuredParts = parts.filter((p) => p.role === 'featured').map((p) => p.name);
    return { primary: primaryPart, featured: featuredParts };
  }, [artist]);

  const write = useCallback(
    (nextPrimary: string, nextFeatured: string[]): void => {
      setValue('artist', composeArtistString(nextPrimary, nextFeatured), {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  const setPrimary = useCallback(
    (name: string): void => write(name, featured),
    [write, featured]
  );
  const setFeatured = useCallback(
    (names: string[]): void => write(primary, names),
    [write, primary]
  );

  return { primary, featured, setPrimary, setFeatured };
};
```

In `video-metadata-section.tsx`: remove the `artist` `TextField`; accept `setValue` in props; call `useVideoArtistFields({ control, setValue })`; render:

```tsx
<ArtistSearchCombobox
  label="Artist / Creator"
  placeholder="Search or type an artist"
  value={primary}
  onChange={setPrimary}
/>
<FeaturedArtistsCombobox
  label="Featured artists"
  value={featured}
  onChange={setFeatured}
  disabled={primary.trim() === ''}
/>
```

Extend `VideoMetadataSectionProps` with `setValue: UseFormSetValue<VideoFormData>` and pass `setValue` from `video-form.tsx` (`<VideoMetadataSection control={control} setValue={setValue} onSelectDate={handleSelectDate} />`).

Note: the existing `VideoArtistReviewSection` still reads `artist` via `useVideoArtistReview(artistValue)` — unchanged. Free-text names in either combobox flow to that section as "new artist" entries exactly as before.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/videos/`
Expected: PASS. Update the metadata-section spec's artist-field assertions (it now renders comboboxes, not a `TextField`). The E2E label `Artist / Creator` is preserved as the combobox label so `admin-video-form.spec.ts`'s `getByLabel('Artist / Creator')` still resolves — verify and adjust the E2E in Task 23 if the label is on a non-input element (use `getByText`/role there).

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/videos/use-video-artist-fields.ts src/app/components/forms/videos/use-video-artist-fields.spec.ts src/app/components/forms/videos/video-metadata-section.tsx src/app/components/forms/video-form.tsx
git commit -m "feat(videos): ✨ artist + featured comboboxes"
```

---

## Task 17: Lambda `release-date-lookup` task

**Files:**
- Modify: `bio-generator/src/types.ts` (add `releaseDateLookupInputSchema` + result type)
- Create: `bio-generator/src/release-date-lookup.ts`
- Modify: `bio-generator/src/handler.ts` (route the new task first, like `isVideoEnrichmentTask`)
- Test: `bio-generator/src/release-date-lookup.spec.ts`, extend `bio-generator/src/handler.spec.ts`

**Interfaces:**
- Consumes: `resolveReleaseDateSuggestion` (existing, `bio-generator/src/release-date.ts`), `getSerperApiKey`, `getGeminiApiKey`, `DEFAULT_GEMINI_MODEL`.
- Produces:
  - `releaseDateLookupInputSchema` = `{ task: 'release-date-lookup', title: string, artist?: string }`.
  - `ReleaseDateLookupResult` = `{ ok: true; result: { releasedOn: string; confidence: 'high'|'medium'|'low'; sources: string[] } | null } | { ok: false; error: string }`.
  - `isReleaseDateLookupTask(event): boolean`.
  - `runReleaseDateLookupLambda(event, deps?): Promise<ReleaseDateLookupResult>`.

- [ ] **Step 1: Write the failing tests**

`release-date-lookup.spec.ts` (mirror the DI/mocking pattern in `video-enrichment.spec.ts`):

```ts
import { runReleaseDateLookupLambda } from './release-date-lookup';

describe('runReleaseDateLookupLambda', () => {
  it('returns a found date from the resolver', async () => {
    const deps = {
      getSerperApiKey: vi.fn().mockResolvedValue('serper'),
      getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue({
        value: '2020-06-01',
        confidence: 'medium',
        sources: [{ url: 'https://example.com' }],
        note: 'x',
      }),
    };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song', artist: 'Band' },
      deps
    );
    expect(out).toEqual({
      ok: true,
      result: { releasedOn: '2020-06-01', confidence: 'medium', sources: ['https://example.com'] },
    });
  });

  it('returns result:null when the resolver finds nothing', async () => {
    const deps = {
      getSerperApiKey: vi.fn().mockResolvedValue('serper'),
      getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(null),
    };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song' },
      deps
    );
    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns ok:false for invalid input', async () => {
    const out = await runReleaseDateLookupLambda({ task: 'release-date-lookup' }, {});
    expect(out.ok).toBe(false);
  });

  it('returns result:null when Serper has no key configured', async () => {
    const deps = { getSerperApiKey: vi.fn().mockResolvedValue(null), getGeminiApiKey: vi.fn() };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song' },
      deps
    );
    expect(out).toEqual({ ok: true, result: null });
  });
});
```

Extend `handler.spec.ts`: an event with `task: 'release-date-lookup'` routes to the lookup (not bio, not video-enrichment).

- [ ] **Step 2: Run tests to verify they fail**

Run (from repo root): `cd bio-generator && pnpm run test:run src/release-date-lookup.spec.ts src/handler.spec.ts; cd ..`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

In `bio-generator/src/types.ts` add:

```ts
export const releaseDateLookupInputSchema = z.object({
  task: z.literal('release-date-lookup'),
  title: z.string().min(1),
  artist: z.string().optional(),
});
export type ReleaseDateLookupInput = z.infer<typeof releaseDateLookupInputSchema>;

export type ReleaseDateLookupResult =
  | {
      ok: true;
      result: { releasedOn: string; confidence: 'high' | 'medium' | 'low'; sources: string[] } | null;
    }
  | { ok: false; error: string };
```

`bio-generator/src/release-date-lookup.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { resolveReleaseDateSuggestion } from './release-date.js';
import { DEFAULT_GEMINI_MODEL, releaseDateLookupInputSchema } from './types.js';

import type { ReleaseDateLookupResult } from './types.js';

/** True when an unknown event is a `task: 'release-date-lookup'` invoke. */
export const isReleaseDateLookupTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'release-date-lookup';

export interface ReleaseDateLookupDeps {
  getSerperApiKey: typeof getSerperApiKey;
  getGeminiApiKey: typeof getGeminiApiKey;
  resolveReleaseDateSuggestion: typeof resolveReleaseDateSuggestion;
}

const defaultDeps: ReleaseDateLookupDeps = {
  getSerperApiKey,
  getGeminiApiKey,
  resolveReleaseDateSuggestion,
};

/**
 * Synchronous release-date lookup for the admin video form. Reuses the video
 * enrichment adjudicator (two Serper searches + one Gemini JSON call) and maps
 * its suggestion to a flat `{ releasedOn, confidence, sources }`. Never throws —
 * a missing Serper key, an adjudication miss, or any failure degrades to
 * `result: null`.
 */
export const runReleaseDateLookupLambda = async (
  event: unknown,
  deps: ReleaseDateLookupDeps = defaultDeps
): Promise<ReleaseDateLookupResult> => {
  const parsed = releaseDateLookupInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  try {
    const serperKey = await deps.getSerperApiKey();
    if (!serperKey) return { ok: true, result: null };
    const geminiKey = await deps.getGeminiApiKey();

    const suggestion = await deps.resolveReleaseDateSuggestion({
      title: parsed.data.title,
      artistDisplay: parsed.data.artist ?? '',
      serperKey,
      geminiKey,
      model: DEFAULT_GEMINI_MODEL,
    });
    if (!suggestion) return { ok: true, result: null };

    return {
      ok: true,
      result: {
        releasedOn: suggestion.value,
        confidence: suggestion.confidence,
        sources: suggestion.sources.map(({ url }) => url),
      },
    };
  } catch (err) {
    logEvent('warn', 'release_date_lookup_failed', { error: toErrorMessage(err) });
    return { ok: false, error: err instanceof Error ? err.message : 'Release date lookup failed' };
  }
};
```

In `handler.ts` `runLambda`, add the routing branch BEFORE the video-enrichment check (order doesn't matter as long as it's before the bio parse):

```ts
import { isReleaseDateLookupTask, runReleaseDateLookupLambda } from './release-date-lookup.js';
// ...
if (isReleaseDateLookupTask(event)) {
  return runReleaseDateLookupLambda(event);
}
if (isVideoEnrichmentTask(event)) {
  return runVideoEnrichmentLambda(event);
}
```

Widen `runLambda`/`lambdaHandler` return unions to include `ReleaseDateLookupResult`.

Confirm `resolveReleaseDateSuggestion`'s `ReleaseDateArgs` accepts calling without `adminReleasedOn` (it is optional — verified in `release-date.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd bio-generator && pnpm run test:run src/release-date-lookup.spec.ts src/handler.spec.ts; cd ..`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
cd bio-generator && pnpm run test:run && cd ..
pnpm run typecheck && pnpm run lint && pnpm run format
git add bio-generator/src/types.ts bio-generator/src/release-date-lookup.ts bio-generator/src/handler.ts bio-generator/src/release-date-lookup.spec.ts bio-generator/src/handler.spec.ts
git commit -m "feat(videos): ✨ lambda release-date lookup task"
```

---

## Task 18: `ReleaseDateLookupService` (web: real invoke + fake path)

**Files:**
- Create: `src/lib/services/release-date-lookup-service.ts`
- Test: `src/lib/services/release-date-lookup-service.spec.ts`

**Interfaces:**
- Consumes: `@aws-sdk/client-lambda` (`LambdaClient`, `InvokeCommand`), `BIO_GENERATOR_LAMBDA_NAME`, `AWS_REGION`, `BIO_GENERATOR_FAKE` (fake gate — same env the enrichment service uses).
- Produces:

```ts
export interface ReleaseDateLookup {
  releasedOn: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}
export class ReleaseDateLookupService {
  static async lookup(title: string, artist?: string): Promise<ReleaseDateLookup | null>;
}
```

Real path: synchronous `InvokeCommand` (`InvocationType: 'RequestResponse'`), parse the JSON payload with a Zod schema, return `result` (or `null`). Fake path (`BIO_GENERATOR_FAKE === 'true'`): return a deterministic fixture `{ releasedOn: '2020-06-01', confidence: 'medium', sources: ['https://musicbrainz.org/'] }`. A Lambda error or a `{ ok: false }` payload throws a typed error the route maps to 502.

- [ ] **Step 1: Write the failing tests**

Mirror the `video-enrichment-service.spec.ts` LambdaClient mock (`sendMock` + class stubs):

```ts
vi.mock('server-only', () => ({});
const sendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class { send = sendMock; },
  InvokeCommand: class { constructor(readonly input: unknown) {} },
}));
vi.mock('@smithy/node-http-handler', () => ({ NodeHttpHandler: class {} }));

describe('ReleaseDateLookupService.lookup', () => {
  it('returns the fixture on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    const result = await ReleaseDateLookupService.lookup('Song', 'Band');
    expect(result?.releasedOn).toBe('2020-06-01');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('invokes the Lambda and parses a found result on the real path', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(
        JSON.stringify({ ok: true, result: { releasedOn: '2019-08-01', confidence: 'high', sources: ['https://x'] } })
      ),
    });
    const result = await ReleaseDateLookupService.lookup('Song', 'Band');
    expect(result).toEqual({ releasedOn: '2019-08-01', confidence: 'high', sources: ['https://x'] });
  });

  it('returns null when the Lambda reports result:null', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: true, result: null })),
    });
    expect(await ReleaseDateLookupService.lookup('Song')).toBeNull();
  });

  it('throws when the Lambda payload is ok:false', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: false, error: 'boom' })),
    });
    await expect(ReleaseDateLookupService.lookup('Song')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/services/release-date-lookup-service.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { z } from 'zod';

import { loggers } from '@/lib/utils/logger';

const logger = loggers.media;
const INVOKE_REQUEST_TIMEOUT_MS = 25_000;

const lookupResultSchema = z.object({
  releasedOn: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});
const lambdaEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), result: lookupResultSchema.nullable() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type ReleaseDateLookup = z.infer<typeof lookupResultSchema>;

const FAKE_RESULT: ReleaseDateLookup = {
  releasedOn: '2020-06-01',
  confidence: 'medium',
  sources: ['https://musicbrainz.org/'],
};

let lambdaClient: LambdaClient | null = null;
const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
    });
  }
  return lambdaClient;
};

export class ReleaseDateLookupService {
  /**
   * Look up a release date from the web via the bio-generator Lambda. Returns
   * the parsed result, or `null` when nothing was found / no provider is
   * configured. Throws when the Lambda invoke fails or reports an error, so the
   * route can surface a 502.
   */
  static async lookup(title: string, artist?: string): Promise<ReleaseDateLookup | null> {
    if (process.env.BIO_GENERATOR_FAKE === 'true') return FAKE_RESULT;

    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      logger.warn('Release date lookup skipped — BIO_GENERATOR_LAMBDA_NAME unset');
      return null;
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({ task: 'release-date-lookup', title, artist })),
    });
    const response = await getLambdaClient().send(command);
    if (!response.Payload) throw new Error('Release date lookup returned no payload');

    const parsed = lambdaEnvelopeSchema.parse(
      JSON.parse(Buffer.from(response.Payload).toString('utf-8'))
    );
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/services/release-date-lookup-service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/services/release-date-lookup-service.ts src/lib/services/release-date-lookup-service.spec.ts
git commit -m "feat(videos): ✨ release-date lookup service"
```

---

## Task 19: Rate-limit tier + `GET /api/videos/release-date-lookup` + query key

**Files:**
- Modify: `src/lib/config/rate-limit-tiers.ts` (release-date lookup tier)
- Create: `src/app/api/videos/release-date-lookup/route.ts`
- Modify: `src/lib/query-keys.ts` (`videos.releaseDateLookup(title, artist)`)
- Test: `src/app/api/videos/release-date-lookup/route.spec.ts`

**Interfaces:**
- Consumes: `ReleaseDateLookupService.lookup` (Task 18), `withAdmin`, `withRateLimit`.
- Produces:
  - `releaseDateLookupLimiter` + `RELEASE_DATE_LOOKUP_LIMIT = 10`.
  - `GET /api/videos/release-date-lookup?title=&artist=` → 200 `{ result: ReleaseDateLookup | null }`; 400 missing/empty `title`; 502 on Lambda failure.
  - `queryKeys.videos.releaseDateLookup(title, artist)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('returns 400 when title is missing', async () => { /* ... */ });
it('returns 200 with the lookup result', async () => {
  // mock ReleaseDateLookupService.lookup → { releasedOn:'2020-06-01', confidence:'medium', sources:[] }
});
it('returns 502 when the service throws', async () => {
  // mock lookup to reject
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/api/videos/release-date-lookup/route.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`rate-limit-tiers.ts` — append:

```ts
/**
 * Release-date web lookup (admin video form) — 10 requests per minute.
 * Each call fans out to Serper + Gemini via the Lambda, so the low cap
 * prevents accidental or deliberate cost storms.
 */
export const releaseDateLookupLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
export const RELEASE_DATE_LOOKUP_LIMIT = 10;
```

`route.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type NextRequest, NextResponse } from 'next/server';

import { RELEASE_DATE_LOOKUP_LIMIT, releaseDateLookupLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { ReleaseDateLookupService } from '@/lib/services/release-date-lookup-service';
import { loggers } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const logger = loggers.media;

export const GET = withRateLimit(
  releaseDateLookupLimiter,
  RELEASE_DATE_LOOKUP_LIMIT
)(
  withAdmin(async (request: NextRequest): Promise<NextResponse> => {
    const { searchParams } = request.nextUrl;
    const title = searchParams.get('title')?.trim();
    const artist = searchParams.get('artist')?.trim() || undefined;

    if (!title) {
      return NextResponse.json({ error: 'A non-empty title is required' }, { status: 400 });
    }

    try {
      const result = await ReleaseDateLookupService.lookup(title, artist);
      return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      logger.error('Release date lookup route failed', { error });
      return NextResponse.json({ error: 'Release date lookup failed' }, { status: 502 });
    }
  })
);
```

`query-keys.ts` — add to `videos`:

```ts
releaseDateLookup: (title: string, artist: string) =>
  [...queryKeys.videos.all, 'releaseDateLookup', title.trim().toLowerCase(), artist.trim().toLowerCase()] as const,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/api/videos/release-date-lookup/route.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/lib/config/rate-limit-tiers.ts src/app/api/videos/release-date-lookup src/lib/query-keys.ts
git commit -m "feat(videos): ✨ release-date lookup route"
```

---

## Task 20: `useReleaseDateLookupQuery` hook

**Files:**
- Create: `src/app/hooks/use-release-date-lookup-query.ts`
- Test: `src/app/hooks/use-release-date-lookup-query.spec.ts`

**Interfaces:**
- Consumes: `queryKeys.videos.releaseDateLookup`, `fetchAndParse`.
- Produces: `useReleaseDateLookupQuery(title: string, artist: string, options?)` → `{ isFetching, error, data, refetch }`. Default **disabled** (`enabled: false`); the caller triggers it via `refetch()`. `data` is `ReleaseDateLookup | null`.

- [ ] **Step 1: Write the failing test**

```ts
it('does not fetch until refetch is called', async () => {
  renderHook(() => useReleaseDateLookupQuery('Song', 'Band'), { wrapper });
  expect(fetchAndParse).not.toHaveBeenCalled();
});
it('fetches and returns the parsed result on refetch', async () => {
  (fetchAndParse as Mock).mockResolvedValue({ result: { releasedOn: '2020-06-01', confidence: 'medium', sources: [] } });
  const { result } = renderHook(() => useReleaseDateLookupQuery('Song', 'Band'), { wrapper });
  await act(async () => { await result.current.refetch(); });
  expect(result.current.data).toEqual({ releasedOn: '2020-06-01', confidence: 'medium', sources: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/hooks/use-release-date-lookup-query.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const lookupResultSchema = z.object({
  releasedOn: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  sources: z.array(z.string()),
});
const responseSchema = z.object({ result: lookupResultSchema.nullable() });
type ReleaseDateLookup = z.infer<typeof lookupResultSchema>;

const fetchLookup = async (
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<ReleaseDateLookup | null> => {
  const params = new URLSearchParams({ title });
  if (artist) params.set('artist', artist);
  const { result } = await fetchAndParse(
    `/api/videos/release-date-lookup?${params.toString()}`,
    responseSchema,
    { signal, errorMessage: 'Failed to look up the release date' }
  );
  return result;
};

/**
 * On-demand web lookup of a video's release date. Disabled by default — call
 * `refetch()` from the "Find release date" button. Returns the parsed result
 * or null; forwards the AbortSignal.
 */
export const useReleaseDateLookupQuery = (
  title: string,
  artist: string,
  options: QueryOptionsOverride<ReleaseDateLookup | null> = {}
) => {
  const {
    isFetching,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.releaseDateLookup(title, artist),
    queryFn: ({ signal }) => fetchLookup(title, artist, signal),
    enabled: false,
    retry: false,
    ...options,
  });
  return { isFetching, error, data, refetch };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/hooks/use-release-date-lookup-query.spec.ts`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/hooks/use-release-date-lookup-query.ts src/app/hooks/use-release-date-lookup-query.spec.ts
git commit -m "feat(videos): ✨ release-date lookup query hook"
```

---

## Task 21: "Find release date" button in the form

**Files:**
- Create: `src/app/components/forms/videos/release-date-field.tsx`
- Modify: `src/app/components/forms/videos/video-metadata-section.tsx` (swap the inline `releasedOn` FormField for `ReleaseDateField`)
- Test: `src/app/components/forms/videos/release-date-field.spec.tsx`

**Interfaces:**
- Consumes: `useReleaseDateLookupQuery` (Task 20), `useWatch` (title + artist), `DatePicker`, `Button`, `toast` (sonner).
- Produces: `ReleaseDateField({ control, onSelectDate })` — the `releasedOn` DatePicker plus a "Find release date" button. Button disabled when `title` is empty or a lookup is in flight; on success fills `releasedOn` via `onSelectDate(result.releasedOn, 'releasedOn')` and toasts confidence + first source; on `null` toasts "No release date found"; on error toasts a destructive message.

- [ ] **Step 1: Write the failing tests**

```tsx
it('disables the find button when the title is empty', () => {
  // render with title '' → button disabled
});
it('fills the release date on a successful lookup', async () => {
  // mock useReleaseDateLookupQuery.refetch → { data: { releasedOn:'2020-06-01', ... } }
  // click Find → onSelectDate called with ('2020-06-01', 'releasedOn')
});
it('toasts when no date is found', async () => {
  // refetch resolves { data: null } → toast 'No release date found'
});
```

Mock `useReleaseDateLookupQuery` and `sonner`'s `toast`. Drive `title` via a wrapping `useForm` with `defaultValues`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/videos/release-date-field.spec.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`release-date-field.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { useReleaseDateLookupQuery } from '@/app/hooks/use-release-date-lookup-query';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control } from 'react-hook-form';

interface ReleaseDateFieldProps {
  control: Control<VideoFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

export const ReleaseDateField = ({
  control,
  onSelectDate,
}: ReleaseDateFieldProps): React.ReactElement => {
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });
  const { isFetching, refetch } = useReleaseDateLookupQuery(title ?? '', artist ?? '');

  const handleFind = useCallback(async (): Promise<void> => {
    const { data } = await refetch();
    if (!data) {
      toast.info('No release date found');
      return;
    }
    onSelectDate(data.releasedOn, 'releasedOn');
    toast.success(
      `Found ${data.releasedOn} (${data.confidence} confidence)${data.sources[0] ? ` — ${data.sources[0]}` : ''}`
    );
  }, [refetch, onSelectDate]);

  return (
    <FormField
      control={control}
      name="releasedOn"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Release date</FormLabel>
          <div className="flex items-end gap-2">
            <FormControl>
              <DatePicker fieldName={field.name} onSelect={onSelectDate} value={field.value} />
            </FormControl>
            <Button
              type="button"
              variant="outline"
              onClick={handleFind}
              disabled={!title?.trim() || isFetching}
            >
              {isFetching ? 'Searching…' : 'Find release date'}
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
```

In `video-metadata-section.tsx`, replace the inline `releasedOn` `FormField` (lines 70-82) with `<ReleaseDateField control={control} onSelectDate={onSelectDate} />`. Keep the `durationSeconds` field beside it in the grid.

Note: the toast catch path — because the hook has `retry: false` and `refetch()` resolves with the query result, wrap `handleFind` so a rejected fetch (surfaced as `refetch()` resolving with `data: undefined` and an `error`) still toasts. If `refetch()` can reject, wrap in try/catch and `toast.error('Release date lookup failed')`. Verify against TanStack Query 5 `refetch` semantics and add the branch a test covers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/videos/release-date-field.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/videos/release-date-field.tsx src/app/components/forms/videos/video-metadata-section.tsx src/app/components/forms/videos/release-date-field.spec.tsx
git commit -m "feat(videos): ✨ find release date button"
```

---

## Task 22: Publish flow — Save / Publish / Unpublish footer semantics

**Files:**
- Modify: `src/app/components/forms/videos/video-form-footer.tsx` (Save + Publish/Unpublish + confirm)
- Modify: `src/app/components/forms/video-form.tsx` (publish/unpublish handlers; strip `publishedAt` on draft Save)
- Modify: `src/app/components/forms/videos/video-publish-section.tsx` (relabel + helper text)
- Test: `src/app/components/forms/videos/video-form-footer.spec.tsx`, extend `video-form` integration coverage

**Interfaces:**
- Consumes: `usePublishVideoMutation`, `useUnpublishVideoMutation` (existing), the existing create/update submit path.
- Produces: publish semantics per the spec §6 table.

**Design — how "Save ≠ publish" is enforced (client-side payload shaping):**
- **Create/draft** (`video?.publishedAt` is null/absent, or create mode): footer shows **Save** + **Publish**.
  - **Save** submits with `publishedAt` forced to `''` (stripped) → stays a draft even if the date field has a value.
  - **Publish** submits with `publishedAt` = the date field value, or today (`formatDateForForm(new Date())`) when empty.
- **Published/scheduled** (`video?.publishedAt` set, edit mode): footer shows **Save** + **Unpublish**.
  - **Save** submits normally (date field is a normal field; editing/moving it persists).
  - **Unpublish** calls `unpublishVideoAction` via the mutation (state-only). If the form is dirty, first confirm via a shadcn dialog noting other edits won't be saved.

Implementation approach: the form's submit currently calls one `onValidSubmit`. Introduce an intent flag. Two clean options — pick one and keep it under the complexity cap:
- (a) Two submit buttons that set a `submitIntentRef` (`'save' | 'publish'`) before `form.handleSubmit` runs; `onValidSubmit` reads it and shapes `publishedAt`.
- (b) Separate click handlers that build the payload and call `createVideoAsync`/`updateVideoAsync` directly.

Prefer (a): keep `type="submit"` for Save (default intent `'save'`) and a `type="submit"` Publish button whose `onClick` sets intent `'publish'` before submit. In `onValidSubmit`, apply:

```ts
const shapePublish = (data: VideoFormData, intent: 'save' | 'publish', isDraft: boolean): VideoFormData => {
  if (intent === 'publish') {
    return { ...data, publishedAt: data.publishedAt || formatDateForForm(new Date()) };
  }
  // Save: never publish a draft — strip the date so a typed value can't publish it.
  return isDraft ? { ...data, publishedAt: '' } : data;
};
```

where `isDraft = !video?.publishedAt` (create mode → true). Unpublish is a separate handler calling the unpublish mutation then `router.push`/refetch.

- [ ] **Step 1: Write the failing tests**

Footer spec:

```tsx
it('shows Save and Publish for a draft', () => {
  render(<VideoFormFooter mode="draft" isSubmitting={false} isUploading={false} onCancel={vi.fn()} onPublish={vi.fn()} onUnpublish={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
});
it('shows Save and Unpublish for a published video', () => {
  render(<VideoFormFooter mode="published" isSubmitting={false} isUploading={false} onCancel={vi.fn()} onPublish={vi.fn()} onUnpublish={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
});
```

Payload-shaping unit test for `shapePublish` (extract it to `video-form-helpers.ts` so it is unit-testable):

```ts
it('Save strips publishedAt on a draft', () => {
  expect(shapePublish({ ...base, publishedAt: '2026-09-01' }, 'save', true).publishedAt).toBe('');
});
it('Publish stamps today when the date is empty', () => {
  expect(shapePublish({ ...base, publishedAt: '' }, 'publish', true).publishedAt).toBe(formatDateForForm(new Date()));
});
it('Save persists the date on an already-published video', () => {
  expect(shapePublish({ ...base, publishedAt: '2026-09-01' }, 'save', false).publishedAt).toBe('2026-09-01');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/components/forms/videos/video-form-footer.spec.tsx src/app/components/forms/videos/video-form-helpers.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add `shapePublish` (and its `formatDateForForm` reuse) to `video-form-helpers.ts` with the body above.
- Rework `VideoFormFooter` to accept `mode: 'draft' | 'published'`, `onPublish`, `onUnpublish` and render the correct button pair. Keep the upload/submitting disabled logic. Wrap Unpublish in an `AlertDialog` (shadcn) that only gates when the form is dirty (pass an `isDirty` prop; if clean, unpublish directly).
- In `video-form.tsx`: track submit intent (a `useRef<'save' | 'publish'>`), set it in the Publish button's `onClick`, read it in `onValidSubmit`, and apply `shapePublish(data, intent, isDraft)` before `submitVideo`. Add `handleUnpublish` calling `useUnpublishVideoMutation().unpublishVideoAsync({ videoId })` then navigate/refetch. Compute `mode` from `video?.publishedAt`.
- In `video-publish-section.tsx`: keep the date field, relabel description to explain: "Publish stamps this date (or today if empty). Leave empty and click Save to keep it a draft. A future date schedules the video." Keep it accessible.

Keep each function under the complexity cap — extract the intent handling and the unpublish confirm into small named helpers/components.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/components/forms/videos/`
Expected: PASS. Update `admin-video-form.spec.ts` (E2E, Task 23) for the new Publish button.

- [ ] **Step 5: Gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format
git add src/app/components/forms/videos/video-form-footer.tsx src/app/components/forms/video-form.tsx src/app/components/forms/videos/video-publish-section.tsx src/app/components/forms/videos/video-form-helpers.ts src/app/components/forms/videos/*.spec.*
git commit -m "feat(videos): ✨ explicit publish + unpublish"
```

---

## Task 23: E2E coverage + seed + finalization

**Files:**
- Modify: `e2e/tests/admin-video-form.spec.ts` (comboboxes, producers, find-date, publish/save/unpublish)
- Create: `e2e/tests/admin-video-publish-scheduling.spec.ts` (schedule → hidden publicly → arrives) — optional but recommended
- Modify: `e2e/helpers/seed-test-db.ts` (add one `Producer` row so the producers combobox has a searchable match; do NOT change video counts)
- Modify: `CLAUDE.md` (#LESSONS — add any new gotcha discovered)
- Test: the E2E specs themselves

**Interfaces:**
- Consumes: everything above. The web server runs with `BIO_GENERATOR_FAKE=true` in E2E so the "Find release date" button returns the deterministic fixture (verify the E2E env already sets it, as the enrichment fixture path relies on the same gate; if not, the button test asserts the disabled/empty-title branch only, and the fixture-fill is asserted in a unit test).

- [ ] **Step 1: Write the failing E2E assertions**

Extend `admin-video-form.spec.ts` create test:
- Primary artist combobox: open, type a seeded artist name (e.g. `E2E Artist One`), select it; assert the trigger shows it.
- Featured combobox: assert disabled until a primary is set; after setting primary, add a free-text featured name; assert a removable pill appears.
- Producers combobox: add a seeded producer (search) + a new free-text producer; assert both pills; remove one.
- Find release date: with `BIO_GENERATOR_FAKE=true`, fill title, click "Find release date", assert the date field becomes non-empty (fixture `2020-06-01`). Codec/locale-agnostic — assert the input value changed, not a specific toast.
- Category: assert Music is pre-checked on load.
- Footer: assert **Save** and **Publish** both render for a new video.

Publish/scheduling spec (new file, if the seed + fake env permit a full flow) — otherwise assert the admin badge states from seeded rows:
- A future-dated video (seed or created via UI) shows a **Scheduled** badge in `/admin/videos` and does NOT appear on public `/videos`.
- Use the seed's existing published rows for the "Published visible" assertion.

- [ ] **Step 2: Run the specs to verify they fail**

```bash
pnpm run e2e:docker:up
pnpm run test:e2e -- admin-video-form
```
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement seed + spec**

- In `seed-test-db.ts`, add ONE producer near the video seed (a `prisma.producer.create({ data: { name: 'E2E Producer One' } })`), and — only if a scheduling spec needs it — one future-dated video. If you add a future-dated published video, its `publishedAt` is `> now`, so `count({published:true})` drops it from the published bucket → the dashboard tile count changes. **Per `#LESSONS`, before pushing, grep `e2e/tests` for count-pins** (`getByText('1[0-9]'`, `published · `) and update `admin-dashboard.spec.ts` math accordingly (or avoid a future-dated seed row and drive scheduling entirely through the UI in the publish spec). Prefer the UI-driven approach to keep dashboard counts stable.
- Update `admin-video-form.spec.ts` for the combobox-based artist entry (the label `Artist / Creator` is now on the combobox trigger, not an `<input>` — use `getByText`/role instead of `getByLabel` if needed).
- Add the new spec file if pursuing the full scheduling flow.

- [ ] **Step 4: Run E2E to verify pass**

```bash
pnpm run test:e2e -- admin-video-form admin-dashboard admin-videos
pnpm run e2e:docker:down
```
Expected: PASS. Run the neighboring specs (dashboard, admin videos, playlists) locally per `#LESSONS`.

- [ ] **Step 5: Full gate + commit**

```bash
pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format && pnpm run test:coverage:check
git add e2e CLAUDE.md
git commit -m "test(videos): ✅ uploader v2 e2e + seed"
```

---

## Self-Review (completed against the spec)

- **§1 Data model** → Task 5 (Producer + VideoProducer + domain types + drift). ✓
- **§2 Artist entry (3 controls, canonical string)** → Tasks 13 (compose), 14 (primary), 15 (featured), 16 (wire + derive/recompose). Featured-disabled-until-primary → Task 15/16. ✓
- **§3 Producers vertical** → Tasks 6 (repo), 7 (service/route/tier/key), 8 (hook), 9 (field), 10 (schema + save sync), 11 (edit prefill), 12 (form wiring). New-on-save → Task 10. ✓
- **§4 Release-date lookup (Lambda + web + button)** → Tasks 17 (lambda), 18 (service + fake), 19 (route/tier/key), 20 (hook), 21 (button). ✓
- **§5 Category default MUSIC** → Task 2. ✓
- **§6 Publish flow + scheduling** → Tasks 3 (repo `<= now` gate + count), 4 (Scheduled badge), 22 (Save/Publish/Unpublish semantics). ✓
- **§7 ZinePanel border** → Task 1. ✓
- **§8 Error handling** → 502 on Lambda failure (Task 19); malformed payload → throw→502 (Task 18); producer sync best-effort in `after()` (Task 10); combobox degrade to free text (Tasks 9/14/15). ✓
- **§9 Testing** → each task is TDD; E2E in Task 23. ✓
- **§Ops** → `prisma db push` + Bio Generator deploy called out in Global Constraints + Task 5/17 notes; no new web env vars. ✓

**Type consistency check:** `ProducerSummary` (`{id,name}`) is the shared producer wire shape across Tasks 6/7/8/9/11/12; `ProducerPill`/`ProducerInput`/`VideoProducerInput` all reduce to `{ id?: string; name: string }`. `ReleaseDateLookup` (`{releasedOn, confidence, sources}`) is identical across Tasks 18/19/20/21. `composeArtistString`/`splitFeaturedArtists` are the sole artist-string codec (Tasks 13/16). `publishedVisibleClause`/`visibleAt` naming is consistent in Task 3. No dangling references.

**Placeholder scan:** none — every code step carries real code or an explicit "mirror file X" instruction with the exact pattern to copy.
