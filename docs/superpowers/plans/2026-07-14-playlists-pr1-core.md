# Playlists PR1 (`feat/playlists-core`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Playlist data model, backend (repositories, service, actions, search + list/detail API routes), and the full My Playlists page with the playlist creator, save dialog, drag-sort, and CRUD — everything except the player dialog/downloads (PR2) and the global player menu (PR3).

**Architecture:** Prisma models `Playlist`/`PlaylistItem` (snapshot display fields + live joins at read time); repository pattern → `PlaylistService` (ownership, snapshots, duplicate/force, unified 5-group media search) → thin Server Actions (mutations) + API routes (GET). Client: TanStack Query hooks + a creator state machine (`draft`→`saved`→`editing`) with a cmdk grouped search combobox, dnd-kit sorting, and an RHF+Zod save dialog with tiled cover art.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, Prisma 6 + MongoDB, better-auth, TanStack Query 5, RHF + Zod 4, shadcn/ui (cmdk, Radix), @dnd-kit, sonner, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-playlists-design.md` (committed in Task 1). Read it before starting any task.

## Global Constraints

- Worktree: all paths relative to `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat-playlists-core`. Branch `feat/playlists-core`. NEVER edit the main checkout.
- TDD non-negotiable: spec first, watch it fail, implement, watch it pass, commit.
- MPL header from `HEADER.txt` at the top of every new source file.
- Named exports; arrow functions (`const f = () => …`); no `any`; no non-null `!`; no eslint-disable/ts-ignore; complexity ≤10 per function (extract helpers proactively); destructure params.
- `describe/it/expect/vi` are globals — never import from 'vitest'. Server-only specs start with `vi.mock('server-only', () => ({}))`.
- Path aliases only (`@/lib/*`, `@/hooks/*`, `@/components/*`, `@/ui/*`).
- Commits: `type(scope): <gitmoji> subject` — subject ≤48 visible chars before the emoji; NO AI attribution lines; never commit to main. Pre-commit hooks run lint-staged + changed tests automatically; do not bypass.
- Never read `.env*`; never run anything against a non-local DB. `pnpm exec prisma generate` needs no DB.
- Constants (Task 2): `MAX_PLAYLIST_ITEMS = 200`, `MAX_PLAYLIST_COVER_IMAGES = 4`, `MAX_PLAYLIST_COVER_IMAGE_BYTES = 10 * 1024 * 1024`, `PLAYLIST_SEARCH_GROUP_LIMIT = 8`, `PLAYLIST_SEARCH_MIN_QUERY_LENGTH = 2`, `PLAYLISTS_PAGE_SIZE = 24`.

## Shared contracts (single source of truth — later tasks must match exactly)

```ts
// Domain (src/lib/types/domain/playlist.ts)
export type PlaylistItemType = 'track' | 'video';
export interface PlaylistRecord {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface PlaylistItemRecord {
  id: string;
  playlistId: string;
  itemType: PlaylistItemType;
  trackFileId: string | null;
  releaseId: string | null;
  videoId: string | null;
  title: string;
  artistName: string;
  duration: number;
  sortOrder: number;
  addedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface CreatePlaylistData {
  ownerId: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
}
export interface UpdatePlaylistData {
  title?: string;
  isPublic?: boolean;
  coverImages?: string[];
}
export interface AddPlaylistItemData {
  itemType: PlaylistItemType;
  trackFileId: string | null;
  releaseId: string | null;
  videoId: string | null;
  title: string;
  artistName: string;
  duration: number;
}

// Item source ref — what the client sends; server re-resolves all snapshots
export interface PlaylistItemSourceRef {
  itemType: PlaylistItemType;
  trackFileId?: string;
  videoId?: string;
}

// API payloads (Zod-inferred in src/lib/validation/playlist-schema.ts)
export interface PlaylistListRow {
  id: string;
  title: string;
  isPublic: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  updatedAt: string; // ISO
}
export interface PlaylistsResponse {
  rows: PlaylistListRow[];
  nextSkip: number | null;
}
export interface PlaylistItemPayload {
  id: string;
  itemType: PlaylistItemType;
  sortOrder: number;
  title: string;
  artistName: string;
  duration: number;
  available: boolean;
  trackFileId: string | null;
  releaseId: string | null;
  releaseTitle: string | null;
  videoId: string | null;
  coverArt: string | null; // track → release.coverArt; video → posterUrl
}
export interface PlaylistDetailResponse {
  id: string;
  title: string;
  isPublic: boolean;
  isOwner: boolean;
  coverImages: string[];
  itemCount: number;
  totalDuration: number;
  items: PlaylistItemPayload[];
}
export interface PlaylistSearchItem {
  key: string;
  itemType: PlaylistItemType;
  title: string;
  artistName: string | null;
  coverArt: string | null;
  duration: number | null;
  source: { trackFileId: string; releaseId: string } | { videoId: string };
  context?: string;
}
export type PlaylistSearchGroupKey =
  | 'songs'
  | 'videos'
  | 'publicPlaylists'
  | 'releases'
  | 'artistMatch';
export interface PlaylistSearchResponse {
  groups: Array<{ key: PlaylistSearchGroupKey; label: string; items: PlaylistSearchItem[] }>;
}

// Action results
export type PlaylistActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
// addPlaylistItemAction duplicate signal: { success: false, error: 'DUPLICATE_ITEM' }

// Cover upload action result data
export interface PlaylistCoverUploadTarget {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}
```

Query keys (Task 4): `queryKeys.playlists.all = ['playlists']`, `.mine()`, `.detail(id)`, `.mediaSearch(q)` (q trimmed/lowercased).

## Pattern files (read before implementing the matching task)

- Repository: `src/lib/repositories/video-repository.ts` (drift guards, runQuery, translators)
- Service: `src/lib/services/download-authorization-service.ts` (shape only)
- Actions: `src/lib/actions/tour-actions.ts`, `src/lib/actions/presigned-upload-actions.ts`
- Routes: `src/app/api/releases/route.ts` (+ its `route.spec.ts`), `src/app/api/artists/search/route.ts`
- Hooks: `src/app/hooks/use-infinite-published-releases-query.ts`, `use-artist-nav-search-query.ts`, `use-tour-date-mutations.ts`, `fetch-and-parse.ts`, `query-options.ts`
- Combobox: `src/app/components/release-search-combobox.tsx`
- DnD: `src/app/admin/tours/components/artist-pill-list.tsx`, `src/app/components/ui/sortable-image-item.tsx`
- Dialog form: `src/app/admin/tours/components/tour-date-form.tsx`; AlertDialog: `src/app/admin/tours/components/tour-date-list.tsx` (~327–343)
- Page shell: `src/app/videos/page.tsx`; content island: `src/app/components/videos-content.tsx` (if present) / `home-content.tsx`
- Rate limits: `src/lib/config/rate-limit-tiers.ts`

---

### Task 1: Commit spec + plan docs

**Files:** Create: `docs/superpowers/specs/2026-07-14-playlists-design.md`, `docs/superpowers/plans/2026-07-14-playlists-pr1-core.md` (already written to disk).

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-07-14-playlists-design.md docs/superpowers/plans/2026-07-14-playlists-pr1-core.md
git commit -m "docs(playlists): 📝 add design spec and PR1 plan"
```

### Task 2: Prisma schema, constants, domain types

**Files:**

- Modify: `prisma/schema.prisma` (add `Playlist`, `PlaylistItem` exactly as in the spec's Data model section; add `playlists Playlist[]` back-relation to `model User`)
- Create: `src/lib/constants/playlists.ts` (constants from Global Constraints, each `as const`-typed number with a JSDoc line)
- Create: `src/lib/types/domain/playlist.ts` (domain block from Shared contracts, with JSDoc)
- Modify: `src/lib/types/domain/index.ts` (add `export * from './playlist';` matching existing style)

**Interfaces:** Produces the Prisma models + domain types every backend task consumes. Types/constants are coverage-exempt (no spec files needed — config/types excluded per repo policy).

- [ ] **Step 1: Edit the four files** (schema models verbatim from spec)
- [ ] **Step 2: Regenerate client + typecheck**
      Run: `pnpm exec prisma generate && pnpm run typecheck`
      Expected: generate succeeds; typecheck clean.
- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma src/lib/constants/playlists.ts src/lib/types/domain/playlist.ts src/lib/types/domain/index.ts
git commit -m "feat(playlists): ✨ add schema, domain types, constants"
```

Note: `prisma db push` is NOT run here (no dev-DB access from tasks). E2E harness pushes schema to the Docker Mongo itself; prod push is a post-merge op.

### Task 3: Validation + response schemas

**Files:**

- Create: `src/lib/validation/playlist-schema.ts`
- Test: `src/lib/validation/playlist-schema.spec.ts`

**Interfaces (Produces):**

- `playlistTitleSchema` — `z.string().trim().min(1).max(120)`
- `coverImagesSchema` — `z.array(z.string().min(1).max(2048)).max(MAX_PLAYLIST_COVER_IMAGES)`
- `playlistItemSourceRefSchema` — discriminated union on `itemType`: `'track'` requires ObjectId `trackFileId`; `'video'` requires ObjectId `videoId` (reuse the repo's existing ObjectId validator — grep `isValidObjectId` / `objectIdSchema` in `src/lib/validation/` and reuse it)
- `createPlaylistInputSchema` — `{ title, isPublic: z.boolean(), coverImages: coverImagesSchema.default([]), items: z.array(playlistItemSourceRefSchema).max(MAX_PLAYLIST_ITEMS).default([]) }`
- `updatePlaylistInputSchema` — `{ playlistId: objectId, title?, isPublic?, coverImages? }` (at least one mutable field: `.refine`)
- `addPlaylistItemInputSchema` — `{ playlistId: objectId, force: z.boolean().default(false) }` merged with `playlistItemSourceRefSchema`
- `reorderPlaylistItemsInputSchema` — `{ playlistId, orderedItemIds: z.array(objectId).min(1).max(MAX_PLAYLIST_ITEMS) }` + `.refine` unique ids
- `playlistCoverUploadInputSchema` — `{ playlistId, files: z.array({ fileName: z.string().min(1).max(255), contentType: z.enum(['image/jpeg','image/png','image/webp','image/gif']), fileSize: z.number().int().positive().max(MAX_PLAYLIST_COVER_IMAGE_BYTES) }).min(1).max(4) }`
- Response schemas + inferred types per Shared contracts: `playlistListRowSchema`, `playlistsResponseSchema`, `playlistItemPayloadSchema`, `playlistDetailResponseSchema`, `playlistSearchItemSchema`, `playlistSearchResponseSchema` (export the inferred TS types with the exact names from Shared contracts).

- [ ] **Step 1: Write failing spec** — cases: title trims + rejects empty/121 chars; coverImages rejects 5 entries; source ref rejects track-without-trackFileId, video-with-trackFileId-only, malformed ObjectId; create defaults (`coverImages: []`, `items: []`); update requires ≥1 field; reorder rejects duplicate ids; cover upload rejects `image/svg+xml`, 11 MB, 5 files; each response schema round-trips a valid fixture and rejects a missing required field.
- [ ] **Step 2:** `pnpm run test:run src/lib/validation/playlist-schema.spec.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the schemas.
- [ ] **Step 4:** re-run → PASS.
- [ ] **Step 5: Commit** — `feat(playlists): ✨ add zod schemas for playlists`

### Task 4: Query keys + rate-limit tier

**Files:**

- Modify: `src/lib/query-keys.ts` — add:

```ts
playlists: {
  all: ['playlists'] as const,
  mine: () => [...queryKeys.playlists.all, 'mine'] as const,
  detail: (id: string) => [...queryKeys.playlists.all, 'detail', id] as const,
  mediaSearch: (q: string) => [...queryKeys.playlists.all, 'mediaSearch', q.trim().toLowerCase()] as const,
},
```

- Modify: `src/lib/config/rate-limit-tiers.ts` — add `playlistCoverUploadLimiter` (interval 60s, uniqueTokenPerInterval 500) + `PLAYLIST_COVER_UPLOAD_LIMIT = 10`, JSDoc: user-keyed presigned-URL minting for playlist covers.
- Test: extend the existing specs for these files if present (check for `query-keys.spec.ts`; mirror existing assertions style).

- [ ] Steps: failing assertions → implement → pass → commit `feat(playlists): ✨ query keys + upload limiter`

### Task 5: Playlist repository

**Files:**

- Create: `src/lib/repositories/playlist-repository.ts`
- Test: `src/lib/repositories/playlist-repository.spec.ts` (mock `@/lib/prisma`)

**Interfaces (Produces — static class `PlaylistRepository`, all through the repo's `runQuery` idiom, drift guards vs Prisma payloads like `video-repository.ts`):**

- `create(data: CreatePlaylistData): Promise<PlaylistRecord>`
- `createWithItems(data: CreatePlaylistData, items: AddPlaylistItemData[]): Promise<PlaylistRecord>` — `$transaction`: create playlist, `createMany` items with `sortOrder = index`, update `itemCount`/`totalDuration` (sum of durations); returns the playlist record.
- `findById(id): Promise<PlaylistRecord | null>`
- `findByIdWithItems(id): Promise<(PlaylistRecord & { items: PlaylistItemRecord[] }) | null>` — items `orderBy sortOrder asc`
- `findManyByOwner(ownerId, { skip = 0, take = 24, search? }): Promise<PlaylistRecord[]>` — `orderBy updatedAt desc`, optional title `contains/insensitive`
- `update(id, data: UpdatePlaylistData): Promise<PlaylistRecord>`
- `delete(id): Promise<void>` (cascade removes items)
- `findDuplicateItem(playlistId, ref: { trackFileId?: string; videoId?: string }): Promise<PlaylistItemRecord | null>`
- `addItem(playlistId, data: AddPlaylistItemData): Promise<PlaylistItemRecord>` — `$transaction`: read playlist `itemCount`, create item `sortOrder = itemCount`, increment `itemCount` + `totalDuration`
- `removeItem(playlistId, itemId): Promise<void>` — `$transaction`: delete, decrement counters by the removed item's duration, `updateMany` decrement `sortOrder` where `> deleted.sortOrder`
- `reorderItems(playlistId, orderedItemIds: string[]): Promise<void>` — `$transaction` rewriting `sortOrder = index` per id
- `searchPublicTrackItems(q, excludeOwnerId, take): Promise<Array<PlaylistItemRecord & { playlist: { id: string; title: string } }>>` — where `{ itemType: 'track', title: { contains: q, mode: 'insensitive' }, playlist: { is: { isPublic: true, ownerId: { not: excludeOwnerId } } } }`

- [ ] **Step 1: failing spec** — assert exact where/orderBy/include shapes passed to the prisma mock for every method; transaction composition for createWithItems/addItem/removeItem/reorderItems (counter increments, sortOrder compaction math with a 3-item fixture removing the middle one); duplicate-lookup uses the right id column per ref shape; error path maps through `runQuery`/`DataError` like video-repository's spec.
- [ ] Steps 2–4: fail → implement → pass (`pnpm run test:run src/lib/repositories/playlist-repository.spec.ts`).
- [ ] **Step 5: Commit** — `feat(playlists): ✨ playlist repository`

### Task 6: Track-file repository extensions

**Files:**

- Modify: `src/lib/repositories/release-digital-format-file-repository.ts`
- Test: extend its existing `.spec.ts`

**Interfaces (Produces):**

- `findManyByIdsWithRelease(ids: string[])` — `where: { id: { in: ids } }`, select projecting `id, trackNumber, title, duration, s3Key, fileName, mimeType` (**NO fileSize — BigInt breaks JSON**) + `format: { select: { formatType, releaseId, release: { select: { id, title, coverArt, publishedAt, artistReleases: { select: { artist: { select: { displayName, firstName, surname } } } } } } } }`. (Include soft-delete fields only if the format/release models have them — verify in schema and mirror whatever `release-repository.ts` filters on for published listings.)
- `searchTracksByTitle(q: string, take: number)` — same select; `where: { title: { contains: q, mode: 'insensitive' }, format: { is: { formatType: 'MP3_320KBPS', release: { is: <published-release filter copied from release-repository’s published where> } } } }`
- Return type name: `TrackFileWithRelease` (export it).

- [ ] Steps: failing spec (where/select shape assertions incl. the fileSize exclusion + published filter) → implement → pass → commit `feat(playlists): ✨ track file lookups w/ release`
      (Note: `findManyByFormatIdsAndTrackNumbers` is PR2 — do NOT add it here; YAGNI.)

### Task 7: Video repository extensions

**Files:** Modify `src/lib/repositories/video-repository.ts`; extend its `.spec.ts`.

**Interfaces (Produces):**

- `findManyByIds(ids: string[])` — published + non-archived filter (mirror the existing published where in this file), select `id, title, artist, durationSeconds, posterUrl`
- `searchPublished(q: string, take: number)` — same select; `where: { AND: [<published/non-archived>], OR: [{ title: { contains: q, mode: 'insensitive' } }, { artist: { contains: q, mode: 'insensitive' } }] }`

- [ ] Steps: failing spec → implement → pass → commit `feat(playlists): ✨ video lookups for search`

### Task 8: Playlist service

**Files:**

- Create: `src/lib/services/playlist-service.ts` (`import 'server-only'`; static class `PlaylistService`)
- Test: `src/lib/services/playlist-service.spec.ts` (mock all repositories)

**Interfaces (Produces):**

- `requireOwned(playlistId: string, userId: string): Promise<PlaylistRecord>` — throws `new DataError('NOT_FOUND', …)` (reuse the repo's DataError type) for missing AND unowned (no existence leak)
- `getOwnedOrPublicDetail(playlistId: string, userId: string): Promise<PlaylistDetailResponse | null>` — null when missing/private-unowned; resolves items: collect trackFileIds/videoIds → `ReleaseDigitalFormatFileRepository.findManyByIdsWithRelease` + `VideoRepository.findManyByIds` (2 lookups) → merge into `PlaylistItemPayload[]`: live title/artistName/duration when resolvable else snapshot values, `available` = source found (video must still be published/non-archived), `coverArt` = release.coverArt (track) / posterUrl (video), `releaseTitle` from live release. Artist name derivation: `displayName ?? `${firstName} ${surname}`` of the FIRST artist.
- `resolveItemSource(ref: PlaylistItemSourceRef): Promise<AddPlaylistItemData | null>` — null when the source row is missing/unpublished; builds snapshot fields from the live row (duration ?? 0)
- `createWithItems(userId, input: { title; isPublic; coverImages; items: PlaylistItemSourceRefs[] }): Promise<PlaylistDetailResponse>` — resolves each ref (drops nulls), validates covers (below), `PlaylistRepository.createWithItems`, returns via `getOwnedOrPublicDetail`
- `addItem(userId, input: { playlistId; ref; force }): Promise<{ duplicate: true } | { duplicate: false; item: PlaylistItemPayload }>` — requireOwned; resolve source (throw NOT_FOUND if null); `findDuplicateItem` when !force → `{ duplicate: true }`; enforce `itemCount < MAX_PLAYLIST_ITEMS` (throw `DataError('LIMIT_EXCEEDED')`); addItem → map to payload
- `removeItem(userId, playlistId, itemId)`, `reorder(userId, playlistId, orderedItemIds)` — requireOwned; reorder additionally loads current items and throws `DataError('INVALID_INPUT')` unless id-set equality
- `update(userId, input: UpdatePlaylistInput)` / `delete(userId, playlistId)` — requireOwned first; update validates covers
- `validateCoverImages(playlist: PlaylistRecord & { items?… }, coverImages: string[], resolvedItemArt: string[]): void` — each entry must EITHER live under the CDN prefix `media/playlists/{playlistId}/` (no `..`, build the check on pathname) OR appear in `resolvedItemArt` (the set of coverArt/Image.src values of the playlist's current items, from the same resolution used in detail). Throws `DataError('INVALID_INPUT')`.
- `searchMedia(q: string, userId: string): Promise<PlaylistSearchResponse>` — `Promise.all` of 5 capped queries (`PLAYLIST_SEARCH_GROUP_LIMIT` each): (1) `searchTracksByTitle` → songs; (2) `VideoRepository.searchPublished` → videos; (3) `searchPublicTrackItems` → re-resolve via `findManyByIdsWithRelease`, drop dangling, `context` = source playlist title; (4) release-title matches (reuse `ReleaseService.getPublishedReleases({ search: q, take: 3 })` or the repository equivalent — verify the existing published search entry point and reuse it) expanded to their MP3_320 files (via each release's digitalFormats — use `findManyByIdsWithRelease`-style select through the release repo if cheaper; keep to ≤8 items total, `context` = release title); (5) artist-name matches (reuse the `/api/artists/search` service path) expanded likewise, `context` = artist name. Dedupe across groups by `trackFileId` in priority order; omit empty groups; labels: `Songs`, `Videos`, `From public playlists`, `From releases`, `By artist`.
- `getMyPlaylists(userId, { skip, take, search }): Promise<PlaylistsResponse>` — maps records to rows (updatedAt ISO), `nextSkip` = skip+take when a full page returned else null (mirror `computeNextSkip` if it exists — grep and reuse).

- [ ] **Step 1: failing spec** — ownership: missing vs unowned both throw NOT_FOUND; detail: available flag matrix (track resolvable / file gone / video archived), coverArt fallback values, isOwner; addItem: duplicate w/o force, force bypass, limit 200, snapshot construction from live row; reorder id-set mismatch throws; cover validation matrix (valid prefix, `..` traversal rejected, artist-image match accepted, external URL rejected); searchMedia: dedupe priority (a trackFileId in songs is dropped from publicPlaylists/releases), empty groups omitted, caps applied; createWithItems drops unresolvable refs.
- [ ] Steps 2–4: fail → implement → pass (`pnpm run test:run src/lib/services/playlist-service.spec.ts`).
- [ ] **Step 5: Commit** — `feat(playlists): ✨ playlist service`

### Task 9: Playlist CRUD + cover-upload actions

**Files:**

- Create: `src/lib/actions/playlist-actions.ts` (`'use server'` + `import 'server-only'`)
- Test: `src/lib/actions/playlist-actions.spec.ts` (mock `@/auth` — match how existing action specs mock the session — and `PlaylistService`, S3 presigner)

**Interfaces (Produces):**

- `createPlaylistAction(input: unknown): Promise<PlaylistActionResult<PlaylistDetailResponse>>` — auth → `createPlaylistInputSchema.safeParse` → service → `revalidatePath('/playlists')`. Unique-title violation (DataError from `@@unique([ownerId, title])`) → `{ success: false, error: 'A playlist with this title already exists', fieldErrors: { title: […] } }`.
- `updatePlaylistAction(input): Promise<PlaylistActionResult<PlaylistDetailResponse>>`
- `deletePlaylistAction(input: { playlistId }): Promise<PlaylistActionResult<{ deleted: true }>>`
- `generatePlaylistCoverUploadUrlsAction(input): Promise<PlaylistActionResult<PlaylistCoverUploadTarget[]>>` — auth → `playlistCoverUploadInputSchema` → `playlistCoverUploadLimiter.check(PLAYLIST_COVER_UPLOAD_LIMIT, userId)` (rate-limited → `{ success:false, error:'RATE_LIMITED' }`) → `PlaylistService.requireOwned` → presigned PUTs keyed `media/playlists/{playlistId}/{sanitized}-{ts}-{rand}.{ext}` (reuse the sanitize/key logic pattern from `presigned-upload-actions.ts` — do NOT loosen the admin action; local helper is fine), `publicUrl` built with the same CDN base helper used elsewhere (`buildCdnUrl`).
- All actions: banned-user defense-in-depth (`session.user.banned` → unauthorized), try/catch → `{ success: false, error }` (never throw to client).

- [ ] Steps: failing spec (unauthed, banned, zod reject w/ fieldErrors, service NOT_FOUND mapping, duplicate-title mapping, rate-limit path, happy paths incl. key prefix + MIME reflection) → implement → pass → commit `feat(playlists): ✨ playlist CRUD actions`

### Task 10: Playlist item actions

**Files:**

- Create: `src/lib/actions/playlist-item-actions.ts`
- Test: `src/lib/actions/playlist-item-actions.spec.ts`

**Interfaces (Produces):**

- `addPlaylistItemAction(input): Promise<PlaylistActionResult<{ item: PlaylistItemPayload }>>` — service `{ duplicate: true }` → `{ success: false, error: 'DUPLICATE_ITEM' }` (exact string — the client switches on it); LIMIT_EXCEEDED → `'PLAYLIST_FULL'`; source missing → `'SOURCE_NOT_FOUND'`.
- `removePlaylistItemAction(input: { playlistId, itemId }): Promise<PlaylistActionResult<{ removed: true }>>`
- `reorderPlaylistItemsAction(input): Promise<PlaylistActionResult<{ reordered: true }>>`

- [ ] Steps: failing spec (auth, zod, DUPLICATE_ITEM passthrough, force success, PLAYLIST_FULL, reorder invalid-set) → implement → pass → commit `feat(playlists): ✨ playlist item actions`

### Task 11: GET /api/playlists

**Files:** Create `src/app/api/playlists/route.ts`; Test `src/app/api/playlists/route.spec.ts` (mirror `src/app/api/releases/route.spec.ts` mocking style).

**Interfaces:** `withAuth`-gated GET; query `skip` (default 0), `take` (default `PLAYLISTS_PAGE_SIZE`, clamp 1–100), `search` (optional); → 200 `PlaylistsResponse` with `Cache-Control: private, no-store`; malformed pagination → clamp not 400 (match releases route behavior); service error → 500 JSON.

- [ ] Steps: failing spec (401 unauth, clamping, search passthrough, response shape, no-store header) → implement (route delegates to `PlaylistService.getMyPlaylists(session.user.id, …)`) → pass → commit `feat(playlists): ✨ GET /api/playlists`

### Task 12: GET /api/playlists/[id]

**Files:** Create `src/app/api/playlists/[id]/route.ts`; Test alongside.

**Interfaces:** `withAuth`; `isValidObjectId` else 404; `PlaylistService.getOwnedOrPublicDetail(id, userId)` → null → 404 `{ error: 'NOT_FOUND' }`; 200 `PlaylistDetailResponse`, `private, no-store`. (PR2 will add stream URLs to this payload; PR1 payload has no s3Key/streamUrl.)

- [ ] Steps: failing spec (401, bad ObjectId 404, private-unowned 404, public non-owner 200 w/ isOwner:false, owner 200, shape) → implement → pass → commit `feat(playlists): ✨ GET /api/playlists/[id]`

### Task 13: GET /api/playlists/media-search

**Files:** Create `src/app/api/playlists/media-search/route.ts`; Test alongside.

**Interfaces:** `withRateLimit(searchLimiter, SEARCH_LIMIT)(withAuth(…))` — copy the exact composition used by an existing rate-limited search route (`/api/artists/search`); `export const dynamic = 'force-dynamic'`; `q` trimmed, length < `PLAYLIST_SEARCH_MIN_QUERY_LENGTH` → 200 `{ groups: [] }` (cheap no-op, not 400); → `PlaylistService.searchMedia(q, userId)`; `private, no-store`.

- [ ] Steps: failing spec (401, rate-limit 429 path, short-query empty groups, delegation + shape) → implement → pass → commit `feat(playlists): ✨ media search route`

### Task 14: format-duration extraction

**Files:**

- Create: `src/lib/utils/format-duration.ts` + `format-duration.spec.ts`
- Modify: `src/app/components/ui/audio/media-player/media-player.tsx` (delete the module-private `formatDuration` ~line 854; import from the new util; keep behavior identical)

**Interfaces (Produces):**

```ts
export const formatDuration = (seconds: number | null | undefined): string; // m:ss; nullish/0/negative → '0:00' (match current media-player behavior EXACTLY — read it first)
export const formatDurationLong = (seconds: number): string; // < 3600 → formatDuration; ≥ 3600 → h:mm:ss (e.g. 4210 → '1:10:10')
```

- [ ] Steps: failing spec (0, 59, 61, 600, 3599, 3600, 4210, null/undefined) → implement + swap media-player import → `pnpm run test:run src/lib/utils/format-duration.spec.ts src/app/components/ui/audio/media-player` → PASS (media-player spec must stay green) → commit `refactor(playlists): ♻️ extract formatDuration util`

### Task 15: Query hooks

**Files:**

- Create: `src/app/hooks/use-playlists-query.ts`, `use-playlist-query.ts`, `use-playlist-media-search-query.ts` + a `.spec.ts` each (mirror `use-artist-nav-search-query.spec.ts` style)

**Interfaces (Produces):**

- `usePlaylistsQuery(options: QueryOptionsOverride<PlaylistsResponse> = {})` — key `queryKeys.playlists.mine()`, fetch `/api/playlists?skip=0&take=${PLAYLISTS_PAGE_SIZE}` via `fetchAndParse(url, playlistsResponseSchema, { signal })`
- `usePlaylistQuery(playlistId: string | null, options = {})` — key `detail(playlistId ?? '')`, `enabled: (options.enabled ?? true) && !!playlistId`
- `usePlaylistMediaSearchQuery(q: string, options = {})` — key `mediaSearch(q)`, `placeholderData: keepPreviousData`, `staleTime: 30_000`, `enabled: (options.enabled ?? true) && q.trim().length >= PLAYLIST_SEARCH_MIN_QUERY_LENGTH`
- All: JSDoc, AbortSignal forwarded, options spread BEFORE the locked `enabled` composition (match existing hooks).

- [ ] Steps: failing specs (URL construction, schema validation failure surfaces ResponseValidationError, enabled gates, key factories) → implement → pass → commit `feat(playlists): ✨ playlist query hooks`

### Task 16: Mutation hooks

**Files:** Create `src/app/hooks/use-playlist-mutations.ts` + `.spec.ts` (mirror `use-tour-date-mutations.ts` naming/return conventions).

**Interfaces (Produces):** `useCreatePlaylistMutation`, `useUpdatePlaylistMutation`, `useDeletePlaylistMutation`, `useAddPlaylistItemMutation`, `useRemovePlaylistItemMutation`, `useReorderPlaylistItemsMutation`. Each wraps the server action; a `{ success: false }` result REJECTS the mutation (throw `new Error(result.error)`) so callers use onError — EXCEPT add-item, which resolves with the discriminated `PlaylistActionResult` untouched (callers must branch on `DUPLICATE_ITEM` without exception flow). Invalidation on success: all → `queryKeys.playlists.mine()`; item/update/delete additionally `detail(playlistId)`; create → `setQueryData(detail(data.id), data)` + invalidate mine.

- [ ] Steps: failing spec (invalidation targets via queryClient spy, reject-on-failure, add-item non-throw contract, create seeds cache) → implement → pass → commit `feat(playlists): ✨ playlist mutation hooks`

### Task 17: PlaylistCoverTiles

**Files:** Create `src/app/components/playlists/playlist-cover-tiles.tsx` + `.spec.tsx`.

**Interfaces (Produces):**

```ts
interface PlaylistCoverTilesProps { images: string[]; alt: string; size?: 'sm' | 'lg'; className?: string; }
export const PlaylistCoverTiles = ({ images, alt, size = 'sm', className }: PlaylistCoverTilesProps): ReactElement;
```

Fixed `aspect-square border-2 border-black overflow-hidden` frame (`size-14` sm / `w-full` lg). Layouts: 0 images → neutral placeholder (`bg-zinc-200` + `Music` lucide icon); 1 → single `object-cover`; 2 → `grid grid-cols-2`; 3 → `grid grid-cols-2 grid-rows-2` first child `row-span-2`; 4 → `grid grid-cols-2 grid-rows-2`. Use `next/image` `fill` inside `relative` cells, `sizes` appropriate per size variant, first tile alt = `alt`, rest `alt=""` `aria-hidden`.

- [ ] Steps: failing spec (renders N imgs for N∈0..4, layout classes per count, placeholder at 0, clipping class `object-cover` present) → implement → pass → commit `feat(playlists): ✨ cover tiles component`

### Task 18: Cover upload hook + field

**Files:**

- Create: `src/app/components/playlists/use-playlist-cover-upload.ts` + `.spec.ts`
- Create: `src/app/components/playlists/playlist-cover-art-field.tsx` + `.spec.tsx`

**Interfaces (Produces):**

- Hook: `usePlaylistCoverUpload()` returns `{ uploadFiles: (playlistId: string, files: File[]) => Promise<string[]>, isUploading: boolean, error: string | null }`. `uploadFiles`: client-side pre-validation (type/size/count vs constants) → `generatePlaylistCoverUploadUrlsAction` → `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })` per target → returns `publicUrl[]`. Taking `playlistId` as a call argument (not hook config) lets the save dialog upload right after create returns the new id.
- Field: props `{ value: string[]; onChange: (v: string[]) => void; playlistId: string | null; availableArtistImages: string[]; pendingFiles: File[]; onPendingFilesChange: (files: File[]) => void }`. Tabs (shadcn `Tabs`): **Upload** — file input (accept the 4 MIME types, `multiple`); in create mode (`playlistId === null`) selected files append to `pendingFiles` (previews via `URL.createObjectURL`, revoked on cleanup) and upload after save; in edit mode uploads immediately via `uploadFiles(playlistId, files)` and appends the returned URLs to `value`; thumbnails with X-remove buttons for both kinds. **From artists** — grid of `availableArtistImages` (deduped by caller), tap toggles selection into `value` (combined cap 4 across value+pendingFiles, toast when exceeding), selected ring style. Above tabs: `PlaylistCoverTiles images={[...value, ...pendingPreviews]} size="lg" alt="Cover preview"`.

- [ ] Steps: failing specs (hook: pre-validation rejects, PUT called per target with content-type, returns publicUrls; field: create mode appends pendingFiles without calling the action, edit mode uploads immediately, select/deselect updates onChange, combined cap enforcement, remove buttons for both kinds) → implement → pass → commit `feat(playlists): ✨ cover upload + art field`

### Task 19: Save dialog

**Files:** Create `src/app/components/playlists/playlist-save-dialog.tsx` + `.spec.tsx`.

**Interfaces (Produces):**

```ts
interface PlaylistSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  playlistId: string | null; // null in create mode until saved
  initialValues: { title: string; isPublic: boolean; coverImages: string[] };
  pendingItemRefs: PlaylistItemSourceRef[]; // create mode: sent as createPlaylistAction items
  availableArtistImages: string[];
  onSaved: (playlist: PlaylistDetailResponse) => void;
  onAddSongs?: () => void; // edit mode only: renders the button
}
```

RHF + zodResolver over `{ title, isPublic, coverImages }` (schema: `playlistTitleSchema`, boolean, `coverImagesSchema`). The dialog owns `pendingFiles: File[]` state passed to the field. Create submit flow: `createPlaylistAction({ title, isPublic, coverImages: artistImageSelections, items: pendingItemRefs })` → when `pendingFiles.length > 0`: `uploadFiles(created.id, pendingFiles)` → `updatePlaylistAction({ playlistId: created.id, coverImages: [...artistSelections, ...uploaded] })` → `onSaved(finalPlaylist)`. Edit submit: `updatePlaylistAction`. Field errors (duplicate title) → `form.setError('title', …)`. Footer: edit mode left slot "Add songs" (`variant="outline"`, closes dialog then `onAddSongs()`); right: Cancel / Save (pending label "Saving…"). Toast success `Playlist saved`.

- [ ] Steps: failing spec (empty-title zod error shown; create calls action with items + closes + onSaved; duplicate-title fieldError set; edit shows "Add songs" and it fires onAddSongs after close; public switch toggles) → implement (extract submit orchestration into a local `usePlaylistSaveSubmit` helper hook in the same folder if the component nears complexity limits) → pass → commit `feat(playlists): ✨ playlist save dialog`

### Task 20: Creator state machine

**Files:** Create `src/app/components/playlists/use-playlist-creator.ts` + `.spec.ts`.

**Interfaces (Produces):**

```ts
export interface DraftItem {
  localId: string; itemType: PlaylistItemType;
  trackFileId?: string; videoId?: string; releaseId?: string;
  title: string; artistName: string | null; duration: number | null; coverArt: string | null;
}
export const toSourceRef = (item: DraftItem): PlaylistItemSourceRef;
export const draftItemFromSearchItem = (item: PlaylistSearchItem): DraftItem; // localId = crypto.randomUUID()
interface CreatorState {
  phase: 'draft' | 'saved' | 'editing';
  playlistId: string | null;
  pendingItems: DraftItem[];        // only meaningful in draft phase
  saveDialogOpen: boolean;
  hasOpenedFirstSaveDialog: boolean;
}
export const usePlaylistCreator = (): {
  state: CreatorState;
  addItem: (item: DraftItem) => { duplicate: boolean };  // draft: local dup check by source id; appends unless duplicate (caller confirms then calls addItemForced)
  addItemForced: (item: DraftItem) => void;
  removeDraftItem: (localId: string) => void;
  reorderDraftItems: (orderedLocalIds: string[]) => void;
  openSaveDialog: () => void; closeSaveDialog: () => void;
  markSaved: (playlistId: string) => void;               // draft → saved
  loadForEdit: (playlistId: string) => void;             // → editing (dialog open)
  finishEditing: () => void;                             // editing → saved (dialog closed)
  resetToDraft: (items: DraftItem[]) => void;            // any → draft, opens dialog when items non-empty
};
```

Rules encoded in the reducer: in `draft`, the FIRST successful `addItem` (pendingItems 0→1) also sets `saveDialogOpen: true` + `hasOpenedFirstSaveDialog: true`; later adds never auto-open. `markSaved` clears pendingItems. `saved`/`editing` phases never track pendingItems (server state owns items).

- [ ] Steps: failing spec (renderHook: first-add opens dialog once; cancel keeps items; second add silent; dup detection by trackFileId AND videoId; forced add appends duplicate; markSaved transition; loadForEdit opens dialog in editing; finishEditing; resetToDraft opens dialog with seeded item) → implement → pass → commit `feat(playlists): ✨ creator state machine`

### Task 21: Duplicate-confirm dialog + playlist picker

**Files:**

- Create: `src/app/components/playlists/playlist-duplicate-confirm-dialog.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-picker-combobox.tsx` + `.spec.tsx`

**Interfaces (Produces):**

- `PlaylistDuplicateConfirmDialog({ open, onOpenChange, itemTitle, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; itemTitle: string; onConfirm: () => void })` — AlertDialog: title "Already in playlist", description `'"{itemTitle}" is already in this playlist. Add it again?'`, Cancel / "Add again" (calls onConfirm then closes).
- `PlaylistPickerCombobox({ onPick, excludePlaylistId }: { onPick: (row: PlaylistListRow) => void; excludePlaylistId?: string })` — inline `Command` (NO popover; parents embed it): `CommandInput` placeholder "Find a playlist…"; rows = `usePlaylistsQuery()` rows minus `excludePlaylistId`, client-filtered by input (`title.toLowerCase().includes(q)`), capped at 5; each row: `PlaylistCoverTiles size="sm"`, title, `Plus` icon; `onSelect` → `onPick(row)`; empty state "No playlists yet.".

- [ ] Steps: failing specs (confirm fires + closes; picker lists ≤5, filters, excludes id, onPick payload) → implement → pass → commit `feat(playlists): ✨ dup confirm + playlist picker`

### Task 22: Creator search combobox

**Files:**

- Create: `src/app/components/playlists/playlist-search-result-row.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-creator-search.tsx` + `.spec.tsx`

**Interfaces (Produces):**

- Row: `PlaylistSearchResultRow({ item, onAdd, onNewPlaylist, onAddToOther }: { item: PlaylistSearchItem; onAdd: () => void; onNewPlaylist: () => void; onAddToOther: () => void })` — leading `Plus` icon + 40px thumb (`next/image`, fallback bg) + title (+ `Badge` "video" when `itemType === 'video'`) + subtext `context ?? artistName` + `formatDuration(duration)`; right-edge secondary buttons `CopyPlus` (aria-label "New playlist from this song") and `ListPlus` (aria-label "Add to another playlist") — both with `onClick`+`onPointerDown` stopPropagation.
- Search: `PlaylistCreatorSearch({ onAdd, onNewPlaylist, ref }: { onAdd: (item: PlaylistSearchItem) => void; onNewPlaylist: (item: PlaylistSearchItem) => void; ref?: Ref<PlaylistCreatorSearchHandle> })` where `PlaylistCreatorSearchHandle = { focus: () => void }` (React 19 ref-as-prop; `useImperativeHandle` focusing the `CommandInput`). Structure per `release-search-combobox.tsx`: `Command shouldFilter={false}` inside the creator card (inline list, not popover — the creator owns the layout); `useDebounce` 300ms (reuse the repo's existing debounce hook — grep `useDebounce`); `usePlaylistMediaSearchQuery(debounced)`; render `CommandGroup heading={group.label}` per non-empty group in response order; per-row `CommandItem value={item.key} onSelect={() => onAdd(item)}` wrapping `PlaylistSearchResultRow`; "Add to another playlist" toggles an inline `PlaylistPickerCombobox` in a plain div below that row — picking calls `useAddPlaylistItemMutation` against the picked playlist with `toSourceRef`-equivalent payload, toasts `Added to {title}` / DUPLICATE_ITEM → `PlaylistDuplicateConfirmDialog` → force retry; empty query hint row; `CommandEmpty` "No matches found."
- Keep the row a pure presentation component; ALL mutation/dialog state lives in `PlaylistCreatorSearch` (or a small `useAddToOtherPlaylist` hook in the same folder if complexity demands).

- [ ] Steps: failing specs (row: pill only for video, secondary clicks don't bubble to onSelect [regression test], durations formatted; search: groups render in order with headings, onAdd fired via item select, picker toggling, duplicate→confirm→force flow with mocked mutation, empty states) → implement → pass → commit `feat(playlists): ✨ creator search combobox`

### Task 23: Creator items + creator shell

**Files:**

- Create: `src/app/components/playlists/playlist-creator-item.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-creator-item-list.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-creator.tsx` + `.spec.tsx`

**Interfaces (Produces):**

- Item: `PlaylistCreatorItem({ id, title, artistName, duration, coverArt, isVideo, onRemove }: {...; onRemove: () => void })` — `useSortable({ id })`; drag handle `GripVertical` (listeners on handle only), 40px thumb, title+artist, video Badge, `formatDuration`, `Trash2` button → AlertDialog confirm ("Remove from playlist?") → onRemove.
- List: `PlaylistCreatorItemList({ items, onReorder, onRemove }: { items: Array<{ id: string; title: string; artistName: string | null; duration: number | null; coverArt: string | null; isVideo: boolean }>; onReorder: (orderedIds: string[]) => void; onRemove: (id: string) => void })` — DndContext (sensors copied from `artist-pill-list.tsx`: Pointer distance 8, Touch delay 200/tolerance 5, Keyboard + sortableKeyboardCoordinates), `SortableContext strategy={verticalListSortingStrategy}`, `onDragEnd` → arrayMove → `onReorder(newOrder)`.
- Creator: `PlaylistCreator({ editPlaylistId, onEditHandled, ref }: { editPlaylistId: string | null; onEditHandled: () => void; ref?: Ref<PlaylistCreatorHandle> })`, `PlaylistCreatorHandle = { focusSearch: () => void }`. Composes: `usePlaylistCreator`; `usePlaylistQuery(state.playlistId, { enabled: state.phase !== 'draft' })`; heading area (draft: "New playlist" + "Unsaved" Badge when pendingItems.length > 0 + "Save playlist" Button reopening the dialog; saved: playlist title + Edit pencil → `loadForEdit`); `PlaylistCreatorSearch` (onAdd: draft → machine addItem [duplicate → confirm dialog → addItemForced]; saved → `useAddPlaylistItemMutation` [DUPLICATE_ITEM → confirm → force retry]; onNewPlaylist → `resetToDraft([draftItemFromSearchItem(item)])`); `PlaylistCreatorItemList` (draft: pendingItems mapped, onReorder=reorderDraftItems, onRemove=removeDraftItem; saved: `detail.items` sorted, onReorder → local optimistic order state + `useReorderPlaylistItemsMutation` reverting on error per artist-pill-list pattern, onRemove → `useRemovePlaylistItemMutation`); `PlaylistSaveDialog` (mode = phase === 'editing' ? 'edit' : 'create'; initialValues from detail or defaults `{ title: '', isPublic: false, coverImages: [] }`; pendingItemRefs = pendingItems.map(toSourceRef); availableArtistImages = deduped non-null coverArts of current items; onSaved → markSaved(p.id) or finishEditing; onAddSongs → close + `searchRef.focus()`). Effect: when `editPlaylistId` set and detail loads → `loadForEdit(editPlaylistId)` + `onEditHandled()`; 404/error → toast + `onEditHandled()`.
- Extract sub-hooks (`use-creator-add-flow.ts` etc., same folder) as needed to satisfy complexity ≤10 — do not inline branch piles.

- [ ] Steps: failing specs (item: confirm-before-remove; list: onDragEnd wiring calls onReorder with moved order [simulate via exported handler or dnd test util used in existing specs]; creator: draft add→dialog opens once, saved add delegates to mutation, duplicate flows both phases, edit param triggers loadForEdit, focusSearch imperative) → implement → pass → commit `feat(playlists): ✨ playlist creator`

### Task 24: Playlist rows + list pane

**Files:**

- Create: `src/app/components/playlists/playlist-row-actions.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-row.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-list.tsx` + `.spec.tsx`

**Interfaces (Produces):**

- RowActions: `PlaylistRowActions({ row, onEdit, onPlay, onShare, onDelete }: { row: PlaylistListRow; onEdit: () => void; onPlay: () => void; onShare: () => void; onDelete: () => void })` — ghost icon buttons Trash2/Pencil/Share2/Play with aria-labels ("Delete playlist", "Edit playlist", "Share playlist", "Play playlist"). Delete opens AlertDialog (`Delete "{title}"? This can't be undone.`) then onDelete. Share and Play are rendered but delegate to callbacks — PR1 wires both to placeholder toasts (Task 25); PR2 replaces them with the share popover (`PlaylistSharePopover` + `/playlists/[id]` page) and the player dialog. Keeping them as plain callbacks means PR2 touches only the wiring, not this component's API.
- Row: `PlaylistRow({ row, onEdit, onPlay, onShare, onDelete })` — flex row: `PlaylistCoverTiles size="sm"`, title truncate + meta `"{itemCount} items · {Public|Private}"`, spacer, `formatDurationLong(totalDuration)` tabular-nums, `PlaylistRowActions`.
- List: `PlaylistList({ onEdit, onPlay, onShare, className }: { onEdit: (id: string) => void; onPlay: (id: string) => void; onShare: (id: string) => void; className?: string })` — `usePlaylistsQuery`; delete via `useDeletePlaylistMutation` (+`toast.success('Playlist deleted')`); skeleton rows while loading; empty state "No playlists yet — build one with the creator."

- [ ] Steps: failing specs (delete confirm gates the mutation; share/play fire callbacks; row renders duration long-format + meta; list empty/loading/rows + delete flow) → implement → pass → commit `feat(playlists): ✨ playlist list pane`

### Task 25: Page assembly (desktop/mobile) + route rewrite

**Files:**

- Create: `src/app/components/playlists/my-playlist-search.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlist-view.tsx` + `.spec.tsx`
- Create: `src/app/components/playlists/playlists-content.tsx` + `.spec.tsx`
- Modify: `src/app/playlists/page.tsx` (full rewrite)
- Delete: `src/app/components/ui/playlist-player.tsx` + its spec (junk stub; verify nothing imports it first: `grep -rn "playlist-player" src/`)

**Interfaces (Produces):**

- MyPlaylistSearch: `({ onSelect, className }: { onSelect: (id: string) => void; className?: string })` — mobile-only (`lg:hidden` applied by parent); Popover+Command with `shouldFilter` ON over `usePlaylistsQuery` titles; selecting → `onSelect(id)`.
- PlaylistView: `({ playlistId, onBackToCreator, onEdit, onPlay }: { playlistId: string; onBackToCreator: () => void; onEdit: (id: string) => void; onPlay: (id: string) => void })` — `usePlaylistQuery`; top `ToggleGroup type="single"` segments "Creator" / truncated playlist title (value controlled; choosing Creator → onBackToCreator); large `PlaylistCoverTiles size="lg"`; title + meta; Play + Edit buttons; read-only item list (thumb, title, video pill, `formatDuration`).
- PlaylistsContent: client island owning: `useSearchParams` for `?edit=` (pass to creator; `onEditHandled` → `router.replace('/playlists', { scroll: false })`), mobile `viewPlaylistId` state (creator wrapped in a div `hidden` when set — stays mounted), stubs `onPlay`/`onShare` → `toast.info('Playlist player arrives in the next update')` / `toast.info('Sharing arrives in the next update')` (both replaced in PR2). Layout skeleton:

```tsx
<MyPlaylistSearch className="lg:hidden" onSelect={setViewPlaylistId} />
<div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
  <div>
    {viewPlaylistId ? <PlaylistView … /> : null}
    <div className={viewPlaylistId ? 'hidden' : undefined}>
      <PlaylistCreator ref={creatorRef} editPlaylistId={editParam} onEditHandled={…} />
    </div>
  </div>
  <PlaylistList className="mt-8 lg:mt-0 lg:max-h-[75vh] lg:overflow-y-auto"
    onEdit={(id) => router.replace(`/playlists?edit=${id}`, { scroll: false })} onPlay={…} />
</div>
```

On mobile `onEdit` additionally clears `viewPlaylistId` and scrolls the creator into view.

- Page: Server Component per `videos/page.tsx`: `auth()` → `redirect('/signin')`; prefetch `queryKeys.playlists.mine()` through the service (server-side call to `PlaylistService.getMyPlaylists`, NOT fetch); `HydrationBoundary`; shell `PageContainer → ContentContainer → ZinePanel accent="kraft" breadcrumbs=[Home, My Playlists] → ZineHeading "My Playlists" → <Suspense fallback={skeleton}><PlaylistsContent /></Suspense>`. Suspense is REQUIRED (`useSearchParams`).

- [ ] Steps: failing specs (content: edit param forwarded + cleared, mobile view swap keeps creator mounted [assert hidden div], search select sets view; view: toggle fires onBackToCreator; page: redirect when no session — mirror videos/page.spec.ts if present) → implement → `pnpm run test:run src/app/components/playlists src/app/playlists` PASS → delete stub + `pnpm run typecheck` → commit `feat(playlists): ✨ my playlists page`

### Task 26: E2E flows + seed

**Files:**

- Modify: `prisma/seed.ts` — add: second seed user ("User B") if the seed doesn't already create one; one PUBLIC playlist owned by User B whose items reference two seeded MP3_320KBPS files (bulk `createMany` — never `Promise.all(create)` on fresh collections); recompute itemCount/totalDuration inline.
- Create: `e2e/tests/playlists/playlist-create.spec.ts`, `playlist-edit-reorder.spec.ts`, `playlist-delete-duplicate.spec.ts`, `playlist-public-search.spec.ts` (+ page object `e2e/pages/playlists-page.ts` following existing page-object conventions in `e2e/`).

**Flows (use existing signed-in fixtures/helpers — study `e2e/` first):**

1. create: /playlists → search a seeded track title → click result → save dialog appears → title "My Mix" → From-artists cover select → public toggle ON → Save → row appears with title, "2 items" after adding a second track, duration text, Public badge.
2. edit-reorder: pencil on row → `?edit=` → dialog open → "Add songs" → dialog closes → **`await expect(searchInput).toBeFocused()`** (focus-scope canary) → add another track → drag first item below second (dnd via mouse steps like existing dnd E2E if any; else keyboard sensor) → reload → order persisted.
3. delete-duplicate: add same track twice → confirm dialog appears → "Add again" → item count 2; trash a creator item → confirm; delete playlist row → confirm → row gone.
4. public-search: sign in as User A → creator search for a title present ONLY in User B's public playlist → "From public playlists" group shows it with context = playlist title.

- DB isolation is MANDATORY: tests run only via the harness against `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`. Never export DATABASE_URL from the shell.

- [ ] Steps: write specs → `pnpm run e2e:docker:up && pnpm run test:e2e -- e2e/tests/playlists` (harness scopes env) → iterate to green → also run ONE existing touched-area suite (`media-player`-covering spec if any exists for the formatDuration change) → commit `test(playlists): ✅ e2e playlist flows`

### Task 27: Full gate + coverage

- [ ] `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
- [ ] `pnpm run test:coverage:check` — must not regress `COVERAGE_METRICS.md` baseline (branches ≥ 95.31% − 2% tolerance, floor 95% global). Add targeted branch tests where new code drags it down.
- [ ] `pnpm exec prisma generate` idempotent; `git status` clean except intended files; commit any gate fixes as `test(playlists): ✅ …` / `style: 🎨 …`.

## Self-review notes (already applied)

- Detail route moved into PR1 (creator saved/edit mode needs items); PR2 extends its payload with stream URLs.
- `findManyByFormatIdsAndTrackNumbers` deferred to PR2 (zip-only consumer).
- Add-item mutation resolves (not rejects) so `DUPLICATE_ITEM` branches without exceptions.
- Videos' `coverArt` in payloads = posterUrl (uniform field, no client branching).
