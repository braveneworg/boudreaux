# Playlists PR2 (`feat/playlists-player`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the playlist player dialog (streams tracks + inline videos with queue advance), free-format zip downloads (MP3 free, AAC quota-gated) with a preflight-gated download row, the share popover, the `/playlists/[id]` shared-link page, the list load-more, and the PR1 hardening batch — everything except the global add-to-playlist player menu (PR3).

**Architecture:** Backend first: the bundle route's zip streaming is extracted to a shared `zip-stream.ts` util; `PlaylistItemPayload` gains `s3Key`/`streamUrl`/`posterUrl` attached in `PlaylistService` (`attachPlaylistItemStreamUrls` — tracks unsigned CDN, videos CloudFront-signed 24h, fail-closed nullable like the videos feature); a new `GET /api/playlists/[id]/download` route streams archiver store-mode zips with all-or-nothing AAC quota. Client: a light `PlaylistPlayer` composed from `MediaPlayer` leaves + `VideoPlayerSurface` (new additive `onEnded`), hosted by `PlaylistPlayerDialog` and the new shared-link page; `PlaylistSharePopover` embeds `SocialShareWidget` via a new neutral `url` prop.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, Prisma 6 + MongoDB, better-auth, TanStack Query 5 (infinite query for the list), shadcn/ui (Radix Dialog/Popover), archiver 7, @aws-sdk/cloudfront-signer, video.js (existing surface), sonner, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-playlists-design.md` — PR2 sections: lines 120–158 (detail extension + zip download), 195–206 (player dialog, share, shared-link page), 219–236 (risks/verification). Read before starting any task. PR1 shipped in #597 (`508091e2`); its plan is `docs/superpowers/plans/2026-07-14-playlists-pr1-core.md`.

## Global Constraints

- Worktree: all paths relative to `/Users/cchaos/projects/braveneworg/boudreaux/.claude/worktrees/feat-playlists-core`. Branch `feat/playlists-player`. NEVER edit the main checkout.
- TDD non-negotiable: spec first, watch it fail, implement, watch it pass, commit.
- MPL header from `HEADER.txt` at the top of every new source file.
- Named exports; arrow functions (`const f = () => …`); no `any`; no non-null `!`; no eslint-disable/ts-ignore; complexity ≤10 per function (extract helpers proactively); destructure params.
- `describe/it/expect/vi` are globals — never import from 'vitest'. Server-only specs start with `vi.mock('server-only', () => ({}))`.
- Path aliases only (`@/lib/*`, `@/hooks/*`, `@/components/*`, `@/ui/*`, `@/utils/*`).
- Commits: `type(scope): <gitmoji> subject` — subject ≤48 visible chars before the emoji; NO AI attribution lines; never commit to main. Pre-commit hooks run lint-staged + changed tests automatically; do not bypass.
- Never read `.env*`; never run anything against a non-local DB. E2E only via the isolated Docker Mongo (`mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0`, hardcoded in the harness).
- Repository pattern: ALL Prisma access stays in `src/lib/repositories/`. Never select BigInt `fileSize` into any JSON-bound payload.
- video.js lifecycle: keyed subtrees, never `forceMount`; track↔video switches must unmount the other surface.
- Formats: `FREE_FORMAT_TYPES = ['MP3_320KBPS', 'AAC']` (`src/lib/constants/digital-formats.ts`); `PRESIGNED_URL_EXPIRATION.DOWNLOAD = 86400`.

## Shared contracts (single source of truth — later tasks must match exactly)

```ts
// PlaylistItemPayload (src/lib/types/domain/playlist.ts) gains EXACTLY:
s3Key: string | null;     // tracks: file s3Key · videos: ALWAYS null (signed access only) · unavailable: null
streamUrl: string | null; // tracks: buildCdnUrl(s3Key) unsigned · videos: signStreamUrl(video.s3Key) — nullable
                          //   when signing unconfigured (dev/E2E), fail-closed like toPublicVideoRow · unavailable: null
posterUrl: string | null; // videos: video.posterUrl · tracks/unavailable: null

// Download route (Task 4):
// GET /api/playlists/[id]/download?format=MP3_320KBPS|AAC[&respond=preflight]
//   preflight: 200 { ok: true, trackCount, skippedCount } | 403 { ok: false, reason: 'QUOTA_EXCEEDED' }
//   stream: 200 application/zip (Content-Disposition attachment "<sanitized title>.zip")
//         | 404 { error: 'NOT_FOUND' | 'NO_TRACKS' } | 400 { error: 'INVALID_FORMAT' } | 409 { errorCode: 'LOCK_HELD' } | 429

// Player cluster components (props LOCKED):
PlaylistPlayer({ items, title }: { items: PlaylistItemPayload[]; title: string })
PlaylistDownloadRow({ playlistId, disabled }: { playlistId: string; disabled?: boolean })
PlaylistPlayerDialog({ playlistId, open, onOpenChange }: { playlistId: string | null; open: boolean; onOpenChange: (o: boolean) => void })
PlaylistSharePopover({ playlistId, playlistTitle, isPublic, children }: { playlistId: string; playlistTitle: string; isPublic: boolean; children: ReactNode })

// VideoPlayerSurface gains additive: onEnded?: () => void
// SocialShareWidget gains additive: url?: string (precedence over legacy artistUrl)
// usePlaylistsQuery (Task 14) becomes infinite: { isPending, error, rows, nextSkip, loadMore, isLoadingMore, refetch }
```

## Assembly ratifications (controller decisions — binding over any conflicting cluster text)

1. **Video `streamUrl` stays nullable** (matches `toPublicVideoRow` precedent). No server-side unsigned fallback for videos — fail closed when signing is unconfigured. The player treats `streamUrl: null` items as non-playable (poster/disabled in queue, skipped by navigation); E2E asserts poster-terminal-state for videos, never playback (codec-agnostic repo lesson).
2. **Zip entry numbering `NN`** = dense 1-based position among the tracks actually included in the zip (01, 02, …) — NOT the playlist position; videos/skipped tracks leave no gaps.
3. **Empty manifest:** preflight → `200 { ok: true, trackCount: 0, skippedCount: n }` (the download row parses the preflight body and guards: zero tracks → toast, no stream — Task 8); stream → `404 { error: 'NO_TRACKS' }`.
4. **AAC quota coverage guard** (Task 4): beyond per-release `checkFreeDownloadQuota`, the not-yet-downloaded distinct releases must fit within remaining quota as a set — all-or-nothing.
5. **Download trigger** uses the existing `triggerDownload` util (anchor-click), not `window.location.assign`.
6. **`onShare` is deleted** from `PlaylistRowActions`/`PlaylistRow`/`PlaylistList`/`PlaylistsContent` in Task 13 — row actions compose `PlaylistSharePopover` directly. Task 13 lands after Task 10 (both edit `playlists-content.tsx`).
7. **No seed changes** for Task 16 — the E2E DB already seeds 7 published videos + MP3 fixtures.

---

### Task 1: Extract `zip-stream.ts` from the bundle route (pure move)

**Files:**

- Create: `src/lib/utils/zip-stream.ts`
- Test: `src/lib/utils/zip-stream.spec.ts`
- Modify: `src/app/api/releases/[id]/download/bundle/route.ts` (delete the moved code, re-import)

**Interfaces:**

- Consumes (moved verbatim from the bundle route — bodies at lines 84–176 of `bundle/route.ts`):
  - `safeArchiveEntryName(fileName: string): string`
  - `fetchObjectBuffer(s3Client: ReturnType<typeof getS3Client>, bucket: string, key: string): Promise<Buffer | null>`
  - `issuePrefetch(s3Client, bucket, key): Promise<Buffer | null>`
  - `startBufferPrefetch(s3Client, bucket, keys: readonly string[], depth: number): Array<Promise<Buffer | null>>` (depth already parameterized — bundle keeps passing its local `S3_PREFETCH_DEPTH = 8`; the playlist route will pass 4)
- Produces (`src/lib/utils/zip-stream.ts`, `'server-only'` module — Tasks 4+ and other clusters rely on these exact exports):

```ts
export type ZipArchive = ReturnType<typeof archiver>;
export const createStoreArchive = (): ZipArchive;
export const safeArchiveEntryName = (fileName: string): string;
export const fetchObjectBuffer = (s3Client: ReturnType<typeof getS3Client>, bucket: string, key: string): Promise<Buffer | null>;
export const issuePrefetch = (s3Client: ReturnType<typeof getS3Client>, bucket: string, key: string): Promise<Buffer | null>;
export const startBufferPrefetch = (s3Client: ReturnType<typeof getS3Client>, bucket: string, keys: readonly string[], depth: number): Array<Promise<Buffer | null>>;
```

- [ ] **Step 1: Write the failing spec** — `src/lib/utils/zip-stream.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Readable } from 'node:stream';

import type { getS3Client } from '@/lib/utils/s3-client';

import {
  createStoreArchive,
  fetchObjectBuffer,
  issuePrefetch,
  safeArchiveEntryName,
  startBufferPrefetch,
} from './zip-stream';

vi.mock('server-only', () => ({}));

type S3ClientLike = ReturnType<typeof getS3Client>;

const makeClient = (send: ReturnType<typeof vi.fn>): S3ClientLike =>
  ({ send }) as unknown as S3ClientLike;

describe('safeArchiveEntryName', () => {
  it('flattens traversal paths to the basename', () => {
    expect(safeArchiveEntryName('../../etc/passwd')).toBe('passwd');
  });

  it('replaces backslashes and disallowed characters with underscores', () => {
    expect(safeArchiveEntryName('a\\b:c?.mp3')).toBe('b_c_.mp3');
  });

  it('collapses runs of dots', () => {
    expect(safeArchiveEntryName('evil....mp3')).toBe('evil_mp3');
  });

  it('keeps the playlist entry-name shape intact', () => {
    expect(safeArchiveEntryName('01 - Ceschi - Cold Wind.mp3')).toBe('01 - Ceschi - Cold Wind.mp3');
  });

  it('falls back to "file" for an empty result', () => {
    expect(safeArchiveEntryName('')).toBe('file');
  });
});

describe('fetchObjectBuffer', () => {
  it('uses the smithy transformToByteArray helper when present', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([97, 98])) },
    });
    const buffer = await fetchObjectBuffer(makeClient(send), 'bucket', 'key');
    expect(buffer?.toString()).toBe('ab');
  });

  it('drains a plain Readable body into one buffer', async () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('abc')]) });
    const buffer = await fetchObjectBuffer(makeClient(send), 'bucket', 'key');
    expect(buffer?.toString()).toBe('abc');
  });

  it('returns null when the response has no body', async () => {
    const send = vi.fn().mockResolvedValue({ Body: undefined });
    expect(await fetchObjectBuffer(makeClient(send), 'bucket', 'key')).toBeNull();
  });

  it('returns null for an unrecognized body shape', async () => {
    const send = vi.fn().mockResolvedValue({ Body: { not: 'a stream' } });
    expect(await fetchObjectBuffer(makeClient(send), 'bucket', 'key')).toBeNull();
  });
});

describe('issuePrefetch', () => {
  it('still rejects on await after attaching the passive handler', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(issuePrefetch(makeClient(send), 'bucket', 'key')).rejects.toThrow('boom');
  });
});

describe('startBufferPrefetch', () => {
  it('issues at most `depth` initial fetches', () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });
    const inFlight = startBufferPrefetch(makeClient(send), 'bucket', ['k1', 'k2', 'k3'], 2);
    expect(inFlight).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps at the key count when depth exceeds it', () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('x')]) });
    const inFlight = startBufferPrefetch(makeClient(send), 'bucket', ['k1'], 8);
    expect(inFlight).toHaveLength(1);
  });
});

describe('createStoreArchive', () => {
  it('emits a zip (PK) containing the appended entry', async () => {
    const archive = createStoreArchive();
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => archive.on('end', resolve));
    archive.append(Buffer.from('hello'), { name: 'test.mp3' });
    archive.finalize();
    await done;
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes('test.mp3')).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `pnpm run test:run src/lib/utils/zip-stream.spec.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/utils/zip-stream.ts` — a PURE MOVE of the four helpers (bodies byte-identical to `bundle/route.ts` lines 84–176, converted to arrow expressions with their JSDoc kept) plus the two new exports:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import path from 'node:path';
import { Readable } from 'node:stream';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';

import type { getS3Client } from '@/lib/utils/s3-client';

/** An archiver zip instance, as threaded through the download zip pipelines. */
export type ZipArchive = ReturnType<typeof archiver>;

type S3ClientLike = ReturnType<typeof getS3Client>;

/**
 * Create a store-mode (no compression) zip archive — audio payloads are
 * already compressed, so store mode trades nothing for a large CPU win.
 */
export const createStoreArchive = (): ZipArchive => archiver('zip', { zlib: { level: 0 } });

/**
 * Defense-in-depth against zip-slip: force every archive entry to a
 * path.basename without slashes, backslashes, or `..`. Upload-time validation
 * should already guarantee safe names, but an archive with `../../etc/passwd`
 * would escape on server-side extraction (backups, scanners, admin review).
 */
export const safeArchiveEntryName = (fileName: string): string => {
  const base = path.basename(fileName).replace(/[\\/]/g, '_');
  const sanitized = base.replace(/[^A-Za-z0-9._\- ]/g, '_').replace(/\.{2,}/g, '_');
  return sanitized.length > 0 ? sanitized : 'file';
};

/**
 * Download an S3 object's body fully into a Buffer. Resolves once the
 * entire body has been streamed to memory.
 */
export const fetchObjectBuffer = async (
  s3Client: S3ClientLike,
  bucket: string,
  key: string
): Promise<Buffer | null> => {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) {
    return null;
  }
  // AWS SDK v3 in Node returns an IncomingMessage with a smithy-injected
  // `transformToByteArray` helper; tests pass a plain `Readable`. Support both.
  const maybeTransform = (body as { transformToByteArray?: () => Promise<Uint8Array> })
    .transformToByteArray;
  if (typeof maybeTransform === 'function') {
    const bytes = await maybeTransform.call(body);
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return null;
};

/**
 * Issue a single prefetch and attach a passive rejection handler so that
 * if the consumer abandons the promise (e.g. another fetch fails first and
 * the surrounding try/catch exits the consume loop), Node does not log it
 * as an unhandled rejection. Awaiting the returned promise still observes
 * the original rejection.
 */
export const issuePrefetch = (
  s3Client: S3ClientLike,
  bucket: string,
  key: string
): Promise<Buffer | null> => {
  const promise = fetchObjectBuffer(s3Client, bucket, key);
  // Suppress "unhandled rejection" — the consumer's `await` (or the outer
  // try/catch) is the authoritative handler.
  promise.catch(() => {});
  return promise;
};

/**
 * Kick off up to `depth` concurrent S3 body downloads for the head of `keys`.
 * The caller refills the returned in-flight list via `issuePrefetch` as it
 * drains entries into the archive.
 */
export const startBufferPrefetch = (
  s3Client: S3ClientLike,
  bucket: string,
  keys: readonly string[],
  depth: number
): Array<Promise<Buffer | null>> => {
  const inFlight: Array<Promise<Buffer | null>> = [];
  const initial = Math.min(depth, keys.length);
  for (let i = 0; i < initial; i++) {
    const key = keys.at(i);
    if (key === undefined) {
      break;
    }
    inFlight.push(issuePrefetch(s3Client, bucket, key));
  }
  return inFlight;
};
```

- [ ] **Step 4: Rewire the bundle route** (`src/app/api/releases/[id]/download/bundle/route.ts`) — behavior byte-identical:
  - Delete the four moved definitions (`safeArchiveEntryName`, `fetchObjectBuffer`, `issuePrefetch`, `startBufferPrefetch`) and their JSDoc. Keep `S3_PREFETCH_DEPTH = 8` (with its JSDoc) in the route.
  - Add `import { createStoreArchive, issuePrefetch, safeArchiveEntryName, startBufferPrefetch, type ZipArchive } from '@/lib/utils/zip-stream';`
  - Replace all three `archiver('zip', { zlib: { level: 0 } })` constructions (in `initSseArchive`, `buildStreamPipeline`, `buildAndRedirectResponse`) with `createStoreArchive()`. Keep the `// store mode (no compression)` comment where present.
  - Replace every `ReturnType<typeof archiver>` type annotation with `ZipArchive`, then delete the now-unused `import archiver from 'archiver'`, `import path from 'node:path'`, and `GetObjectCommand` import. `Readable` stays (`responsePass`, `toWebStream`); `PassThrough`/`Transform` stay.
  - Confirm no other comment references the moved code by line.
- [ ] **Step 5: Run** `pnpm run test:run src/lib/utils/zip-stream.spec.ts "src/app/api/releases/[id]/download/bundle/route.spec.ts"` → both PASS (the bundle spec's existing `vi.mock('archiver')` / `vi.mock('@aws-sdk/client-s3')`-style module mocks apply transitively to `zip-stream`'s imports — no bundle-spec changes expected).
- [ ] **Step 6: Gate** `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`
- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/zip-stream.ts src/lib/utils/zip-stream.spec.ts "src/app/api/releases/[id]/download/bundle/route.ts"
git commit -m "refactor(downloads): ♻️ extract zip-stream utils"
```

---

### Task 2: Stream fields in `PlaylistItemPayload` + Zod + fixtures

**Files:**

- Modify: `src/lib/types/domain/playlist.ts` (`PlaylistItemPayload`, lines ~117–130)
- Modify: `src/lib/validation/playlist-schema.ts` (`playlistItemPayloadSchema`, lines ~182–195)
- Modify: `src/lib/services/playlist-service.ts` (four payload mappers gain a `NO_STREAM_FIELDS` spread so typecheck stays green — real attachment is Task 3)
- Test (modify): `src/lib/validation/playlist-schema.spec.ts` + every PR1 spec fixture that constructs a `PlaylistItemPayload` (list in Step 4)

**Interfaces:**

- Consumes: `PlaylistItemPayload` / `playlistItemPayloadSchema` exactly as PR1 shipped them (12 fields ending `coverArt: string | null`).
- Produces (other clusters — player dialog, hooks — rely on this exact shape):

```ts
// Appended to PlaylistItemPayload (src/lib/types/domain/playlist.ts)
export interface PlaylistItemPayload {
  // …existing 12 PR1 fields unchanged…
  s3Key: string | null;
  streamUrl: string | null;
  posterUrl: string | null;
}

// src/lib/services/playlist-service.ts (module-level, reused by Task 3)
type PlaylistItemStreamFields = Pick<PlaylistItemPayload, 's3Key' | 'streamUrl' | 'posterUrl'>;
const NO_STREAM_FIELDS: PlaylistItemStreamFields = {
  s3Key: null,
  streamUrl: null,
  posterUrl: null,
};
```

**Decision (binding for Task 5):** the wire schema lives in `src/lib/validation/playlist-schema.ts`, which `usePlaylistQuery` already imports — so the hook's Zod update is DONE in this task; Task 5 only adds parity guards.

- [ ] **Step 1: Write the failing spec** — extend `src/lib/validation/playlist-schema.spec.ts`:
  - Add `s3Key: 'releases/r1/digital-formats/MP3_320KBPS/t1.mp3'`, `streamUrl: 'https://cdn.test/releases/r1/digital-formats/MP3_320KBPS/t1.mp3'`, `posterUrl: null` to the existing valid `PlaylistItemPayload` fixture and assert the parsed output CONTAINS all three (`expect(result.data.items[0].streamUrl).toBe(…)` — Zod strips unknown keys, so this fails until the schema knows them).
  - Add a rejection case: the same fixture with `streamUrl` deleted fails `playlistItemPayloadSchema.safeParse` (`success: false`).
  - Add an all-null case: `{ …fixture, s3Key: null, streamUrl: null, posterUrl: null }` parses successfully (unavailable-item shape).
- [ ] **Step 2: Run** `pnpm run test:run src/lib/validation/playlist-schema.spec.ts` → FAIL (missing keys stripped / missing-field accepted).
- [ ] **Step 3: Implement the type + schema.**
  - `src/lib/types/domain/playlist.ts` — append to `PlaylistItemPayload` after `coverArt`:

```ts
/**
 * Raw S3 key of the streamable source. Tracks only — the MP3_320 CDN
 * behavior is public/unsigned, so exposing the key is safe. ALWAYS null
 * for videos (video access is via signed URL only) and unavailable items.
 */
s3Key: string | null;
/**
 * Playable URL. Tracks → unsigned `buildCdnUrl(s3Key)`; videos →
 * CloudFront signed URL (24h). Null for unavailable items or when video
 * signing is unconfigured (dev/E2E).
 */
streamUrl: string | null;
/** Video poster image (videos only); null for tracks and unavailable items. */
posterUrl: string | null;
```

- `src/lib/validation/playlist-schema.ts` — append inside `playlistItemPayloadSchema` after `coverArt`:

```ts
  s3Key: z.string().nullable(),
  streamUrl: z.string().nullable(),
  posterUrl: z.string().nullable(),
```

- [ ] **Step 4: Keep the codebase compiling** — run `pnpm run typecheck`; it now enumerates every literal typed as `PlaylistItemPayload`. Apply exactly two mechanical edits:
  - `src/lib/services/playlist-service.ts`: add the `PlaylistItemStreamFields` alias + `NO_STREAM_FIELDS` const (code above, placed with the other module constants, JSDoc: `/** Live stream/poster fields (PR2) — null until attached from the live source row (see attachPlaylistItemStreamUrls, next task). */`), then add `...NO_STREAM_FIELDS,` as the FIRST line of the returned object literal in all four mappers: `toUnavailablePayload`, `toTrackPayload`, `toVideoPayload`, `toAddedItemPayload`.
  - Add `s3Key: null, streamUrl: null, posterUrl: null,` to every spec fixture/expected object the compiler or a `toEqual` failure flags. Known sites (the compiler is the authoritative enumerator — fix ALL it reports):
    - `src/lib/services/playlist-service.spec.ts` (expected payload objects in the detail/addItem matrices)
    - `src/lib/actions/playlist-item-actions.spec.ts` (`addedItem`, ~line 48)
    - `src/lib/actions/playlist-actions.spec.ts` (if it builds detail items)
    - `src/app/api/playlists/[id]/route.spec.ts` (`mockDetail.items[0]`)
    - `src/app/hooks/use-playlist-query.spec.ts`, `src/app/hooks/use-playlist-mutations.spec.ts` (`itemPayload`, ~line 87)
    - `src/app/components/playlists/playlist-view.spec.tsx` (`makeItem`, ~line 41), `playlist-creator.spec.tsx`, `playlist-creator-search.spec.tsx` (`ADDED_ITEM`, ~line 98), `use-creator-server-items.spec.ts`, `use-playlist-creator.spec.ts`
- [ ] **Step 5: Run** `pnpm run test:run` → full suite PASS (schema spec now green; all fixtures aligned). E2E note: the playlists E2E specs assert UI, and the new fields are additive — no E2E changes.
- [ ] **Step 6: Gate + Commit**

```bash
git add -A src/lib/types/domain/playlist.ts src/lib/validation/playlist-schema.ts src/lib/services/playlist-service.ts src/lib src/app
git commit -m "feat(playlists): ✨ stream fields in item payload"
```

---

### Task 3: `attachPlaylistItemStreamUrls` in `PlaylistService`

**Files:**

- Modify: `src/lib/repositories/video-repository.ts` (`videoSummarySelect` + `VideoSummary` gain `s3Key`)
- Modify: `src/lib/services/playlist-service.ts`
- Test: extend `src/lib/repositories/video-repository.spec.ts` and `src/lib/services/playlist-service.spec.ts`

**Interfaces:**

- Consumes:
  - `signStreamUrl(s3Key: string | null | undefined, expiresInSeconds: number = PRESIGNED_URL_EXPIRATION.DOWNLOAD): string | null` (`@/lib/utils/sign-stream-url` — returns `null` when CloudFront envs are unconfigured)
  - `buildCdnUrl(s3Key: string): string` (`@/lib/utils/cdn-url`)
  - `SourceMaps { tracks: Map<string, TrackFileWithRelease>; videos: Map<string, VideoSummary> }` (service-private, PR1)
  - Domain `Video.s3Key: string`, `Video.posterUrl: string | null`
- Produces:

```ts
// src/lib/repositories/video-repository.ts — VideoSummary now includes the key
export type VideoSummary = Pick<Video, 'id' | 'title' | 'artist' | 'durationSeconds' | 'posterUrl' | 's3Key'>;

// src/lib/services/playlist-service.ts (module-level; spec-bound name)
const attachPlaylistItemStreamUrls = (payload: PlaylistItemPayload, maps: SourceMaps): PlaylistItemPayload;
// ResolvedSource gains: stream: PlaylistItemStreamFields (so addItem payloads carry the fields too)
```

- [ ] **Step 1: Failing repository spec** — in `src/lib/repositories/video-repository.spec.ts`, extend the existing `findManyByIds` / `searchPublished` assertions so the expected `select` includes `s3Key: true` (and add `s3Key` to any `VideoSummary` fixtures in that file). Run `pnpm run test:run src/lib/repositories/video-repository.spec.ts` → FAIL.
- [ ] **Step 2: Implement the repo change** — in `video-repository.ts`: add `s3Key: true,` to `videoSummarySelect`; add `'s3Key'` to the `VideoSummary` `Pick`; the `_VideoSummaryDrift` guard revalidates automatically. Re-run → PASS. (`s3Key` on a `VideoSummary` never reaches a client: `videoToSearchItem` and `toVideoPayload` map explicit fields only — confirm both while there.)
- [ ] **Step 3: Failing service spec** — in `src/lib/services/playlist-service.spec.ts`:
  - Top of file: add the boundary mock (after the existing mocks):

```ts
vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: vi.fn((s3Key: string | null | undefined) => (s3Key ? `signed:${s3Key}` : null)),
}));
```

- Add `s3Key: 'videos/video-1.mp4',` to the `makeVideo` builder defaults (the widened `VideoSummary` type forces this anyway).
- Stub the CDN domain so `buildCdnUrl` is deterministic — in the new `describe`, `beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.test'); });` and `afterEach(() => { vi.unstubAllEnvs(); });`
- New `describe('getOwnedOrPublicDetail stream fields', …)` cases (drive through the public API, mocking `PlaylistRepository.findByIdWithItems` + `trackFileRepoMock.findManyByIdsWithRelease` + `VideoRepository.findManyByIds` exactly as the existing detail tests do):
  1. resolved track (`makeTrackFile()`, s3Key `releases/release-1/tracks/01-live-song.mp3`) → item has `s3Key: 'releases/release-1/tracks/01-live-song.mp3'`, `streamUrl: 'https://cdn.test/releases/release-1/tracks/01-live-song.mp3'`, `posterUrl: null`.
  2. resolved track on an UNPUBLISHED release (`makeTrackFile({ publishedAt: null })`) → grandfathered: `available: true` AND stream fields still attached (source row resolved).
  3. resolved video → `s3Key: null` (never the raw key), `streamUrl: 'signed:videos/video-1.mp4'`, `posterUrl: 'https://cdn.test/posters/video-1.jpg'`; also assert `signStreamUrl` was called with exactly one argument (`'videos/video-1.mp4'`) so the 24h default TTL applies.
  4. unavailable track (file lookup returns `[]`) → all three `null`.
  5. unavailable video (published lookup returns `[]`) → all three `null`.
- New `addItem` case: successful `{ duplicate: false }` result's `item` carries the same track stream fields (repo `addItem` mocked to echo the created record, as existing tests do).
- Update the EXISTING detail/addItem expected objects from Task 2's `s3Key: null, streamUrl: null, posterUrl: null` to the real values where the item is a resolved track/video (unavailable expectations stay all-null).
- [ ] **Step 4: Run** `pnpm run test:run src/lib/services/playlist-service.spec.ts` → FAIL (fields still null).
- [ ] **Step 5: Implement in `playlist-service.ts`:**
  - Imports: `import { signStreamUrl } from '@/lib/utils/sign-stream-url';` (`buildCdnUrl` already imported).
  - Pure helpers (module level, next to `NO_STREAM_FIELDS`):

```ts
/** Track stream fields: the MP3_320 CDN behavior is public, so the raw key + unsigned URL are safe. */
const trackStreamFields = (s3Key: string): PlaylistItemStreamFields => ({
  s3Key,
  streamUrl: buildCdnUrl(s3Key),
  posterUrl: null,
});

/**
 * Video stream fields: NEVER expose the raw video key — access is via the
 * CloudFront signed URL only (24h default TTL; null when signing is
 * unconfigured, e.g. dev/E2E).
 */
const videoStreamFields = ({
  s3Key,
  posterUrl,
}: Pick<VideoSummary, 's3Key' | 'posterUrl'>): PlaylistItemStreamFields => ({
  s3Key: null,
  streamUrl: signStreamUrl(s3Key),
  posterUrl,
});

/**
 * Attach the live stream/poster fields to a resolved item payload (spec:
 * "attachPlaylistItemStreamUrls"). Keyed off the SAME source maps used for
 * item resolution, so fields attach whenever the source row resolved —
 * including grandfathered unpublished releases — and stay null for dangling
 * items.
 */
const attachPlaylistItemStreamUrls = (
  payload: PlaylistItemPayload,
  { tracks, videos }: SourceMaps
): PlaylistItemPayload => {
  if (payload.itemType === 'track') {
    const file = payload.trackFileId ? tracks.get(payload.trackFileId) : undefined;
    return { ...payload, ...(file ? trackStreamFields(file.s3Key) : NO_STREAM_FIELDS) };
  }
  const video = payload.videoId ? videos.get(payload.videoId) : undefined;
  return { ...payload, ...(video ? videoStreamFields(video) : NO_STREAM_FIELDS) };
};
```

- `ResolvedSource` gains `stream: PlaylistItemStreamFields`; `toTrackResolved` sets `stream: trackStreamFields(file.s3Key)`, `toVideoResolved` sets `stream: videoStreamFields(video)`.
- `resolveItemPayloads` wraps each mapped payload: `…​.map((item) => attachPlaylistItemStreamUrls(item.itemType === 'track' ? toTrackPayload(…) : toVideoPayload(…), maps))` (keep the existing ternary; the wrap adds no branch).
- `toAddedItemPayload` replaces `...NO_STREAM_FIELDS` with `...resolved.stream` (destructure `stream` alongside `coverArt`/`releaseTitle`).
- [ ] **Step 6: Run** `pnpm run test:run src/lib/services/playlist-service.spec.ts src/lib/repositories/video-repository.spec.ts` → PASS.
- [ ] **Step 7: Gate + Commit**

```bash
git add src/lib/repositories/video-repository.ts src/lib/repositories/video-repository.spec.ts src/lib/services/playlist-service.ts src/lib/services/playlist-service.spec.ts
git commit -m "feat(playlists): ✨ attach item stream urls"
```

---

### Task 4: `GET /api/playlists/[id]/download` (format zip, preflight, quota)

**Files:**

- Modify: `src/lib/repositories/release-digital-format-file-repository.ts` (+ its `.spec.ts`)
- Modify: `src/lib/services/playlist-service.ts` (+ its `.spec.ts`) — `getDownloadManifest`
- Modify: `src/lib/validation/playlist-schema.ts` (+ its `.spec.ts`) — download query + preflight schemas
- Create: `src/app/api/playlists/[id]/download/route.ts`
- Test: `src/app/api/playlists/[id]/download/route.spec.ts`

**Interfaces:**

- Consumes:
  - `QuotaEnforcementService.checkFreeDownloadQuota(subject: DownloadSubject, releaseId: string): Promise<QuotaCheckResult>` where `QuotaCheckResult = { allowed: boolean; reason?: 'ALREADY_DOWNLOADED' | 'WITHIN_QUOTA' | 'QUOTA_EXCEEDED'; remainingQuota: number; uniqueDownloads: number }`; `incrementQuota(subject, releaseId): Promise<void>`
  - `freeDownloadLockService.acquire(key: string, now?: number): boolean` / `.release(key: string): void` (in-process, 30s TTL)
  - `downloadLimiter.check(DOWNLOAD_LIMIT, ip)` + `extractClientIp` (rate-limit idiom from `[formatType]/route.ts`, E2E-skipped)
  - `FREE_FORMAT_TYPES = ['MP3_320KBPS','AAC'] as const`, `FreeFormatType`, `getFileExtensionForFormat` (`@/lib/constants/digital-formats`)
  - Task 1: `createStoreArchive`, `issuePrefetch`, `safeArchiveEntryName`, `startBufferPrefetch`, `ZipArchive`
  - `withAuth<TParams>(handler): (req, ctx) => …` (handler must return `NextResponse` — the zip path uses `new NextResponse(stream, …)`)
  - `buildContentDisposition(fileName: string): string`; `PlaylistRepository.findByIdWithItems(id)` (items ordered `sortOrder asc`); `ReleaseDigitalFormatFileRepository.findManyByIdsWithRelease(ids)`
- Produces (other clusters — the player dialog's download row — rely on all of this):

```ts
// Route contract (new file src/app/api/playlists/[id]/download/route.ts)
// GET /api/playlists/[id]/download?format=MP3_320KBPS|AAC[&respond=preflight]
//   401 (withAuth) · 429 { success:false, error:'RATE_LIMITED', … }
//   400 { error: 'INVALID_FORMAT' } · 404 { error: 'NOT_FOUND' } (bad id / missing / private-unowned — mirrors the detail route)
//   404 { error: 'NO_TRACKS' } (stream path only, zero downloadable tracks)
//   preflight: 200 { ok: true, trackCount: number, skippedCount: number }
//              403 { ok: false, reason: 'QUOTA_EXCEEDED' } (AAC quota)
//   AAC stream lock collision: 409 { errorCode: 'LOCK_HELD', message: string }
//   stream: 200 application/zip, Content-Disposition: attachment; filename="<sanitized title>.zip",
//           Cache-Control: private, no-store, X-Accel-Buffering: no
export const runtime = 'nodejs';
export const maxDuration = 300;

// src/lib/validation/playlist-schema.ts
export const playlistDownloadQuerySchema = z.object({ format: z.enum(FREE_FORMAT_TYPES) });
export type PlaylistDownloadQuery = z.infer<typeof playlistDownloadQuerySchema>;
export const playlistDownloadPreflightResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), trackCount: z.number().int().nonnegative(), skippedCount: z.number().int().nonnegative() }),
  z.object({ ok: z.literal(false), reason: z.literal('QUOTA_EXCEEDED') }),
]);
export type PlaylistDownloadPreflightResponse = z.infer<typeof playlistDownloadPreflightResponseSchema>;

// src/lib/services/playlist-service.ts
export interface PlaylistDownloadTrack { entryName: string; s3Key: string; releaseId: string }
export interface PlaylistDownloadManifest {
  playlistTitle: string;
  tracks: PlaylistDownloadTrack[];        // playlist order; entryName = "NN - Artist - Title.ext" (dense NN, no gaps; already sanitized)
  skippedCount: number;                   // videos + unavailable + requested-format-missing
  distinctReleaseIds: string[];           // deduped, first-occurrence order (quota subjects)
}
static async getDownloadManifest(playlistId: string, userId: string, format: FreeFormatType): Promise<PlaylistDownloadManifest | null>; // null = missing or private-unowned

// src/lib/repositories/release-digital-format-file-repository.ts
export type PlaylistDownloadFile = Prisma.ReleaseDigitalFormatFileGetPayload<{ select: typeof playlistDownloadFileSelect }>;
// select: { id, trackNumber, s3Key, fileName, format: { select: { formatType, releaseId } } } — NO fileSize (BigInt)
async findManyByReleaseIdsAndFormatType(releaseIds: string[], formatType: DigitalFormatType): Promise<PlaylistDownloadFile[]>;
```

**Design (from reading the repositories):** playlist track items reference MP3_320 `trackFileId`s. The requested format is resolved uniformly per item via `(releaseId, trackNumber)`: (1) `findManyByIdsWithRelease(trackFileIds)` recovers each referenced file's `trackNumber` + `format.releaseId`; (2) ONE `findManyByReleaseIdsAndFormatType(distinctReleaseIds, format)` fetches every candidate file of the requested format across those releases (this is the PR2 lookup the PR1 plan deferred); (3) match on `` `${releaseId}:${trackNumber}` ``. Two queries total; MP3 requests resolve back to the referenced file itself. `NN` = DENSE 2-digit, 1-based position among the tracks actually INCLUDED in the zip (Assembly ratification 2): the first included track is always `01` — a leading video leaves no gap.

#### Step group A — repository lookup

- [ ] **Step A1: Failing spec** — extend `src/lib/repositories/release-digital-format-file-repository.spec.ts` (mirror its existing prisma-mock style) with a `describe('findManyByReleaseIdsAndFormatType')`:

```ts
it('queries requested-format files across releases (published, non-deleted only)', async () => {
  prismaMock.releaseDigitalFormatFile.findMany.mockResolvedValue([]);
  const repo = new ReleaseDigitalFormatFileRepository();
  await repo.findManyByReleaseIdsAndFormatType(['r1', 'r2'], 'AAC');
  expect(prismaMock.releaseDigitalFormatFile.findMany).toHaveBeenCalledWith({
    where: {
      format: {
        is: {
          formatType: 'AAC',
          releaseId: { in: ['r1', 'r2'] },
          OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
          release: {
            is: {
              publishedAt: { not: null },
              AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
            },
          },
        },
      },
      select: {
        id: true,
        trackNumber: true,
        s3Key: true,
        fileName: true,
        format: { select: { formatType: true, releaseId: true } },
      },
    });
});
```

Plus a `runQuery`/`DataError` error-path case mirroring the file's existing ones. (Use the spec's actual prisma mock handle — same file, same idiom.)

- [ ] **Step A2:** `pnpm run test:run src/lib/repositories/release-digital-format-file-repository.spec.ts` → FAIL → implement in the repository:

```ts
/**
 * Select for playlist zip downloads: just enough to match a requested-format
 * file to a playlist item by (releaseId, trackNumber) and stream it from S3.
 * `fileSize` (BigInt) is deliberately omitted — JSON-unsafe.
 */
const playlistDownloadFileSelect = {
  id: true,
  trackNumber: true,
  s3Key: true,
  fileName: true,
  format: { select: { formatType: true, releaseId: true } },
} as const satisfies Prisma.ReleaseDigitalFormatFileSelect;

/** Requested-format file row for playlist downloads. */
export type PlaylistDownloadFile = Prisma.ReleaseDigitalFormatFileGetPayload<{
  select: typeof playlistDownloadFileSelect;
}>;
```

and the method (inside the class, `runQuery`-wrapped):

```ts
/**
 * Fetch every track file of `formatType` across a set of releases, restricted
 * to non-deleted formats on published, non-deleted releases. The playlist
 * download route matches these to items by (releaseId, trackNumber) — the
 * PR2 lookup the PR1 plan deferred.
 */
async findManyByReleaseIdsAndFormatType(
  releaseIds: string[],
  formatType: DigitalFormatType
): Promise<PlaylistDownloadFile[]> {
  return runQuery(() =>
    prisma.releaseDigitalFormatFile.findMany({
      where: {
        format: {
          is: {
            formatType,
            releaseId: { in: releaseIds },
            OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
            release: { is: publishedReleaseFilter },
          },
        },
      },
      select: playlistDownloadFileSelect,
    })
  );
}
```

(import `DigitalFormatType` from `@/lib/constants/digital-formats`). Re-run → PASS.

- [ ] **Step A3: Commit** — `git add src/lib/repositories/release-digital-format-file-repository.ts src/lib/repositories/release-digital-format-file-repository.spec.ts && git commit -m "feat(playlists): ✨ format file lookup by release"`

#### Step group B — service manifest + query/preflight schemas

- [ ] **Step B1: Failing specs.**
  - `src/lib/validation/playlist-schema.spec.ts`: `playlistDownloadQuerySchema` accepts `MP3_320KBPS`/`AAC`, rejects `FLAC` and `undefined`; `playlistDownloadPreflightResponseSchema` round-trips `{ ok: true, trackCount: 2, skippedCount: 1 }` and `{ ok: false, reason: 'QUOTA_EXCEEDED' }`, rejects `{ ok: false, reason: 'OTHER' }`.
  - `src/lib/services/playlist-service.spec.ts`: extend `trackFileRepoMock` (the `vi.hoisted` object AND the mocked class) with `findManyByReleaseIdsAndFormatType: vi.fn()`; extend the `makeTrackFile` builder's `TrackFileOptions` with `trackNumber?: number` (default 1). New `describe('getDownloadManifest')`:
    1. missing playlist → `null`; private-unowned → `null`; owner-private → manifest returned.
    2. dense numbering + skips: playlist items `[video (sortOrder 0), trackA (sortOrder 1, trackFileId 'file-1'), trackB dangling (sortOrder 2, trackFileId 'file-x')]`, source lookup resolves only `makeTrackFile({ id: 'file-1', trackNumber: 4 })`; target lookup returns `[{ id: 'aac-1', trackNumber: 4, s3Key: 'releases/release-1/digital-formats/AAC/aac-1.aac', fileName: 'aac-1.aac', format: { formatType: 'AAC', releaseId: 'release-1' } }]` → `tracks` = one entry `{ entryName: '01 - Killah Trakz - Live Song.aac', s3Key: 'releases/release-1/digital-formats/AAC/aac-1.aac', releaseId: 'release-1' }` (dense — the leading video leaves NO gap: the first included track is always `01`), `skippedCount: 2`, `distinctReleaseIds: ['release-1']`.
    3. requested-format-missing: target lookup returns `[]` → that track skipped (counted).
    4. entry-name sanitization: `makeTrackFile({ title: 'Weird/Name: Ex?' })` → entryName contains no `/` or `:` (goes through `safeArchiveEntryName`).
    5. query shapes: `findManyByIdsWithRelease` called with the item `trackFileId`s; `findManyByReleaseIdsAndFormatType` called with deduped releaseIds + `'AAC'`; NEITHER called when the playlist has no track items (all-video playlist → `tracks: []`, `skippedCount = items.length`).
    6. MP3 ext: same fixture with format `'MP3_320KBPS'` → entryName ends `.mp3`.
- [ ] **Step B2:** run both spec files → FAIL → implement.
  - `playlist-schema.ts`: add the two schemas + types from Produces verbatim (import `FREE_FORMAT_TYPES` from `@/lib/constants/digital-formats`).
  - `playlist-service.ts` — imports: `import { getFileExtensionForFormat, type FreeFormatType } from '@/lib/constants/digital-formats';`, `import { safeArchiveEntryName } from '@/lib/utils/zip-stream';`, `import type { PlaylistDownloadFile } from '@/lib/repositories/release-digital-format-file-repository';`. Module-level:

```ts
/** One zip entry of a playlist download: name is pre-sanitized, NN = dense 2-digit position among included tracks. */
export interface PlaylistDownloadTrack {
  entryName: string;
  s3Key: string;
  releaseId: string;
}

/** Everything the download route needs: entries in playlist order + skip/quota accounting. */
export interface PlaylistDownloadManifest {
  playlistTitle: string;
  tracks: PlaylistDownloadTrack[];
  skippedCount: number;
  distinctReleaseIds: string[];
}

/** `NN - Artist - Title.ext`, sanitized as a whole via safeArchiveEntryName. */
const buildEntryName = (
  position: number,
  artistName: string,
  title: string,
  format: FreeFormatType
): string =>
  safeArchiveEntryName(
    `${String(position).padStart(2, '0')} - ${artistName} - ${title}.${getFileExtensionForFormat(format)}`
  );

/** Batched lookups for download resolution, keyed by file id / (releaseId:trackNumber). */
interface DownloadResolutionMaps {
  sourceById: Map<string, TrackFileWithRelease>;
  targetByReleaseTrack: Map<string, PlaylistDownloadFile>;
}

/**
 * Resolve one playlist item to a downloadable requested-format entry, or null
 * when it must be skipped (video, dangling source, unpublished release, or
 * the release lacks the requested format). `position` is the 1-based DENSE
 * position among the tracks already included (Assembly ratification 2) —
 * the caller advances it only on inclusion, so skips leave no numbering gaps.
 */
const resolveDownloadTrack = (
  item: PlaylistItemRecord,
  position: number,
  format: FreeFormatType,
  { sourceById, targetByReleaseTrack }: DownloadResolutionMaps
): PlaylistDownloadTrack | null => {
  if (item.itemType !== 'track' || !item.trackFileId) return null;
  const source = sourceById.get(item.trackFileId);
  if (!source || !source.format.release.publishedAt) return null;
  const target = targetByReleaseTrack.get(`${source.format.releaseId}:${source.trackNumber}`);
  if (!target) return null;
  const title = source.title ?? item.title;
  const artistName = firstArtistName(source.format.release.artistReleases) ?? item.artistName;
  return {
    entryName: buildEntryName(position, artistName, title, format),
    s3Key: target.s3Key,
    releaseId: source.format.releaseId,
  };
};
```

and the static method (inside `PlaylistService`):

```ts
/**
 * Build the zip manifest for GET /api/playlists/[id]/download: owner-or-
 * public visibility (null otherwise — indistinguishable from missing),
 * requested-format resolution per track via (releaseId, trackNumber), videos
 * and unresolvable items skipped and counted. Downloads intentionally require
 * a PUBLISHED release (stricter than playback's grandfathering).
 */
static async getDownloadManifest(
  playlistId: string,
  userId: string,
  format: FreeFormatType
): Promise<PlaylistDownloadManifest | null> {
  const playlist = await PlaylistRepository.findByIdWithItems(playlistId);
  if (!playlist) return null;
  if (!playlist.isPublic && playlist.ownerId !== userId) return null;

  const trackFileIds = playlist.items.flatMap(({ itemType, trackFileId }) =>
    itemType === 'track' && trackFileId ? [trackFileId] : []
  );
  const sourceFiles =
    trackFileIds.length > 0
      ? await PlaylistService.trackFileRepository.findManyByIdsWithRelease(trackFileIds)
      : [];
  const sourceById = new Map(
    sourceFiles.map((file): [string, TrackFileWithRelease] => [file.id, file])
  );
  const sourceReleaseIds = [...new Set(sourceFiles.map(({ format: f }) => f.releaseId))];
  const targets =
    sourceReleaseIds.length > 0
      ? await PlaylistService.trackFileRepository.findManyByReleaseIdsAndFormatType(
          sourceReleaseIds,
          format
        )
      : [];
  const targetByReleaseTrack = new Map(
    targets.map((file): [string, PlaylistDownloadFile] => [
      `${file.format.releaseId}:${file.trackNumber}`,
      file,
    ])
  );

  // Dense NN numbering (Assembly ratification 2): the position counter is the
  // count of tracks included SO FAR (+1), not the playlist index — videos and
  // skipped tracks leave no gaps, and the first included track is always 01.
  const tracks = playlist.items.reduce<PlaylistDownloadTrack[]>((included, item) => {
    const track = resolveDownloadTrack(item, included.length + 1, format, {
      sourceById,
      targetByReleaseTrack,
    });
    return track ? [...included, track] : included;
  }, []);
  return {
    playlistTitle: playlist.title,
    tracks,
    skippedCount: playlist.items.length - tracks.length,
    distinctReleaseIds: [...new Set(tracks.map(({ releaseId }) => releaseId))],
  };
}
```

- [ ] **Step B3:** re-run both spec files → PASS. **Commit** — `git add src/lib/validation src/lib/services && git commit -m "feat(playlists): ✨ playlist download manifest"`

#### Step group C — the route

- [ ] **Step C1: Failing route spec** — create `src/app/api/playlists/[id]/download/route.spec.ts`:

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { freeDownloadLockService } from '@/lib/services/free-download-lock-service';
import { PlaylistService } from '@/lib/services/playlist-service';
import type { PlaylistDownloadManifest } from '@/lib/services/playlist-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: { getDownloadManifest: vi.fn() },
}));

const { checkFreeDownloadQuotaMock, incrementQuotaMock } = vi.hoisted(() => ({
  checkFreeDownloadQuotaMock: vi.fn(),
  incrementQuotaMock: vi.fn(),
}));
vi.mock('@/lib/services/quota-enforcement-service', () => ({
  QuotaEnforcementService: class {
    checkFreeDownloadQuota = checkFreeDownloadQuotaMock;
    incrementQuota = incrementQuotaMock;
  },
}));

const { limiterCheckMock } = vi.hoisted(() => ({ limiterCheckMock: vi.fn() }));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: limiterCheckMock },
  DOWNLOAD_LIMIT: 10,
}));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: vi.fn(() => ({ send: vi.fn() })),
  getS3BucketName: vi.fn(() => 'test-bucket'),
}));

const { startBufferPrefetchMock, issuePrefetchMock } = vi.hoisted(() => ({
  startBufferPrefetchMock: vi.fn(),
  issuePrefetchMock: vi.fn(),
}));
vi.mock('@/lib/utils/zip-stream', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/utils/zip-stream')>('@/lib/utils/zip-stream');
  return {
    ...actual,
    startBufferPrefetch: startBufferPrefetchMock,
    issuePrefetch: issuePrefetchMock,
  };
});

const PLAYLIST_ID = '507f1f77bcf86cd799439011';
const LOCK_KEY = `user:user-1|playlist:${PLAYLIST_ID}|AAC`;

const manifest: PlaylistDownloadManifest = {
  playlistTitle: 'Morning Mix!',
  tracks: [
    {
      entryName: '01 - Ceschi - Cold Wind.aac',
      s3Key: 'releases/r1/digital-formats/AAC/t1.aac',
      releaseId: 'r1',
    },
    {
      entryName: '02 - Sole - Battlefields.aac',
      s3Key: 'releases/r2/digital-formats/AAC/t2.aac',
      releaseId: 'r2',
    },
  ],
  skippedCount: 1,
  distinctReleaseIds: ['r1', 'r2'],
};

const withinQuota = {
  allowed: true,
  reason: 'WITHIN_QUOTA',
  remainingQuota: 3,
  uniqueDownloads: 1,
} as const;
const alreadyDownloaded = {
  allowed: true,
  reason: 'ALREADY_DOWNLOADED',
  remainingQuota: 4,
  uniqueDownloads: 1,
} as const;
const exceeded = {
  allowed: false,
  reason: 'QUOTA_EXCEEDED',
  remainingQuota: 0,
  uniqueDownloads: 5,
} as const;

const makeRequest = (query: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/playlists/${PLAYLIST_ID}/download?${query}`);
const makeContext = (id: string = PLAYLIST_ID): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
  limiterCheckMock.mockResolvedValue(undefined);
  vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue(manifest);
  checkFreeDownloadQuotaMock.mockResolvedValue(withinQuota);
  incrementQuotaMock.mockResolvedValue(undefined);
  startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
    keys.slice(0, 4).map(() => Promise.resolve(Buffer.from('audio-bytes')))
  );
  issuePrefetchMock.mockResolvedValue(Buffer.from('audio-bytes'));
  freeDownloadLockService.release(LOCK_KEY);
});

describe('GET /api/playlists/[id]/download', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(401);
  });

  it('returns 429 when the download limiter rejects', async () => {
    limiterCheckMock.mockRejectedValueOnce(new Error('rate limited'));
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(429);
  });

  it('returns 400 for a non-free format', async () => {
    const response = await GET(makeRequest('format=FLAC'), makeContext());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_FORMAT' });
  });

  it('returns 404 for a malformed id without calling the service', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext('nope'));
    expect(response.status).toBe(404);
    expect(PlaylistService.getDownloadManifest).not.toHaveBeenCalled();
  });

  it('returns 404 when the manifest is null (missing or private-unowned)', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue(null);
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('preflight MP3 reports counts without consulting the quota', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS&respond=preflight'), makeContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, trackCount: 2, skippedCount: 1 });
    expect(checkFreeDownloadQuotaMock).not.toHaveBeenCalled();
  });

  it('preflight AAC checks every distinct release and never charges', async () => {
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(200);
    expect(checkFreeDownloadQuotaMock).toHaveBeenCalledTimes(2);
    expect(checkFreeDownloadQuotaMock).toHaveBeenCalledWith(
      { kind: 'user', userId: 'user-1' },
      'r1'
    );
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('preflight AAC returns 403 QUOTA_EXCEEDED when any release is denied', async () => {
    checkFreeDownloadQuotaMock.mockResolvedValueOnce(withinQuota).mockResolvedValueOnce(exceeded);
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, reason: 'QUOTA_EXCEEDED' });
  });

  it('rejects all-or-nothing when remaining quota cannot cover every new release', async () => {
    // remaining slot = 1, but 2 not-yet-downloaded releases → deny outright.
    const lastSlot = {
      allowed: true,
      reason: 'WITHIN_QUOTA',
      remainingQuota: 0,
      uniqueDownloads: 4,
    } as const;
    checkFreeDownloadQuotaMock.mockResolvedValue(lastSlot);
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(403);
  });

  it('streams an AAC zip, charging only WITHIN_QUOTA releases after the first buffer', async () => {
    checkFreeDownloadQuotaMock
      .mockResolvedValueOnce(alreadyDownloaded) // r1 — allowed, not charged
      .mockResolvedValueOnce(withinQuota); // r2 — charged
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes('01 - Ceschi - Cold Wind.aac')).toBe(true);
    expect(incrementQuotaMock).toHaveBeenCalledTimes(1);
    expect(incrementQuotaMock).toHaveBeenCalledWith({ kind: 'user', userId: 'user-1' }, 'r2');
    // Lock released after the handler returned.
    expect(freeDownloadLockService.acquire(LOCK_KEY)).toBe(true);
    freeDownloadLockService.release(LOCK_KEY);
  });

  it('returns 409 LOCK_HELD when a concurrent AAC download holds the lock', async () => {
    expect(freeDownloadLockService.acquire(LOCK_KEY)).toBe(true);
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ errorCode: 'LOCK_HELD' });
    freeDownloadLockService.release(LOCK_KEY);
  });

  it('streams MP3 with a sanitized attachment filename and no quota calls', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('Morning Mix.zip');
    await response.arrayBuffer();
    expect(checkFreeDownloadQuotaMock).not.toHaveBeenCalled();
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('does not charge when the first prefetched buffer is missing', async () => {
    startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
      keys.slice(0, 4).map(() => Promise.resolve(null))
    );
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('aborts the archive when a later buffer fails mid-stream (no hang)', async () => {
    // First buffer resolves, second rejects (e.g. S3 NoSuchKey mid-playlist).
    // Charge-after-first-buffer rule: the first body was in hand when the
    // charge committed, so the charge STANDS — no refund on mid-stream failure.
    startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
      keys.slice(0, 4).map((_key, index) => {
        if (index === 0) return Promise.resolve(Buffer.from('audio-bytes'));
        const failing = Promise.reject(new Error('NoSuchKey'));
        failing.catch(() => {}); // passive handler, matching issuePrefetch's contract
        return failing;
      })
    );
    const response = await GET(makeRequest('format=AAC'), makeContext());
    // Headers were already committed before the failure surfaced.
    expect(response.status).toBe(200);
    // The drive catches the rejection and archive.abort()s, which ends both
    // sides of the archiver stream — the body TERMINATES (no hang) but the
    // zip is left unfinalized: no end-of-central-directory record (PK\x05\x06),
    // so a client sees a corrupt/incomplete archive, never a silent success.
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
    // Both distinct releases were charged before streaming began.
    expect(incrementQuotaMock).toHaveBeenCalledTimes(2);
  });

  it('returns 404 NO_TRACKS on the stream path for an empty manifest but 200 on preflight', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue({
      playlistTitle: 'Empty',
      tracks: [],
      skippedCount: 3,
      distinctReleaseIds: [],
    });
    const stream = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(stream.status).toBe(404);
    expect(await stream.json()).toEqual({ error: 'NO_TRACKS' });
    const preflight = await GET(makeRequest('format=MP3_320KBPS&respond=preflight'), makeContext());
    expect(preflight.status).toBe(200);
    expect(await preflight.json()).toEqual({ ok: true, trackCount: 0, skippedCount: 3 });
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockRejectedValue(new Error('db down'));
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'INTERNAL_ERROR' });
  });
});
```

- [ ] **Step C2:** `pnpm run test:run "src/app/api/playlists/[id]/download/route.spec.ts"` → FAIL (module not found).
- [ ] **Step C3: Implement** `src/app/api/playlists/[id]/download/route.ts` (each helper keeps the handler ≤10 complexity):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import type { FreeFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { freeDownloadLockService } from '@/lib/services/free-download-lock-service';
import { PlaylistService } from '@/lib/services/playlist-service';
import type {
  PlaylistDownloadManifest,
  PlaylistDownloadTrack,
} from '@/lib/services/playlist-service';
import { QuotaEnforcementService } from '@/lib/services/quota-enforcement-service';
import { buildContentDisposition } from '@/lib/utils/content-disposition';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import {
  createStoreArchive,
  issuePrefetch,
  startBufferPrefetch,
  type ZipArchive,
} from '@/lib/utils/zip-stream';
import { playlistDownloadQuerySchema } from '@/lib/validation/playlist-schema';
import type { DownloadSubject } from '@/types/download-subject';

/** Allow up to 5 minutes for large playlists (matches the bundle route). */
export const maxDuration = 300;
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Playlists stream at a shallower prefetch depth than release bundles (8):
 * MP3/AAC tracks are small and playlists can be long-lived requests, so 4
 * bounds peak memory while still hiding S3 latency.
 */
const PLAYLIST_PREFETCH_DEPTH = 4;

/** Mutable lock handle so the outer `finally` always releases what was taken. */
interface LockHandle {
  key: string | null;
  acquired: boolean;
}

// Rate limiting — skipped in E2E test mode to avoid 429s during test runs,
// matching the sibling release-format download route.
const enforceDownloadRateLimit = async (ip: string): Promise<NextResponse | null> => {
  if (process.env.E2E_MODE === 'true') {
    return null;
  }
  try {
    await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    return null;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }
};

/** Either the fully-resolved download inputs or an early response to return verbatim. */
type DownloadSetup =
  | {
      kind: 'ok';
      manifest: PlaylistDownloadManifest;
      format: FreeFormatType;
      respondPreflight: boolean;
      playlistId: string;
    }
  | { kind: 'response'; response: NextResponse };

/**
 * Rate-limit, validate the playlist id + `format` query, and resolve the
 * download manifest (owner-or-public — missing, private-unowned, and
 * malformed ids all answer the detail route's 404 shape).
 */
const resolvePlaylistDownload = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  userId: string
): Promise<DownloadSetup> => {
  const rateLimited = await enforceDownloadRateLimit(extractClientIp(request));
  if (rateLimited) return { kind: 'response', response: rateLimited };

  const { id: playlistId } = await context.params;
  if (!isValidObjectId(playlistId)) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const parsed = playlistDownloadQuerySchema.safeParse({
    format: request.nextUrl.searchParams.get('format'),
  });
  if (!parsed.success) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'INVALID_FORMAT' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const respondPreflight = request.nextUrl.searchParams.get('respond') === 'preflight';
  const manifest = await PlaylistService.getDownloadManifest(
    playlistId,
    userId,
    parsed.data.format
  );
  if (!manifest) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }
  if (!respondPreflight && manifest.tracks.length === 0) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'NO_TRACKS' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { kind: 'ok', manifest, format: parsed.data.format, respondPreflight, playlistId };
};

/** Per-release AAC quota decision across the whole playlist. */
interface AacQuotaDecision {
  allowed: boolean;
  chargeableReleaseIds: string[];
}

/**
 * All-or-nothing AAC quota check across every distinct release in the
 * playlist: each release goes through `checkFreeDownloadQuota`
 * (ALREADY_DOWNLOADED counts as allowed and is never charged). Because the
 * per-release checks all observe the same uncharged state, the decision also
 * requires enough remaining quota to cover EVERY not-yet-downloaded release
 * at once — 3 new releases with 2 slots left is rejected outright rather
 * than partially charged.
 */
const checkAacQuota = async (
  quotaService: QuotaEnforcementService,
  userId: string,
  releaseIds: readonly string[]
): Promise<AacQuotaDecision> => {
  const subject: DownloadSubject = { kind: 'user', userId };
  const checks = await Promise.all(
    releaseIds.map(async (releaseId) => ({
      releaseId,
      result: await quotaService.checkFreeDownloadQuota(subject, releaseId),
    }))
  );
  const chargeableReleaseIds = checks
    .filter(({ result }) => result.allowed && result.reason === 'WITHIN_QUOTA')
    .map(({ releaseId }) => releaseId);
  const firstChargeable = checks.find(({ result }) => result.reason === 'WITHIN_QUOTA');
  // A WITHIN_QUOTA result's `remainingQuota` is already decremented by one
  // for that release; +1 restores the shared pre-charge remainder.
  const remainingBefore = firstChargeable ? firstChargeable.result.remainingQuota + 1 : 0;
  const everyReleaseAllowed = checks.every(({ result }) => result.allowed);
  const allowed =
    everyReleaseAllowed &&
    (chargeableReleaseIds.length === 0 || chargeableReleaseIds.length <= remainingBefore);
  return { allowed, chargeableReleaseIds };
};

/** Either the chargeable release set or an early quota/lock response. */
type QuotaGate =
  | { kind: 'ok'; chargeableReleaseIds: string[] }
  | { kind: 'response'; response: NextResponse };

/**
 * AAC gate: acquire the per-(user, playlist, format) collision lock around
 * the check-and-charge (skipped for preflight — it never charges), then run
 * the all-or-nothing quota check. MP3 is free/unlimited and bypasses both.
 */
const gateAacQuota = async (args: {
  userId: string;
  playlistId: string;
  format: FreeFormatType;
  manifest: PlaylistDownloadManifest;
  respondPreflight: boolean;
  lock: LockHandle;
}): Promise<QuotaGate> => {
  const { userId, playlistId, format, manifest, respondPreflight, lock } = args;
  if (format !== 'AAC') {
    return { kind: 'ok', chargeableReleaseIds: [] };
  }
  if (!respondPreflight) {
    lock.key = `user:${userId}|playlist:${playlistId}|${format}`;
    lock.acquired = freeDownloadLockService.acquire(lock.key);
    if (!lock.acquired) {
      return {
        kind: 'response',
        response: NextResponse.json(
          {
            errorCode: 'LOCK_HELD',
            message: 'Another download is in progress. Please retry shortly.',
          },
          { status: 409, headers: NO_STORE_HEADERS }
        ),
      };
    }
  }
  const decision = await checkAacQuota(
    new QuotaEnforcementService(),
    userId,
    manifest.distinctReleaseIds
  );
  if (!decision.allowed) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { ok: false, reason: 'QUOTA_EXCEEDED' },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }
  return { kind: 'ok', chargeableReleaseIds: decision.chargeableReleaseIds };
};

/**
 * Peek the first prefetched body, coalescing a rejection (e.g. S3 NoSuchKey)
 * to null so the quota is not charged for a download that delivers nothing;
 * the drive below aborts the archive mid-stream on a failed body.
 */
const peekFirstBuffer = async (
  inFlight: ReadonlyArray<Promise<Buffer | null>>
): Promise<Buffer | null> => {
  const [first] = inFlight;
  if (first === undefined) return null;
  try {
    return await first;
  } catch {
    return null;
  }
};

/**
 * Drain the prefetched buffers into the archive in playlist order, refilling
 * the pipeline as it advances. Runs detached so the Response streams while
 * bytes are produced; errors abort the archive (client sees a reset).
 */
const drivePlaylistArchive = (
  archive: ZipArchive,
  tracks: readonly PlaylistDownloadTrack[],
  prefetch: {
    inFlight: Array<Promise<Buffer | null>>;
    keys: readonly string[];
    s3Client: ReturnType<typeof getS3Client>;
    bucket: string;
  }
): void => {
  void (async () => {
    try {
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks.at(i);
        if (track === undefined) continue;
        const buffer = await prefetch.inFlight.at(i);
        const nextIndex = i + PLAYLIST_PREFETCH_DEPTH;
        const nextKey = prefetch.keys.at(nextIndex);
        if (nextIndex < tracks.length && nextKey !== undefined) {
          prefetch.inFlight.push(issuePrefetch(prefetch.s3Client, prefetch.bucket, nextKey));
        }
        if (buffer === null || buffer === undefined) continue;
        archive.append(buffer, { name: track.entryName });
      }
      archive.finalize();
    } catch (driveError) {
      loggers.downloads.error('Playlist zip drive error', driveError);
      archive.abort();
    }
  })();
};

/** Adapt the archiver Readable into a web stream; cancel aborts the archive. */
const toWebStream = (archive: ZipArchive): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on('end', () => controller.close());
      archive.on('error', (err) => controller.error(err));
    },
    cancel() {
      archive.abort();
    },
  });

/**
 * Stream the zip. The quota charge lands only after the FIRST track body is
 * actually in hand (spec: charge after first prefetched buffer) — an
 * all-missing playlist yields an empty zip and must not consume quota. The
 * charge commits before the Response is returned, so the collision lock
 * (released by the caller's finally) covers the whole check-and-charge.
 */
const streamPlaylistZip = async (args: {
  manifest: PlaylistDownloadManifest;
  userId: string;
  chargeableReleaseIds: string[];
}): Promise<NextResponse> => {
  const { manifest, userId, chargeableReleaseIds } = args;
  const s3Client = getS3Client();
  const bucket = getS3BucketName();
  const keys = manifest.tracks.map(({ s3Key }) => s3Key);
  const inFlight = startBufferPrefetch(s3Client, bucket, keys, PLAYLIST_PREFETCH_DEPTH);
  const firstBuffer = await peekFirstBuffer(inFlight);

  if (firstBuffer !== null && chargeableReleaseIds.length > 0) {
    const quotaService = new QuotaEnforcementService();
    await Promise.all(
      chargeableReleaseIds.map((releaseId) =>
        quotaService.incrementQuota({ kind: 'user', userId }, releaseId)
      )
    );
  }

  const archive = createStoreArchive();
  drivePlaylistArchive(archive, manifest.tracks, { inFlight, keys, s3Client, bucket });

  const safeTitle = manifest.playlistTitle.replace(/[^\w\s.-]/g, '').trim() || 'playlist';
  return new NextResponse(toWebStream(archive), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDisposition(`${safeTitle}.zip`),
      ...NO_STORE_HEADERS,
      'X-Accel-Buffering': 'no',
    },
  });
};

/**
 * GET /api/playlists/[id]/download?format=MP3_320KBPS|AAC[&respond=preflight]
 *
 * Zip the playlist's track items in the requested free format (videos and
 * unresolvable items are skipped). MP3 is free/unlimited; AAC enforces the
 * distinct-release freemium quota all-or-nothing before any byte streams.
 * Preflight reports counts (or the quota rejection) without downloading.
 */
export const GET = withAuth<{ id: string }>(async (request, context, session) => {
  const lock: LockHandle = { key: null, acquired: false };
  try {
    const setup = await resolvePlaylistDownload(request, context, session.user.id);
    if (setup.kind === 'response') return setup.response;
    const { manifest, format, respondPreflight, playlistId } = setup;

    const gate = await gateAacQuota({
      userId: session.user.id,
      playlistId,
      format,
      manifest,
      respondPreflight,
      lock,
    });
    if (gate.kind === 'response') return gate.response;

    if (respondPreflight) {
      return NextResponse.json(
        { ok: true, trackCount: manifest.tracks.length, skippedCount: manifest.skippedCount },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    return await streamPlaylistZip({
      manifest,
      userId: session.user.id,
      chargeableReleaseIds: gate.chargeableReleaseIds,
    });
  } catch (error) {
    loggers.downloads.error('Playlist download error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  } finally {
    // Released as soon as the handler returns — the charge already committed
    // pre-return, so the lock only needs to cover the check-and-charge.
    if (lock.acquired && lock.key !== null) {
      freeDownloadLockService.release(lock.key);
    }
  }
});
```

- [ ] **Step C4:** `pnpm run test:run "src/app/api/playlists/[id]/download/route.spec.ts"` → PASS.
- [ ] **Step C5: Gate + Commit**

```bash
git add "src/app/api/playlists/[id]/download" && git commit -m "feat(playlists): ✨ playlist zip download route"
```

---

### Task 5: Detail hook / client parity

**Files:**

- Modify: `src/app/hooks/use-playlist-query.ts` (JSDoc only)
- Test: extend `src/app/hooks/use-playlist-query.spec.ts`

**Interfaces:**

- Consumes: `playlistDetailResponseSchema` (already carrying the three stream fields since Task 2 — that task's explicit decision: the wire schema lives in `playlist-schema.ts`, which this hook imports, so NO hook code change is needed here) and `usePlaylistQuery(playlistId: string | null, options?: QueryOptionsOverride<PlaylistDetailResponse>)` as shipped in PR1.
- Produces: nothing new — this task is a parity guard. The player-dialog cluster consumes `data.items[n].streamUrl` / `.s3Key` / `.posterUrl` straight off this hook.

- [ ] **Step 1: Add parity guard specs** to `src/app/hooks/use-playlist-query.spec.ts` (characterization tests — Task 2 already carries the schema, so these are EXPECTED to pass immediately; they exist to pin the contract for the player cluster):
  - happy path: the fetch mock returns a detail body whose track item has `s3Key: 'releases/r1/digital-formats/MP3_320KBPS/t1.mp3'`, `streamUrl: 'https://cdn.test/releases/r1/digital-formats/MP3_320KBPS/t1.mp3'`, `posterUrl: null` and whose video item has `s3Key: null`, `streamUrl: 'https://signed.example/v.mp4?Signature=x'`, `posterUrl: 'https://cdn.test/posters/v.jpg'` → assert all six values surface on `result.current.data.items` unchanged.
  - drift guard: the same body with the track item's `streamUrl` key deleted → the query settles in the error state (schema validation failure), proving a server-side field removal cannot silently reach the player.
- [ ] **Step 2: Run** `pnpm run test:run src/app/hooks/use-playlist-query.spec.ts` → PASS (state explicitly in the task log that these are parity guards, not red-first TDD — the behavior shipped in Task 2).
- [ ] **Step 3: Update the hook JSDoc** — in `use-playlist-query.ts`, extend the `usePlaylistQuery` doc: "Items include per-request stream fields (`s3Key`/`streamUrl`/`posterUrl`): tracks carry an unsigned CDN URL, videos a CloudFront-signed URL (24h) with the raw key withheld."
- [ ] **Step 4: Hydration-parity verification (confirm and record — no code expected to change):**
  - `grep -n "prefetchQuery" src/app/playlists/page.tsx` → exactly ONE prefetch, `queryKeys.playlists.mine()` (the LIST). The list payload (`PlaylistListRow` / `playlistListRowSchema`) is untouched by PR2 — confirm with `git diff origin/main -- src/lib/validation/playlist-schema.ts src/lib/types/domain/playlist.ts | grep -i "ListRow"` returning no hunks.
  - Therefore the SSR-dehydrated cache on `/playlists` never contains item payloads, and the detail query (whose `streamUrl` is per-request signed for videos) is client-fetch-only → no server/client hydration divergence is possible. Record this conclusion in the task report verbatim.
  - `pnpm run test:run src/app/playlists/page.spec.tsx src/app/components/playlists` → PASS (no client fixture drift remains; Task 2 already aligned them).
- [ ] **Step 5: Gate + Commit**

```bash
git add src/app/hooks/use-playlist-query.ts src/app/hooks/use-playlist-query.spec.ts
git commit -m "test(playlists): ✅ detail stream-field parity"
```

---

## Notes for the plan assembler / other clusters

1. **Video `streamUrl` is `null` when CloudFront signing is unconfigured (dev/E2E)** and `s3Key` is `null` by design — the player cluster CANNOT fall back to `buildCdnUrl` for playlist video items (unlike `/videos`, whose payload exposes `s3Key`). The player must treat a video item with `streamUrl: null` as unplayable-in-place (or source playback from the videos flow); E2E video-playback assertions must account for this.
2. **Preflight `trackCount: 0` returns 200** — the client (Task 8) parses the body with `playlistDownloadPreflightResponseSchema` and guards: zero tracks → toast, NO stream request; the stream path answers `404 { error: 'NO_TRACKS' }`.
3. **AAC all-or-nothing** includes a remaining-quota coverage guard (N new releases need N free slots — partial charging is impossible by construction).
4. Entry numbering (`NN`) is DENSE: the 1-based position among the tracks actually included in the zip — the first included track is always `01`; videos/skipped items leave no gaps (Assembly ratification 2). On-disk track ORDER still follows playlist order.
5. If the shared-link page `/playlists/[id]` (frontend cluster) SSR-prefetches the DETAIL, the dehydrated HTML will embed per-request signed video URLs — same exposure class as the existing `/videos` SSR prefetch (accepted pattern), but be deliberate about it.

### Task 6: `VideoPlayerSurface` additive `onEnded`

**Files:**

- Modify: `src/app/components/ui/video/video-player-surface.tsx`
- Test: `src/app/components/ui/video/video-player-surface.spec.tsx` (extend existing)

**Interfaces:**

- Consumes (verified): `VideoPlayerSurfaceProps { title: string; src: string; posterUrl?: string | null }`; init effect deps `[src, posterUrl, title, instanceId]`; `player.on('play', …)` listener idiom; `player.dispose()` cleanup; spec's `FakePlayer.trigger(event)` helper.
- Produces (additive — existing consumers `video-player.tsx` / `lazy-video-surface.tsx` untouched):

```ts
export interface VideoPlayerSurfaceProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  /** Fired when playback reaches the end of the source (e.g. queue advance). */
  onEnded?: () => void;
}
```

`LazyVideoSurface` (nextDynamic wrapper) forwards props untouched, so it gains `onEnded` for free.

- [ ] **Failing spec** — append to the existing `describe('VideoPlayerSurface', …)` in `video-player-surface.spec.tsx` (reuses its `getPlayers` + fake-player `trigger`):

```tsx
it('fires onEnded when the player emits ended', () => {
  const onEnded = vi.fn();
  render(
    <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={onEnded} />
  );
  const [player] = getPlayers();

  act(() => player.trigger('ended'));

  expect(onEnded).toHaveBeenCalledTimes(1);
});

it('ignores ended when no onEnded callback is provided', () => {
  render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
  const [player] = getPlayers();

  expect(() => act(() => player.trigger('ended'))).not.toThrow();
});

it('uses the latest onEnded without re-initializing the player', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(
    <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={first} />
  );

  rerender(
    <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={second} />
  );
  const players = getPlayers();
  act(() => players[0].trigger('ended'));

  expect(players).toHaveLength(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
```

- [ ] Run `pnpm run test:run src/app/components/ui/video/video-player-surface.spec.tsx` — expect FAIL: `expected "spy" to be called 1 times, but got 0 times` (first + third new tests).
- [ ] **Implement** in `video-player-surface.tsx` — destructure the new prop, hold it in a ref (mirrors the `media-player-controls.tsx` callback-ref idiom) so a fresh inline arrow from the parent never re-creates the player (init effect deps stay `[src, posterUrl, title, instanceId]`):

```tsx
export const VideoPlayerSurface = ({
  title,
  src,
  posterUrl,
  onEnded,
}: VideoPlayerSurfaceProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [hasError, setHasError] = useState(false);
  // Ref-carried so callback identity changes never tear down the player.
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
```

and inside the main effect, directly after the existing `player.on('play', …)` block:

```tsx
player.on('ended', () => {
  onEndedRef.current?.();
});
```

Disposal is already covered by the existing `player.dispose()` cleanup. Update the component JSDoc to mention the queue-advance callback.

- [ ] Run `pnpm run test:run src/app/components/ui/video/video-player-surface.spec.tsx` — PASS (all existing + 3 new).
- [ ] Prove consumers untouched: `pnpm run test:run src/app/components/ui/video` — all green (`video-player.spec.tsx`, `get-video-mime-type.spec.ts`, `video-playback-coordinator.spec.ts`).
- [ ] Commit: `feat(video): ✨ onEnded prop on player surface`

---

### Task 7: `PlaylistPlayer` (+ `InfoTickerTape` minimal variant)

**Files:**

- Modify: `src/app/components/ui/audio/media-player/media-player.tsx` (additive third `InfoTickerTape` prop variant — the spec's "minimal-variant")
- Test: `src/app/components/ui/audio/media-player/media-player.spec.tsx` (extend)
- Create: `src/app/components/playlists/playlist-player.tsx`
- Test: `src/app/components/playlists/playlist-player.spec.tsx`

**Interfaces:**

- Consumes (verified from source):
  - `useTrackNavigation(files: readonly TrackNavItem[], initialAutoPlay: boolean)` from `@/components/use-track-navigation` returning `{ currentIndex, setCurrentIndex, shouldAutoPlay, setShouldAutoPlay, handleFileSelect, handleTrackEnded, handlePreviousTrack, handleNextTrack }` (`TrackNavItem = { id: string }`; `handleFileSelect` enables autoplay; ended/next no-op at the end).
  - `MediaPlayer.InteractiveCoverArt({ src, alt, isPlaying, onTogglePlay, className?, priority? })`; `MediaPlayer.Controls` (= `LazyControls` → `Controls({ audioSrc, onPreviousTrack?, onNextTrack?, onPlay?, onPause?, onEnded?, autoPlay?, controlsRef? })`); `MediaPlayerControls { play(): void; pause(): void; toggle(): void }` — both from `@/ui/audio/media-player`. NOTE (verified in `media-player-controls.tsx` L162–192): a freshly mounted Controls never autoplays its _initial_ source — keyed remounts therefore need the `controlsRef.play()` trick (release-player precedent L255–260).
  - `LazyVideoSurface` from `@/ui/video/lazy-video-surface` (forwards `VideoPlayerSurfaceProps` incl. Task 6's `onEnded`).
  - `resolveStreamUrl({ s3Key?, streamUrl? }): string | null` from `@/lib/utils/cdn-url` (prefers `streamUrl`, falls back to `buildCdnUrl(s3Key)`).
  - `PlaylistItemPayload` from `@/lib/types/domain/playlist` (with Cluster A's `s3Key`/`streamUrl`/`posterUrl`).
  - `PlaylistCoverTiles({ images, alt, size?, className? })` from `./playlist-cover-tiles` — the spec's "player fallback" reuse.
  - `formatDuration(seconds)` from `@/lib/utils/format-duration`; `Badge` from `@/components/ui/badge`; `cn` from `@/lib/utils`.
- Produces:

```ts
// media-player.tsx — additive third InfoTickerTape variant (other clusters may reuse):
interface InfoTickerTapeMinimalProps {
  trackTitle: string;
  artistName?: string | null;
  artistRelease?: never;
  featuredArtist?: never;
  trackName?: never;
  isPlaying?: boolean;
  onTrackSelect?: (trackId: string) => void;
}
type InfoTickerTapeProps =
  | InfoTickerTapeArtistReleaseProps
  | InfoTickerTapeFeaturedArtistProps
  | InfoTickerTapeMinimalProps;

// playlist-player.tsx — props LOCKED:
export const PlaylistPlayer = ({
  items,
  title,
}: {
  items: PlaylistItemPayload[];
  title: string;
}): ReactElement;
```

**Design (binding):** sorts `items` by `sortOrder` defensively (matches `PlaylistView`); the playable queue = sorted items with `available && resolveStreamUrl(item) !== null` (tracks AND videos, queue order; videos play inline). Surfaces are KEYED per item id; the track↔video ternary guarantees exactly one surface mounted (NO forceMount) — the video.js lifecycle risk from spec L226. Unavailable items render disabled in the queue and are excluded from the navigation array, so ended/next skips them. Fallback art when the current track has no `coverArt` = `PlaylistCoverTiles` over the deduped non-null `coverArt`s of the items (playlist mosaic, alt = playlist title).

- [ ] **Failing spec (ticker minimal variant)** — append to `media-player.spec.tsx` using its existing `render`/`screen` imports:

```tsx
describe('InfoTickerTape minimal variant', () => {
  it('renders the track title with the artist name', () => {
    render(<MediaPlayer.InfoTickerTape trackTitle="Night Drive" artistName="Ceschi" />);

    expect(screen.getByText('Night Drive • by Ceschi')).toBeInTheDocument();
  });

  it('renders the title alone when artistName is null', () => {
    render(<MediaPlayer.InfoTickerTape trackTitle="Night Drive" artistName={null} />);

    expect(screen.getByText('Night Drive')).toBeInTheDocument();
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/ui/audio/media-player/media-player.spec.tsx` — expect FAIL: `TypeError: Cannot read properties of undefined (reading 'artist')` (the resolver falls through to the artistRelease branch).
- [ ] **Implement (media-player.tsx)** — add `InfoTickerTapeMinimalProps` (above the union), extend the union, and rework the resolver to three explicit branches (keeps the file's existing cast style; complexity 4):

```tsx
const resolveInfoTickerTapeDisplay = (props: InfoTickerTapeProps): InfoTickerTapeDisplay => {
  if ('featuredArtist' in props && props.featuredArtist) {
    const { featuredArtist } = props;
    return {
      displayName: getFeaturedArtistDisplayName(featuredArtist),
      releaseTitle: featuredArtist.release?.title ?? null,
      trackTitle: props.trackTitle ?? '',
    };
  }

  if ('artistRelease' in props && props.artistRelease) {
    const { artistRelease, trackName } = props as InfoTickerTapeArtistReleaseProps;
    return {
      displayName: getArtistDisplayName(artistRelease.artist),
      releaseTitle: artistRelease.release.title,
      trackTitle: trackName,
    };
  }

  const { trackTitle, artistName } = props as InfoTickerTapeMinimalProps;
  return { displayName: artistName ?? null, releaseTitle: null, trackTitle };
};
```

Update the `InfoTickerTape` JSDoc (`@remarks` now lists three usage patterns; minimal = playlist player).

- [ ] Run `pnpm run test:run src/app/components/ui/audio/media-player/media-player.spec.tsx` — PASS.
- [ ] Commit: `feat(media-player): ✨ ticker minimal variant`
- [ ] **Failing spec (player)** — create `src/app/components/playlists/playlist-player.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistItemPayload } from '@/lib/types/domain/playlist';

import { PlaylistPlayer } from './playlist-player';

const playMock = vi.hoisted(() => vi.fn());
const toggleMock = vi.hoisted(() => vi.fn());

interface ControlsStubProps {
  audioSrc: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  controlsRef?: (
    controls: { play: () => void; pause: () => void; toggle: () => void } | null
  ) => void;
}

interface CoverArtStubProps {
  src: string;
  alt: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

interface TickerStubProps {
  trackTitle: string;
  artistName?: string | null;
}

vi.mock('@/ui/audio/media-player', async () => {
  const { useEffect } = await import('react');

  const ControlsStub = ({ audioSrc, onPlay, onPause, onEnded, controlsRef }: ControlsStubProps) => {
    useEffect(() => {
      controlsRef?.({ play: playMock, pause: vi.fn(), toggle: toggleMock });
      return () => controlsRef?.(null);
    }, [controlsRef]);

    return (
      <div data-testid="audio-controls" data-audio-src={audioSrc}>
        <button type="button" onClick={onPlay}>
          stub-audio-play
        </button>
        <button type="button" onClick={onPause}>
          stub-audio-pause
        </button>
        <button type="button" onClick={onEnded}>
          stub-audio-ended
        </button>
      </div>
    );
  };

  const MediaPlayerStub = Object.assign(
    ({ children }: { children: React.ReactNode }) => (
      <div data-testid="media-player">{children}</div>
    ),
    {
      Controls: ControlsStub,
      InteractiveCoverArt: ({ src, isPlaying, onTogglePlay }: CoverArtStubProps) => (
        <button
          type="button"
          data-testid="cover-art"
          data-src={src}
          data-playing={String(isPlaying)}
          onClick={onTogglePlay}
        >
          stub-toggle-play
        </button>
      ),
      InfoTickerTape: ({ trackTitle, artistName }: TickerStubProps) => (
        <div data-testid="ticker">
          {trackTitle}
          {artistName ? ` • by ${artistName}` : ''}
        </div>
      ),
    }
  );

  return { MediaPlayer: MediaPlayerStub };
});

interface VideoSurfaceStubProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  onEnded?: () => void;
}

vi.mock('@/ui/video/lazy-video-surface', () => ({
  LazyVideoSurface: ({ title, src, posterUrl, onEnded }: VideoSurfaceStubProps) => (
    <div
      data-testid="video-surface"
      data-src={src}
      data-poster={posterUrl ?? ''}
      aria-label={title}
    >
      <button type="button" onClick={onEnded}>
        stub-video-ended
      </button>
    </div>
  ),
}));

vi.mock('./playlist-cover-tiles', () => ({
  PlaylistCoverTiles: ({ images, alt }: { images: string[]; alt: string }) => (
    <div data-testid="cover-tiles" data-count={images.length}>
      {alt}
    </div>
  ),
}));

const makeItem = (overrides: Partial<PlaylistItemPayload>): PlaylistItemPayload => ({
  id: 'item-1',
  itemType: 'track',
  sortOrder: 0,
  title: 'Track One',
  artistName: 'Ceschi',
  duration: 200,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: 'Broken Bone Ballads',
  videoId: null,
  coverArt: 'https://cdn.example.com/cover-1.jpg',
  s3Key: 'releases/rel-1/digital-formats/MP3_320KBPS/a.mp3',
  streamUrl: 'https://cdn.example.com/a.mp3',
  posterUrl: null,
  ...overrides,
});

const trackOne = makeItem({});
const video = makeItem({
  id: 'item-2',
  itemType: 'video',
  sortOrder: 1,
  title: 'Video One',
  trackFileId: null,
  releaseId: null,
  releaseTitle: null,
  videoId: 'vid-1',
  coverArt: 'https://cdn.example.com/poster.jpg',
  s3Key: null,
  streamUrl: 'https://signed.example.com/v.mp4?sig=abc',
  posterUrl: 'https://cdn.example.com/poster.jpg',
});
const trackTwo = makeItem({
  id: 'item-3',
  sortOrder: 2,
  title: 'Track Two',
  trackFileId: 'tf-2',
  coverArt: null,
  s3Key: 'releases/rel-1/digital-formats/MP3_320KBPS/b.mp3',
  streamUrl: 'https://cdn.example.com/b.mp3',
});
const unavailable = makeItem({
  id: 'item-4',
  sortOrder: 3,
  title: 'Gone Song',
  available: false,
  trackFileId: null,
  releaseId: null,
  releaseTitle: null,
  s3Key: null,
  streamUrl: null,
});

const allItems = [trackOne, video, trackTwo, unavailable];

const renderPlayer = (items: PlaylistItemPayload[] = allItems): void => {
  render(<PlaylistPlayer items={items} title="Road Mix" />);
};

describe('PlaylistPlayer', () => {
  it('renders the first playable track through the audio surface', () => {
    renderPlayer();

    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/a.mp3'
    );
  });

  it('shows interactive cover art for a track with cover art', () => {
    renderPlayer();

    expect(screen.getByTestId('cover-art')).toHaveAttribute(
      'data-src',
      'https://cdn.example.com/cover-1.jpg'
    );
  });

  it('falls back to the playlist cover tiles when the track has no art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Track Two' }));

    expect(screen.queryByTestId('cover-art')).not.toBeInTheDocument();
    expect(screen.getByTestId('cover-tiles')).toHaveAttribute('data-count', '2');
  });

  it('lists every item in sortOrder in the queue', () => {
    renderPlayer([trackTwo, unavailable, trackOne, video]);

    const rows = screen.getAllByRole('button', { name: /^Play .+/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Play Track One',
      'Play Video One',
      'Play Track Two',
      'Play Gone Song',
    ]);
  });

  it('disables the unavailable queue row', () => {
    renderPlayer();

    expect(screen.getByRole('button', { name: 'Play Gone Song' })).toBeDisabled();
  });

  it('switching to a video item unmounts the audio surface', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));

    expect(screen.getByTestId('video-surface')).toHaveAttribute(
      'data-src',
      'https://signed.example.com/v.mp4?sig=abc'
    );
    expect(screen.getByTestId('video-surface')).toHaveAttribute(
      'data-poster',
      'https://cdn.example.com/poster.jpg'
    );
    expect(screen.queryByTestId('audio-controls')).not.toBeInTheDocument();
  });

  it('advances past the video to the next track when it ends', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));
    await user.click(screen.getByRole('button', { name: 'stub-video-ended' }));

    expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/b.mp3'
    );
  });

  it('auto-plays the freshly keyed track surface after advancing', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));
    await user.click(screen.getByRole('button', { name: 'stub-video-ended' }));

    expect(playMock).toHaveBeenCalled();
  });

  it('skips unavailable items when a track ends', async () => {
    const user = userEvent.setup();
    const unavailableMiddle = makeItem({
      ...unavailable,
      id: 'item-5',
      sortOrder: 1,
    });
    renderPlayer([trackOne, unavailableMiddle, makeItem({ ...trackTwo, sortOrder: 2 })]);

    await user.click(screen.getByRole('button', { name: 'stub-audio-ended' }));

    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/b.mp3'
    );
  });

  it('shows the current title and artist in the ticker', () => {
    renderPlayer();

    expect(screen.getByTestId('ticker')).toHaveTextContent('Track One • by Ceschi');
  });

  it('toggles playback from the cover art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'stub-toggle-play' }));

    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('reflects audio play state on the cover art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'stub-audio-play' }));

    expect(screen.getByTestId('cover-art')).toHaveAttribute('data-playing', 'true');
  });

  it('renders the empty state when nothing is playable', () => {
    renderPlayer([unavailable]);

    expect(screen.getByText('No playable items in this playlist.')).toBeInTheDocument();
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-player.spec.tsx` — expect FAIL: `Failed to resolve import "./playlist-player"`.
- [ ] **Implement** `src/app/components/playlists/playlist-player.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { useTrackNavigation } from '@/components/use-track-navigation';
import type { PlaylistItemPayload } from '@/lib/types/domain/playlist';
import { cn } from '@/lib/utils';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatDuration } from '@/lib/utils/format-duration';
import { MediaPlayer } from '@/ui/audio/media-player';
import type { MediaPlayerControls } from '@/ui/audio/media-player';
import { LazyVideoSurface } from '@/ui/video/lazy-video-surface';

import { PlaylistCoverTiles } from './playlist-cover-tiles';

interface PlaylistPlayerProps {
  /** Playlist items; rendered in `sortOrder` regardless of input order. */
  items: PlaylistItemPayload[];
  /** Playlist title — alt text for the fallback mosaic + queue ARIA label. */
  title: string;
}

/** An item the player can actually stream: available with a resolvable URL. */
const isPlayableItem = (item: PlaylistItemPayload): boolean =>
  item.available && resolveStreamUrl(item) !== null;

interface PlaylistPlayerArtProps {
  coverArt: string | null;
  fallbackImages: string[];
  coverAlt: string;
  tilesAlt: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

/** Cover art with play/pause toggle; playlist tiles stand in when the item has no art. */
const PlaylistPlayerArt = ({
  coverArt,
  fallbackImages,
  coverAlt,
  tilesAlt,
  isPlaying,
  onTogglePlay,
}: PlaylistPlayerArtProps): ReactElement =>
  coverArt ? (
    <MediaPlayer.InteractiveCoverArt
      src={coverArt}
      alt={coverAlt}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
    />
  ) : (
    <button
      type="button"
      onClick={onTogglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className="block w-full cursor-pointer focus:outline-none"
    >
      <PlaylistCoverTiles images={fallbackImages} alt={tilesAlt} size="lg" />
    </button>
  );

interface PlaylistQueueRowProps {
  item: PlaylistItemPayload;
  isCurrent: boolean;
  onSelect: (itemId: string) => void;
}

/** One queue row: title (+video badge), artist, duration; disabled when unplayable. */
const PlaylistQueueRow = ({ item, isCurrent, onSelect }: PlaylistQueueRowProps): ReactElement => {
  const playable = isPlayableItem(item);
  const mutedClass = isCurrent ? 'text-zinc-300' : 'text-zinc-500';

  return (
    <li>
      <button
        type="button"
        disabled={!playable}
        aria-label={`Play ${item.title}`}
        onClick={() => onSelect(item.id)}
        className={cn(
          'flex w-full items-center gap-3 p-3 text-left transition-colors',
          isCurrent ? 'bg-zinc-800 text-zinc-50' : 'hover:bg-zinc-50',
          !playable && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {item.itemType === 'video' && <Badge variant="secondary">video</Badge>}
          {!playable && <span className={cn('shrink-0 text-xs', mutedClass)}>unavailable</span>}
        </span>
        {item.artistName && (
          <span className={cn('truncate text-xs', mutedClass)}>{item.artistName}</span>
        )}
        <span className={cn('shrink-0 text-xs', mutedClass)}>{formatDuration(item.duration)}</span>
      </button>
    </li>
  );
};

interface PlaylistTrackSurfaceProps {
  item: PlaylistItemPayload;
  src: string;
  fallbackImages: string[];
  playlistTitle: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  onTogglePlay: () => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/** Audio stage: art + transport. Keyed per item id by the stage, so every mount is fresh. */
const PlaylistTrackSurface = ({
  item,
  src,
  fallbackImages,
  playlistTitle,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  onTogglePlay,
  setPlayerControls,
}: PlaylistTrackSurfaceProps): ReactElement => (
  <>
    <PlaylistPlayerArt
      coverArt={item.coverArt}
      fallbackImages={fallbackImages}
      coverAlt={`${item.title} cover art`}
      tilesAlt={playlistTitle}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
    />
    <div className="w-full bg-zinc-900">
      <MediaPlayer.Controls
        audioSrc={src}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
        controlsRef={setPlayerControls}
      />
    </div>
  </>
);

interface PlaylistPlayerStageProps extends Omit<PlaylistTrackSurfaceProps, 'src'> {
  src: string;
  onVideoEnded: () => void;
}

/**
 * The keyed media stage: exactly ONE surface mounts at a time (video.js
 * lifecycle risk — spec "keyed subtrees, no forceMount"). Track↔video swaps
 * change the key, so the outgoing surface always disposes before the next
 * one initializes.
 */
const PlaylistPlayerStage = ({
  onVideoEnded,
  ...surface
}: PlaylistPlayerStageProps): ReactElement =>
  surface.item.itemType === 'video' ? (
    <LazyVideoSurface
      key={`video-${surface.item.id}`}
      title={surface.item.title}
      src={surface.src}
      posterUrl={surface.item.posterUrl}
      onEnded={onVideoEnded}
    />
  ) : (
    <PlaylistTrackSurface key={`track-${surface.item.id}`} {...surface} />
  );

/**
 * Light playlist player composed from MediaPlayer leaves. Tracks render
 * cover art + the audio transport; videos render the inline video surface.
 * Navigation runs over the playable subset only, so unavailable items are
 * skipped on ended/next while still shown (disabled) in the queue below.
 */
export const PlaylistPlayer = ({ items, title }: PlaylistPlayerProps): ReactElement => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const playableItems = useMemo(() => sortedItems.filter(isPlayableItem), [sortedItems]);
  const fallbackImages = useMemo(
    () => [
      ...new Set(
        sortedItems.map((item) => item.coverArt).filter((src): src is string => src !== null)
      ),
    ],
    [sortedItems]
  );

  const {
    currentIndex,
    shouldAutoPlay,
    handleFileSelect,
    handleTrackEnded,
    handlePreviousTrack,
    handleNextTrack,
  } = useTrackNavigation(playableItems, false);

  const currentItem = playableItems.at(currentIndex) ?? null;
  const currentSrc = currentItem ? resolveStreamUrl(currentItem) : null;

  // The keyed stage swaps out on item change — reset the play flag with it.
  useEffect(() => {
    setIsPlaying(false);
  }, [currentItem?.id]);

  // A freshly keyed Controls instance never autoplays its initial source
  // (verified in media-player-controls.tsx) — start it explicitly once the
  // new instance reports ready, exactly like the release player's trick.
  useEffect(() => {
    if (shouldAutoPlay && playerControls) playerControls.play();
  }, [playerControls, shouldAutoPlay]);

  if (!currentItem || !currentSrc) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">No playable items in this playlist.</p>
    );
  }

  return (
    <MediaPlayer>
      <div className="w-full border-2 border-black">
        <PlaylistPlayerStage
          item={currentItem}
          src={currentSrc}
          fallbackImages={fallbackImages}
          playlistTitle={title}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleTrackEnded}
          onPreviousTrack={handlePreviousTrack}
          onNextTrack={handleNextTrack}
          onTogglePlay={() => playerControls?.toggle()}
          setPlayerControls={setPlayerControls}
          onVideoEnded={handleTrackEnded}
        />
        <MediaPlayer.InfoTickerTape
          trackTitle={currentItem.title}
          artistName={currentItem.artistName}
          isPlaying={isPlaying}
        />
        <ul
          aria-label={`${title} queue`}
          className="max-h-64 overflow-y-auto border-t-2 border-black"
        >
          {sortedItems.map((item) => (
            <PlaylistQueueRow
              key={item.id}
              item={item}
              isCurrent={item.id === currentItem.id}
              onSelect={handleFileSelect}
            />
          ))}
        </ul>
      </div>
    </MediaPlayer>
  );
};
```

If ESLint `complexity` flags `PlaylistPlayer` or `PlaylistQueueRow`, extract further named helpers (e.g. a `queueRowClassName(isCurrent, playable)` helper) — never inline-suppress.

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-player.spec.tsx` — PASS (13 tests).
- [ ] Regression: `pnpm run test:run src/app/components/ui/audio/media-player src/app/components/release-player.spec.tsx` — green (ticker union change is additive).
- [ ] Commit: `feat(playlists): ✨ playlist player`

---

### Task 8: `PlaylistDownloadRow`

**Files:**

- Create: `src/app/components/playlists/playlist-download-row.tsx`
- Test: `src/app/components/playlists/playlist-download-row.spec.tsx`

**Interfaces:**

- Consumes (verified): `FREE_FORMAT_TYPES = ['MP3_320KBPS', 'AAC'] as const` + `FreeFormatType` from `@/lib/constants/digital-formats`; `playlistDownloadPreflightResponseSchema` from `@/lib/validation/playlist-schema` (Task 4's export — parsing the preflight body here type-checks the zero-track guard and the quota discriminant, and closes the otherwise-unconsumed-export nit); `triggerDownload(url: string, fileName?: string): void` from `@/lib/utils/trigger-download` (anchor-click; server's `Content-Disposition: attachment` makes it a download); the preflight-then-trigger idiom from `format-bundle-download.tsx` (`fetch(preflightUrl, { cache: 'no-store', credentials: 'same-origin' })` → `triggerDownload(streamUrl)`); `Popover/PopoverTrigger/PopoverContent` from `@/components/ui/popover`; `Button` from `@/components/ui/button`; `toast` from `sonner`; Cluster A endpoint (locks above). NOTE: the spec (L202–203) and the repo idiom both say `triggerDownload`, not `window.location.assign` — `triggerDownload` is authoritative (keeps SPA state, matches every existing download path).
- Produces (props LOCKED):

```ts
export const PlaylistDownloadRow = ({
  playlistId,
  disabled,
}: {
  playlistId: string;
  disabled?: boolean;
}): ReactElement;
```

- [ ] **Failing spec** — create `playlist-download-row.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { PlaylistDownloadRow } from './playlist-download-row';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const triggerDownloadMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/trigger-download', () => ({ triggerDownload: triggerDownloadMock }));

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const openPopover = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('button', { name: 'Download playlist' }));
};

describe('PlaylistDownloadRow', () => {
  it('shows both free formats and the videos note in the popover', async () => {
    const user = userEvent.setup();
    render(<PlaylistDownloadRow playlistId="pl-1" />);

    await openPopover(user);

    expect(screen.getByRole('button', { name: 'Download MP3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download AAC' })).toBeInTheDocument();
    expect(screen.getByText('Videos are skipped in downloads')).toBeInTheDocument();
  });

  it('preflights then triggers the MP3 stream on ok', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 3, skippedCount: 1 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(triggerDownloadMock).toHaveBeenCalledExactlyOnceWith(
        '/api/playlists/pl-1/download?format=MP3_320KBPS'
      )
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/playlists/pl-1/download?format=MP3_320KBPS&respond=preflight',
      { cache: 'no-store', credentials: 'same-origin' }
    );
  });

  it('closes the popover after a successful preflight', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 3, skippedCount: 0 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Download MP3' })).not.toBeInTheDocument()
    );
  });

  it('toasts and never streams when the playlist has no downloadable tracks', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 0, skippedCount: 3 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'This playlist has no downloadable tracks.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('suggests MP3 when the AAC quota is exhausted', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, reason: 'QUOTA_EXCEEDED' }));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download AAC' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Free AAC download limit reached — MP3 is always free.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('shows the generic error for a non-quota failure status', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { ok: false }));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Download failed. Please try again.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('shows the generic error on network failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Download failed. Please try again.'
      )
    );
  });

  it('disables both format buttons while a preflight is in flight', async () => {
    const user = userEvent.setup();
    let resolvePreflight: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePreflight = resolve;
        })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    expect(screen.getByRole('button', { name: 'Download MP3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download AAC' })).toBeDisabled();

    resolvePreflight(jsonResponse(200, { ok: true, trackCount: 1, skippedCount: 0 }));
    await waitFor(() => expect(triggerDownloadMock).toHaveBeenCalledTimes(1));
  });

  it('disables the trigger when the row is disabled', () => {
    render(<PlaylistDownloadRow playlistId="pl-1" disabled />);

    expect(screen.getByRole('button', { name: 'Download playlist' })).toBeDisabled();
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-download-row.spec.tsx` — expect FAIL: `Failed to resolve import "./playlist-download-row"`.
- [ ] **Implement** `src/app/components/playlists/playlist-download-row.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState, type ReactElement } from 'react';

import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FREE_FORMAT_TYPES, type FreeFormatType } from '@/lib/constants/digital-formats';
import { triggerDownload } from '@/lib/utils/trigger-download';
import { playlistDownloadPreflightResponseSchema } from '@/lib/validation/playlist-schema';

interface PlaylistDownloadRowProps {
  playlistId: string;
  disabled?: boolean;
}

const FORMAT_BUTTON_LABELS: Record<FreeFormatType, string> = {
  MP3_320KBPS: 'MP3',
  AAC: 'AAC',
};

type PreflightOutcome = 'ok' | 'empty' | 'quota' | 'error';

/** Toast copy per non-ok preflight outcome (exact strings, asserted in specs). */
const PREFLIGHT_ERROR_TOASTS: Record<Exclude<PreflightOutcome, 'ok'>, string> = {
  empty: 'This playlist has no downloadable tracks.',
  quota: 'Free AAC download limit reached — MP3 is always free.',
  error: 'Download failed. Please try again.',
};

const buildPlaylistDownloadUrl = (
  playlistId: string,
  format: FreeFormatType,
  preflight: boolean
): string => {
  const base = `/api/playlists/${encodeURIComponent(playlistId)}/download?format=${format}`;
  return preflight ? `${base}&respond=preflight` : base;
};

/**
 * Preflight the zip endpoint before anchor-navigating to it — without this a
 * 4xx response renders as a raw JSON page (same rationale as
 * format-bundle-download.tsx). The body is parsed with Task 4's
 * `playlistDownloadPreflightResponseSchema`, so `ok: true` with
 * `trackCount: 0` (all-video/empty playlist) is caught HERE — the stream
 * would 404 NO_TRACKS — and the quota discriminant is type-checked.
 */
const runDownloadPreflight = async (
  playlistId: string,
  format: FreeFormatType
): Promise<PreflightOutcome> => {
  try {
    const response = await fetch(buildPlaylistDownloadUrl(playlistId, format, true), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = playlistDownloadPreflightResponseSchema.safeParse(body);
    if (response.ok && parsed.success && parsed.data.ok) {
      return parsed.data.trackCount > 0 ? 'ok' : 'empty';
    }
    if (response.status === 403 && parsed.success && !parsed.data.ok) {
      return 'quota';
    }
    return 'error';
  } catch {
    return 'error';
  }
};

/**
 * Download row shown above the playlist player: a popover offering the two
 * free formats. MP3 streams unsigned; AAC counts against the freemium quota —
 * a quota 403 degrades to a toast steering the user to MP3. Videos are never
 * bundled (server-side skip; the muted line sets expectations).
 */
export const PlaylistDownloadRow = ({
  playlistId,
  disabled,
}: PlaylistDownloadRowProps): ReactElement => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inFlightFormat, setInFlightFormat] = useState<FreeFormatType | null>(null);

  const handleFormatChoice = async (format: FreeFormatType): Promise<void> => {
    setInFlightFormat(format);
    const outcome = await runDownloadPreflight(playlistId, format);
    setInFlightFormat(null);
    if (outcome === 'ok') {
      triggerDownload(buildPlaylistDownloadUrl(playlistId, format, false));
      setPopoverOpen(false);
      return;
    }
    toast.error(PREFLIGHT_ERROR_TOASTS[outcome]);
  };

  return (
    <div className="flex items-center justify-end">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Download playlist"
          >
            <Download aria-hidden="true" />
            Download
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <div className="flex flex-col gap-2">
            {FREE_FORMAT_TYPES.map((format) => (
              <Button
                key={format}
                type="button"
                variant="outline"
                disabled={inFlightFormat !== null}
                aria-label={`Download ${FORMAT_BUTTON_LABELS[format]}`}
                onClick={() => {
                  void handleFormatChoice(format);
                }}
              >
                {inFlightFormat === format && (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                )}
                {FORMAT_BUTTON_LABELS[format]}
              </Button>
            ))}
            <p className="text-xs text-zinc-500">Videos are skipped in downloads</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-download-row.spec.tsx` — PASS (9 tests).
- [ ] Commit: `feat(playlists): ✨ playlist download row`

---

### Task 9: `PlaylistPlayerDialog`

**Files:**

- Create: `src/app/components/playlists/playlist-player-dialog.tsx`
- Test: `src/app/components/playlists/playlist-player-dialog.spec.tsx`

**Interfaces:**

- Consumes (verified): `usePlaylistQuery(playlistId: string | null, options: QueryOptionsOverride<PlaylistDetailResponse> = {})` from `@/hooks/use-playlist-query` returning `{ isPending, error, data, refetch }` (internally re-gates `enabled` with `!!playlistId`); `Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription` from `@/components/ui/dialog`; `Skeleton` from `@/components/ui/skeleton` (skeleton idiom per `playlist-view.tsx`); Task 7 `PlaylistPlayer`; Task 8 `PlaylistDownloadRow`.
- Produces (props LOCKED):

```ts
export const PlaylistPlayerDialog = ({
  playlistId,
  open,
  onOpenChange,
}: {
  playlistId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}): ReactElement;
```

**Design (binding):** dialog just stacks `PlaylistDownloadRow` ABOVE `PlaylistPlayer` — the queue list already lives inside the player (Task 7). Query enabled only while `open && playlistId !== null`. The player subtree is conditionally mounted only while open (Radix already unmounts closed content — no forceMount — and the explicit `open &&` guard makes the video.js teardown intent unmissable). NO purchase options anywhere. No extra `disabled` wiring for the zero-track case either: `PlaylistDownloadRow` guards it itself (preflight `trackCount: 0` → toast, no stream — Task 8), so the dialog passes only `playlistId`.

- [ ] **Failing spec** — create `playlist-player-dialog.spec.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistPlayerDialog } from './playlist-player-dialog';

const usePlaylistQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-playlist-query', () => ({ usePlaylistQuery: usePlaylistQueryMock }));

vi.mock('./playlist-download-row', () => ({
  PlaylistDownloadRow: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="playlist-download-row" data-playlist-id={playlistId} />
  ),
}));

vi.mock('./playlist-player', () => ({
  PlaylistPlayer: ({ items, title }: { items: unknown[]; title: string }) => (
    <div data-testid="playlist-player" data-title={title} data-item-count={items.length} />
  ),
}));

const detail: PlaylistDetailResponse = {
  id: 'pl-1',
  title: 'Road Mix',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 2,
  totalDuration: 400,
  items: [],
};

const mockQuery = ({
  isPending,
  data,
}: {
  isPending: boolean;
  data?: PlaylistDetailResponse;
}): void => {
  usePlaylistQueryMock.mockReturnValue({
    isPending,
    error: Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });
};

describe('PlaylistPlayerDialog', () => {
  it('gates the detail query while the dialog is closed', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open={false} onOpenChange={vi.fn()} />);

    expect(usePlaylistQueryMock).toHaveBeenCalledWith('pl-1', { enabled: false });
  });

  it('enables the query when open with a playlist id', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(usePlaylistQueryMock).toHaveBeenCalledWith('pl-1', { enabled: true });
  });

  it('shows skeletons while the detail is pending', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getAllByTestId('playlist-player-dialog-skeleton')).toHaveLength(3);
  });

  it('shows an error line when the detail fails to load', () => {
    mockQuery({ isPending: false });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/Couldn.t load playlist\./)).toBeInTheDocument();
  });

  it('titles the dialog with the playlist title', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Road Mix')).toBeInTheDocument();
  });

  it('stacks the download row above the player', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    const row = screen.getByTestId('playlist-download-row');
    const player = screen.getByTestId('playlist-player');

    expect(row.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes the fetched items and title to the player', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('playlist-player')).toHaveAttribute('data-title', 'Road Mix');
    expect(screen.getByTestId('playlist-download-row')).toHaveAttribute('data-playlist-id', 'pl-1');
  });

  it('unmounts the player subtree when closed', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId('playlist-player')).not.toBeInTheDocument();
  });

  it('forwards dismissal through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-player-dialog.spec.tsx` — expect FAIL: `Failed to resolve import "./playlist-player-dialog"`.
- [ ] **Implement** `src/app/components/playlists/playlist-player-dialog.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistQuery } from '@/hooks/use-playlist-query';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistDownloadRow } from './playlist-download-row';
import { PlaylistPlayer } from './playlist-player';

interface PlaylistPlayerDialogProps {
  /** The playlist to play, or `null` while no play request is active. */
  playlistId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SKELETON_KEYS = ['player-skeleton-1', 'player-skeleton-2', 'player-skeleton-3'] as const;

/** Placeholder lines while the playlist detail loads. */
const PlaylistPlayerDialogSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-3 py-2">
    {SKELETON_KEYS.map((key) => (
      <Skeleton
        key={key}
        data-testid="playlist-player-dialog-skeleton"
        className="my-0 h-6 w-full"
      />
    ))}
  </div>
);

interface PlaylistPlayerDialogBodyProps {
  isPending: boolean;
  detail: PlaylistDetailResponse | undefined;
}

/** Dialog body: skeleton → error line → download row stacked above the player. */
const PlaylistPlayerDialogBody = ({
  isPending,
  detail,
}: PlaylistPlayerDialogBodyProps): ReactElement => {
  if (isPending) return <PlaylistPlayerDialogSkeleton />;

  if (!detail) {
    return <p className="text-sm text-zinc-500">Couldn&apos;t load playlist.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <PlaylistDownloadRow playlistId={detail.id} />
      <PlaylistPlayer items={detail.items} title={detail.title} />
    </div>
  );
};

/**
 * Shared playlist player dialog: fetches the detail only while open, shows
 * the free-download row above the player (queue included in the player), and
 * fully unmounts the media subtree on close so video.js always tears down.
 * No purchase options — playlists reference free-streamable media only.
 */
export const PlaylistPlayerDialog = ({
  playlistId,
  open,
  onOpenChange,
}: PlaylistPlayerDialogProps): ReactElement => {
  const { isPending, data } = usePlaylistQuery(playlistId, {
    enabled: open && playlistId !== null,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{data?.title ?? 'Playlist'}</DialogTitle>
          <DialogDescription className="sr-only">Play or download this playlist</DialogDescription>
        </DialogHeader>
        {open ? <PlaylistPlayerDialogBody isPending={isPending} detail={data} /> : null}
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-player-dialog.spec.tsx` — PASS (9 tests).
- [ ] Commit: `feat(playlists): ✨ playlist player dialog`

---

### Task 10: Wire the PR1 play stub to the dialog

**Files:**

- Modify: `src/app/components/playlists/playlists-content.tsx`
- Test: `src/app/components/playlists/playlists-content.spec.tsx` (replace the play-toast assertions with dialog-open assertions; keep the share-toast test)

**Interfaces:**

- Consumes: Task 9 `PlaylistPlayerDialog`; existing `PlaylistView.onPlay: (id: string) => void` and `PlaylistList.onPlay: (id: string) => void` already forward the playlist id — only the content-level handler changes. The share stub (`toast.info('Sharing arrives in the next update')`) stays UNTOUCHED — Cluster C wires it.
- Produces: no API change — `PlaylistsContent(): ReactElement` unchanged.

- [ ] **Failing spec** — in `playlists-content.spec.tsx`: add the dialog stub mock after the existing `./playlist-view` mock:

```tsx
interface PlayerDialogStubProps {
  playlistId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

vi.mock('./playlist-player-dialog', () => ({
  PlaylistPlayerDialog: ({ playlistId, open, onOpenChange }: PlayerDialogStubProps) => (
    <div
      data-testid="playlist-player-dialog"
      data-open={String(open)}
      data-playlist-id={playlistId ?? 'null'}
    >
      <button type="button" onClick={() => onOpenChange(false)}>
        stub-player-close
      </button>
    </div>
  ),
}));
```

then REPLACE the two play tests inside `describe('stubbed actions', …)` (the `'Playlist player arrives in the next update'` assertions) with a new `describe('player dialog wiring', …)` block — the share test stays in place:

```tsx
describe('player dialog wiring', () => {
  it('renders the player dialog closed initially', () => {
    render(<PlaylistsContent />);

    const dialog = screen.getByTestId('playlist-player-dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');
    expect(dialog).toHaveAttribute('data-playlist-id', 'null');
  });

  it('opens the player dialog from a list row play', async () => {
    const user = userEvent.setup();
    render(<PlaylistsContent />);

    await user.click(screen.getByRole('button', { name: 'stub-list-play' }));

    const dialog = screen.getByTestId('playlist-player-dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
    expect(dialog).toHaveAttribute('data-playlist-id', 'pl-1');
  });

  it('opens the player dialog from the view play button', async () => {
    const user = userEvent.setup();
    render(<PlaylistsContent />);

    await user.click(screen.getByRole('button', { name: 'stub-search-select' }));
    await user.click(screen.getByRole('button', { name: 'stub-view-play' }));

    const dialog = screen.getByTestId('playlist-player-dialog');
    expect(dialog).toHaveAttribute('data-open', 'true');
    expect(dialog).toHaveAttribute('data-playlist-id', 'pl-7');
  });

  it('clears the playlist id when the dialog dismisses', async () => {
    const user = userEvent.setup();
    render(<PlaylistsContent />);

    await user.click(screen.getByRole('button', { name: 'stub-list-play' }));
    await user.click(screen.getByRole('button', { name: 'stub-player-close' }));

    const dialog = screen.getByTestId('playlist-player-dialog');
    expect(dialog).toHaveAttribute('data-open', 'false');
    expect(dialog).toHaveAttribute('data-playlist-id', 'null');
  });

  it('never toasts the removed player stub copy', async () => {
    const user = userEvent.setup();
    render(<PlaylistsContent />);

    await user.click(screen.getByRole('button', { name: 'stub-list-play' }));

    expect(toastInfoMock).not.toHaveBeenCalled();
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlists-content.spec.tsx` — expect FAIL: `Unable to find an element by: [data-testid="playlist-player-dialog"]`.
- [ ] **Implement** in `playlists-content.tsx`:
  - Import: `import { PlaylistPlayerDialog } from './playlist-player-dialog';`
  - Add state next to `viewPlaylistId`: `const [playerPlaylistId, setPlayerPlaylistId] = useState<string | null>(null);`
  - Replace the stub handler:

```tsx
/** Shared by list rows and the view: open the playlist in the player dialog. */
const handlePlay = (id: string): void => setPlayerPlaylistId(id);

const handlePlayerOpenChange = (nextOpen: boolean): void => {
  if (!nextOpen) setPlayerPlaylistId(null);
};
```

- Render the dialog ONCE at content level, after the grid `</div>` inside the fragment:

```tsx
<PlaylistPlayerDialog
  playlistId={playerPlaylistId}
  open={playerPlaylistId !== null}
  onOpenChange={handlePlayerOpenChange}
/>
```

- Update the component JSDoc (currently "play/share are toast stubs until the player and sharing arrive in PR2") to: play opens the shared `PlaylistPlayerDialog`; share remains a toast stub until sharing lands later in PR2. `handleShare` and the `toast` import stay as-is.
- [ ] Run `pnpm run test:run src/app/components/playlists/playlists-content.spec.tsx` — PASS.
- [ ] Regression sweep + cluster gate: `pnpm run test:run src/app/components/playlists src/app/components/ui/video src/app/components/ui/audio` then the full gate `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`. (E2E for the play flow is owned by the PR2 E2E task — verified: no existing E2E asserts the removed play-toast copy.)
- [ ] Commit: `feat(playlists): ✨ wire play to player dialog`

---

## Self-review notes (already applied)

- **Keyed remount vs autoplay:** `media-player-controls.tsx` never autoplays an _initial_ source, and per-item keying makes every source initial — so the plan uses the release-player's `controlsRef.play()` trick driven by `shouldAutoPlay` instead of the `autoPlay` prop. Covered by the "auto-plays the freshly keyed track surface" spec.
- **Ticker "minimal-variant"** (spec L200–201) is implemented as an additive third `InfoTickerTapeProps` union member, not a fake `artistRelease` object — no existing call site changes.
- **`triggerDownload` over `window.location.assign`:** the spec (L203) and every existing download path use the anchor-click util; `location.assign` would drop SPA state and diverge from `format-bundle-download.tsx`.
- **Fallback art source:** `PlaylistPlayer` props are locked to `{ items, title }`, so the "player fallback" tiles derive from the deduped non-null item `coverArt`s (playlist mosaic), matching PR1's `availableArtistImages` derivation.
- Video surface goes through `LazyVideoSurface` (video.js ~283KB stays out of the dialog bundle until a video item is current); it forwards Task 6's `onEnded` unchanged.

### Task 11: `PlaylistSharePopover` + neutral `url` prop on `SocialShareWidget`

**Files:**

- Modify: `src/app/components/social-share-widget.tsx` + `social-share-widget.spec.tsx`
- Create: `src/app/components/playlists/playlist-share-popover.tsx` + `.spec.tsx`

**Interfaces (Consumes — verified from source):**

- `SocialShareWidget({ artistUrl, facebookMessengerAppId = '' }: SocialShareWidgetProps)` —
  `src/app/components/social-share-widget.tsx:20-32`; `artistUrl: string` is currently required and
  hard-named. Decision: extend ADDITIVELY with a neutral `url?: string` that takes precedence;
  `artistUrl` becomes optional with a defensive `''` fallback. Rationale: the prop name appears in
  20+ lines of `social-share-widget.spec.tsx` plus `release-share-widget.tsx` — the additive prop is
  strictly less churn than a rename and leaves every existing consumer untouched.
- `useUpdatePlaylistMutation()` → `{ updatePlaylist, isUpdatingPlaylist, … }`; `updatePlaylist(input, { onSuccess, onError })`
  rejects/errors with the action's message (`src/app/hooks/use-playlist-mutations.ts:95-119`).
  `UpdatePlaylistInput` accepts `{ playlistId, isPublic: true }` (schema `.refine` requires ≥1 mutable
  field — satisfied; `src/lib/validation/playlist-schema.ts:75-88`).
- Lazy-widget precedent: `release-share-widget.tsx:17-23` (`nextDynamic` + `ssr: false` + pulse-div loading).
- On success, `invalidateMineAndDetail` refetches `playlists.mine()` → the parent row's `isPublic`
  flips → this component re-renders with `isPublic=true` and the widget swaps in live (no local state).

**Interfaces (Produces — verbatim):**

```ts
// social-share-widget.tsx (additive)
interface SocialShareWidgetProps {
  /** Legacy share-URL prop (artist pages). Prefer `url` for new consumers. */
  artistUrl?: string;
  /** Neutral share-URL prop; takes precedence over `artistUrl`. */
  url?: string;
  facebookMessengerAppId?: string;
}

// playlist-share-popover.tsx
export const PlaylistSharePopover = ({
  playlistId,
  playlistTitle,
  isPublic,
  children,
}: {
  playlistId: string;
  playlistTitle: string;
  isPublic: boolean;
  children: ReactNode;
}): ReactElement
```

`children` is the trigger, rendered through `PopoverTrigger asChild` (callers pass a `Button`).
Private-hint copy (exact string, asserted in unit + E2E):
`Only you can see this playlist — make it public to share.`

- [ ] Failing specs first — additions to `social-share-widget.spec.tsx`:

```tsx
it('prefers the neutral url prop over artistUrl', () => {
  render(<SocialShareWidget url="https://example.com/playlists/pl-1" artistUrl={TEST_URL} />);

  expect(screen.getByLabelText('Share via SMS')).toHaveAttribute(
    'href',
    expect.stringContaining(encodeURIComponent('https://example.com/playlists/pl-1'))
  );
});

it('degrades to an empty share url when neither prop is passed', () => {
  render(<SocialShareWidget />);

  expect(screen.getByLabelText('Share via SMS')).toBeInTheDocument();
});
```

- [ ] New `playlist-share-popover.spec.tsx` (module-boundary mocks per PR1 sibling specs):

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { PlaylistSharePopover } from './playlist-share-popover';

const updatePlaylistMock = vi.hoisted(() => vi.fn());
const isUpdatingPlaylistMock = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/use-playlist-mutations', () => ({
  useUpdatePlaylistMutation: () => ({
    updatePlaylist: updatePlaylistMock,
    isUpdatingPlaylist: isUpdatingPlaylistMock.value,
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The widget is lazy-loaded through next/dynamic; mocking the module makes the
// dynamic import resolve to this stub, which surfaces the url prop for asserts.
vi.mock('@/components/social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => <div data-testid="share-widget">{url}</div>,
}));

const renderOpen = async (isPublic: boolean): Promise<void> => {
  const user = userEvent.setup();
  render(
    <PlaylistSharePopover playlistId="pl-1" playlistTitle="Road Trip" isPublic={isPublic}>
      <button type="button">Share playlist</button>
    </PlaylistSharePopover>
  );
  await user.click(screen.getByRole('button', { name: 'Share playlist' }));
};

describe('PlaylistSharePopover', () => {
  it('embeds the share widget with the /playlists/{id} url when public', async () => {
    await renderOpen(true);

    expect(await screen.findByTestId('share-widget')).toHaveTextContent(
      'http://localhost:3000/playlists/pl-1'
    );
  });

  it('shows the private hint and no widget when private', async () => {
    await renderOpen(false);

    expect(
      screen.getByText('Only you can see this playlist — make it public to share.')
    ).toBeVisible();
    expect(screen.queryByTestId('share-widget')).not.toBeInTheDocument();
  });

  it('fires the make-public mutation and toasts on success', async () => {
    const user = userEvent.setup();
    await renderOpen(false);

    await user.click(screen.getByRole('button', { name: 'Make public' }));

    expect(updatePlaylistMock).toHaveBeenCalledExactlyOnceWith(
      { playlistId: 'pl-1', isPublic: true },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
    const [, callbacks] = updatePlaylistMock.mock.calls[0];
    callbacks.onSuccess();
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('"Road Trip" is now public');
    callbacks.onError(new Error('nope'));
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('nope');
  });

  it('disables the make-public button while the mutation is in flight', async () => {
    isUpdatingPlaylistMock.value = true;
    await renderOpen(false);

    expect(screen.getByRole('button', { name: 'Making public…' })).toBeDisabled();
    isUpdatingPlaylistMock.value = false;
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-share-popover.spec.tsx src/app/components/social-share-widget.spec.tsx`
      — expected fail: `Cannot find module './playlist-share-popover'` + the two new widget specs
      failing on the missing `url` prop.
- [ ] Implement the widget change (everything else in `social-share-widget.tsx` stays as-is):

```tsx
interface SocialShareWidgetProps {
  /** Legacy share-URL prop (artist pages). Prefer `url` for new consumers. */
  artistUrl?: string;
  /** Neutral share-URL prop; takes precedence over `artistUrl`. */
  url?: string;
  facebookMessengerAppId?: string;
}

export const SocialShareWidget = ({
  artistUrl,
  url,
  facebookMessengerAppId = '',
}: SocialShareWidgetProps) => {
  const shareUrl = url ?? artistUrl ?? '';
  const shareTitle = 'Check this out on Fake Four Inc.!';
  const iconSize = 32;
  // …every internal `artistUrl` reference below becomes `shareUrl` (7 call sites).
```

- [ ] Implement `src/app/components/playlists/playlist-share-popover.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement, ReactNode } from 'react';

import nextDynamic from 'next/dynamic';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUpdatePlaylistMutation } from '@/hooks/use-playlist-mutations';

const SocialShareWidget = nextDynamic(
  () =>
    import('@/components/social-share-widget').then((mod) => ({
      default: mod.SocialShareWidget,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-8 min-h-8 w-36 animate-pulse" />,
  }
);

interface PlaylistSharePopoverProps {
  /** The playlist the share URL points at. */
  playlistId: string;
  /** Names the success toast when the playlist is made public. */
  playlistTitle: string;
  /** Public playlists show the share widget; private ones the make-public hint. */
  isPublic: boolean;
  /** The trigger element, rendered via `PopoverTrigger asChild` (must take a ref). */
  children: ReactNode;
}

/** Exact private-playlist hint copy (asserted verbatim in unit + E2E specs). */
const PRIVATE_HINT = 'Only you can see this playlist — make it public to share.';

/**
 * SSR-safe origin: rows render this component on the server where
 * `globalThis.location` is undefined; the popover content (the only consumer)
 * mounts client-side only, so the empty fallback never reaches the DOM.
 */
const clientOrigin = (): string => globalThis.location?.origin ?? '';

/**
 * Share popover for a playlist: public playlists embed the lazy
 * `SocialShareWidget` pointed at `{origin}/playlists/{id}`; private ones show
 * a hint plus an inline "Make public" button that runs the update mutation —
 * the resulting `playlists.mine()` invalidation flips `isPublic` upstream and
 * the widget swaps in live while the popover stays open.
 */
export const PlaylistSharePopover = ({
  playlistId,
  playlistTitle,
  isPublic,
  children,
}: PlaylistSharePopoverProps): ReactElement => {
  const { updatePlaylist, isUpdatingPlaylist } = useUpdatePlaylistMutation();
  const shareUrl = `${clientOrigin()}/playlists/${playlistId}`;

  const handleMakePublic = (): void =>
    updatePlaylist(
      { playlistId, isPublic: true },
      {
        onSuccess: () => toast.success(`"${playlistTitle}" is now public`),
        onError: (error: Error) => toast.error(error.message),
      }
    );

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent aria-label="Share playlist" className="flex w-80 flex-col gap-3">
        {isPublic ? (
          <div className="flex items-center justify-center gap-1 overflow-hidden">
            <SocialShareWidget url={shareUrl} />
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500">{PRIVATE_HINT}</p>
            <Button type="button" onClick={handleMakePublic} disabled={isUpdatingPlaylist}>
              {isUpdatingPlaylist ? 'Making public…' : 'Make public'}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
```

- [ ] `pnpm run test:run src/app/components/playlists/playlist-share-popover.spec.tsx src/app/components/social-share-widget.spec.tsx src/app/components/release-share-widget.spec.tsx`
      PASS (release-share-widget untouched — regression check only).
- [ ] Gate → commit `feat(playlists): ✨ share popover`

### Task 12: `/playlists/[id]` shared-link page

**Files:**

- Create: `src/app/playlists/[id]/page.tsx` + `page.spec.tsx`
- Create: `src/app/components/playlists/playlist-detail-content.tsx` + `.spec.tsx`

**Interfaces (Consumes — verified from source):**

- Auth/prefetch/HydrationBoundary pattern: `src/app/playlists/page.tsx` (`auth()` → `redirect('/signin')`,
  `getQueryClient`, `HydrationBoundary`, `PageContainer → ContentContainer → ZinePanel chat accent="kraft" breadcrumbs → ZineHeading`).
- Promised params idiom for pages: `src/app/tours/[tourId]/page.tsx` (`params: Promise<{ tourId: string }>`,
  `const { tourId } = await params`, `notFound()` on miss, cache seeded with `queryClient.setQueryData`).
  (Route handlers use `context.params` — pages receive `params` directly.)
- `isValidObjectId(id)` — `src/lib/utils/validation/object-id.ts:13`.
- `PlaylistService.getOwnedOrPublicDetail(playlistId, userId): Promise<PlaylistDetailResponse | null>`
  — `src/lib/services/playlist-service.ts:574` (null for missing AND private-unowned; payload includes
  `isOwner`, JSON-safe — the detail route hands it to `NextResponse.json` unchanged, so `setQueryData`
  hydrates byte-identical to what `usePlaylistQuery` would fetch).
- `usePlaylistQuery(playlistId, options?)` → `{ isPending, error, data, refetch }` —
  `src/app/hooks/use-playlist-query.ts:51`.
- Cluster-B leaves (given): `PlaylistPlayer({ items, title })` from `./playlist-player`,
  `PlaylistDownloadRow({ playlistId, disabled? })` from `./playlist-download-row` — download row
  renders ABOVE the player (spec L221-224); "Videos are skipped in downloads" copy lives inside it.
- Task 11's `PlaylistSharePopover`.
- No `Suspense` boundary needed: the island uses no `useSearchParams` (unlike `/playlists`).
- Error posture: follow the `tours/[tourId]` precedent — no try/catch around the service read; a
  thrown DB error surfaces the route error boundary, only `null` maps to `notFound()`.
- Static `metadata` (no `generateMetadata` — it would double-fetch the detail; the ZineHeading
  carries the live title in the server HTML).

**Interfaces (Produces — verbatim):**

```ts
// page.tsx
export interface PlaylistDetailPageProps {
  params: Promise<{ id: string }>;
}
export default async function PlaylistDetailPage({ params }: PlaylistDetailPageProps)

// playlist-detail-content.tsx
export const PlaylistDetailContent = ({ playlistId }: { playlistId: string }): ReactElement
```

- [ ] Failing specs first. `playlist-detail-content.spec.tsx` (mock `@/hooks/use-playlist-query`,
      `./playlist-player`, `./playlist-download-row`, `./playlist-share-popover` at module boundary):

```tsx
const usePlaylistQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-playlist-query', () => ({ usePlaylistQuery: usePlaylistQueryMock }));
vi.mock('./playlist-player', () => ({
  PlaylistPlayer: ({ items, title }: { items: Array<{ id: string }>; title: string }) => (
    <div data-testid="player" data-order={items.map(({ id }) => id).join(',')}>
      {title}
    </div>
  ),
}));
vi.mock('./playlist-download-row', () => ({
  PlaylistDownloadRow: ({ playlistId, disabled }: { playlistId: string; disabled?: boolean }) => (
    <div data-testid="download-row" data-disabled={String(disabled ?? false)}>
      {playlistId}
    </div>
  ),
}));
vi.mock('./playlist-share-popover', () => ({
  PlaylistSharePopover: ({ children, isPublic }: { children: ReactNode; isPublic: boolean }) => (
    <div data-testid="share-popover" data-public={String(isPublic)}>
      {children}
    </div>
  ),
}));
```

      Fixtures: reuse Task 9's `detail` shape via a local `makeDetail(overrides)` whose default
      `items` hold a track `item-b` (`sortOrder: 1`) BEFORE track `item-a` (`sortOrder: 0`) —
      input order deliberately unsorted — with `itemCount: 2`, `isPublic: true`, `isOwner: false`;
      `mockQuery({ isPending, data })` mirrors Task 9's helper. Tests:

```tsx
it('shows the loading status while pending', () => {
  mockQuery({ isPending: true });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading playlist…');
});

it('shows the error line when settled without data', () => {
  mockQuery({ isPending: false });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.getByText(/Couldn.t load playlist\./)).toBeInTheDocument();
});

it('renders the meta line, download row above the player, and sorted items', () => {
  mockQuery({ isPending: false, data: makeDetail({}) });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.getByText('2 items · Public')).toBeInTheDocument();
  const row = screen.getByTestId('download-row');
  const player = screen.getByTestId('player');
  expect(row.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(player).toHaveAttribute('data-order', 'item-a,item-b'); // sorted by sortOrder
  expect(screen.getByTestId('share-popover')).toHaveAttribute('data-public', 'true');
});

it('deep-links the owner back into My Playlists', () => {
  mockQuery({ isPending: false, data: makeDetail({ isOwner: true }) });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.getByRole('link', { name: 'Open in My Playlists' })).toHaveAttribute(
    'href',
    '/playlists?edit=pl-1'
  );
});

it('hides the owner deep link for non-owners', () => {
  mockQuery({ isPending: false, data: makeDetail({ isOwner: false }) });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.queryByRole('link', { name: 'Open in My Playlists' })).not.toBeInTheDocument();
});

it('disables the download row for an all-video playlist', () => {
  mockQuery({ isPending: false, data: makeDetail({ items: [videoItem] }) });
  render(<PlaylistDetailContent playlistId="pl-1" />);

  expect(screen.getByTestId('download-row')).toHaveAttribute('data-disabled', 'true');
});
```

- [ ] `page.spec.tsx` merges the `src/app/playlists/page.spec.tsx` scaffolding (redirect sentinel,
      auth mock, passthrough `HydrationBoundary`, shell-container + breadcrumb mocks — copy those
      blocks verbatim) with the `src/app/tours/[tourId]/page.spec.tsx` notFound sentinel +
      `setQueryData` idioms; `isValidObjectId` stays REAL (pure util). The load-bearing parts:

```tsx
// next/navigation — BOTH sentinels must throw to halt execution like the real ones.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}));

const mockSetQueryData = vi.fn();
vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

const mockGetOwnedOrPublicDetail = vi.fn();
vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    getOwnedOrPublicDetail: (...args: unknown[]) => mockGetOwnedOrPublicDetail(...args),
  },
}));

vi.mock('@/app/components/playlists/playlist-detail-content', () => ({
  PlaylistDetailContent: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="playlist-detail-content" data-playlist-id={playlistId} />
  ),
}));

const VALID_ID = '507f1f77bcf86cd799439011';
const DETAIL = {
  id: VALID_ID,
  title: 'Road Mix',
  isPublic: true,
  isOwner: false,
  coverImages: [],
  itemCount: 1,
  totalDuration: 200,
  items: [],
};
const makeProps = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PlaylistDetailPage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockGetOwnedOrPublicDetail.mockResolvedValue(DETAIL);
  });

  it('redirects to signin when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(PlaylistDetailPage(makeProps(VALID_ID))).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('404s a malformed id before touching the service', async () => {
    await expect(PlaylistDetailPage(makeProps('not-an-objectid'))).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mockGetOwnedOrPublicDetail).not.toHaveBeenCalled();
  });

  it('404s when the service resolves null (missing or private-unowned)', async () => {
    mockGetOwnedOrPublicDetail.mockResolvedValue(null);

    await expect(PlaylistDetailPage(makeProps(VALID_ID))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('renders the heading and breadcrumbs and seeds the detail cache', async () => {
    const Page = await PlaylistDetailPage(makeProps(VALID_ID));
    render(Page);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Road Mix');
    const nav = screen.getByTestId('breadcrumb-menu');
    expect(JSON.parse(nav.getAttribute('data-items') ?? '[]')).toContainEqual({
      anchorText: 'My Playlists',
      url: '/playlists',
      isActive: false,
    });
    expect(mockSetQueryData).toHaveBeenCalledExactlyOnceWith(
      ['playlists', 'detail', VALID_ID],
      DETAIL
    );
  });
});
```

- [ ] Run `pnpm run test:run src/app/components/playlists/playlist-detail-content.spec.tsx src/app/playlists`
      — expected fail: missing modules.
- [ ] Implement `src/app/playlists/[id]/page.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared playlist page at `/playlists/[id]` (sign-in required; the owner or —
 * for public playlists — any signed-in user; everything else is a uniform 404).
 * Server Component: resolves the detail through the service, seeds the
 * `playlists.detail(id)` cache, and hydrates the client island (download row,
 * inline player, share popover, owner deep link back into the creator).
 */
import { notFound, redirect } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { PlaylistDetailContent } from '@/app/components/playlists/playlist-detail-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { auth } from '@/auth';
import { queryKeys } from '@/lib/query-keys';
import { PlaylistService } from '@/lib/services/playlist-service';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playlist',
  description: 'Listen to a playlist from the Fake Four catalog.',
};

export interface PlaylistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaylistDetailPage({ params }: PlaylistDetailPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const { id } = await params;

  if (!isValidObjectId(id)) {
    notFound();
  }

  // Owner-or-public read; null covers missing AND private-unowned uniformly.
  const detail = await PlaylistService.getOwnedOrPublicDetail(id, session.user.id);

  if (!detail) {
    notFound();
  }

  const queryClient = getQueryClient();
  // The service already returns the wire shape of GET /api/playlists/[id], so
  // seeding the detail cache directly keeps hydration byte-identical without a
  // self-fetch (same reasoning as the /playlists list prefetch).
  queryClient.setQueryData(queryKeys.playlists.detail(id), detail);

  const breadcrumbItems = [
    { anchorText: 'Home', url: '/', isActive: false },
    { anchorText: 'My Playlists', url: '/playlists', isActive: false },
    { anchorText: detail.title, url: `/playlists/${id}`, isActive: true },
  ];

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel chat accent="kraft" breadcrumbs={breadcrumbItems}>
            <ZineHeading level={1}>{detail.title}</ZineHeading>
            <PlaylistDetailContent playlistId={id} />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
```

- [ ] Implement `src/app/components/playlists/playlist-detail-content.tsx`:

```tsx
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import Link from 'next/link';

import { Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistQuery } from '@/hooks/use-playlist-query';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistDownloadRow } from './playlist-download-row';
import { PlaylistPlayer } from './playlist-player';
import { PlaylistSharePopover } from './playlist-share-popover';

interface PlaylistDetailContentProps {
  /** The playlist the page routes to (cache seeded server-side). */
  playlistId: string;
}

/** `"{itemCount} item(s)" · {Public|Private}` meta line under the heading. */
const metaLine = ({ itemCount, isPublic }: PlaylistDetailResponse): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${isPublic ? 'Public' : 'Private'}`;

/** Placeholder blocks while the (already-seeded) detail hydrates. */
const PlaylistDetailSkeleton = (): ReactElement => (
  <div aria-busy="true" className="flex flex-col gap-4 py-4">
    <p role="status" className="sr-only">
      Loading playlist…
    </p>
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-64 w-full" />
  </div>
);

/**
 * Client island for `/playlists/[id]`: meta line + share popover (+ the
 * owner's "Open in My Playlists" deep link), the download row ABOVE the
 * inline player (spec order), items sorted by `sortOrder`. The page seeds the
 * detail cache, so the skeleton only shows on client-side cache misses.
 */
export const PlaylistDetailContent = ({ playlistId }: PlaylistDetailContentProps): ReactElement => {
  const { isPending, data } = usePlaylistQuery(playlistId);

  if (isPending) return <PlaylistDetailSkeleton />;

  if (!data) {
    return <p className="text-sm text-zinc-500">Couldn&apos;t load playlist.</p>;
  }

  const sortedItems = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const hasDownloadableTracks = sortedItems.some((item) => item.itemType === 'track');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-zinc-500">{metaLine(data)}</p>
        <span aria-hidden="true" className="flex-1" />
        <PlaylistSharePopover
          playlistId={data.id}
          playlistTitle={data.title}
          isPublic={data.isPublic}
        >
          <Button type="button" variant="outline" aria-label="Share playlist">
            <Share2 aria-hidden="true" />
            Share
          </Button>
        </PlaylistSharePopover>
        {data.isOwner && (
          <Button asChild variant="outline">
            <Link href={`/playlists?edit=${data.id}`}>Open in My Playlists</Link>
          </Button>
        )}
      </div>
      <PlaylistDownloadRow playlistId={data.id} disabled={!hasDownloadableTracks} />
      <PlaylistPlayer items={sortedItems} title={data.title} />
    </div>
  );
};
```

- [ ] `pnpm run test:run src/app/components/playlists/playlist-detail-content.spec.tsx src/app/playlists` PASS.
- [ ] Gate → commit `feat(playlists): ✨ shared playlist page`

### Task 13: Wire the share popover into the row actions

**Files:**

- Modify: `src/app/components/playlists/playlist-row-actions.tsx` + `.spec.tsx`
- Modify: `src/app/components/playlists/playlist-row.tsx` + `.spec.tsx`
- Modify: `src/app/components/playlists/playlist-list.tsx` + `.spec.tsx`
- Modify: `src/app/components/playlists/playlists-content.tsx` + `.spec.tsx`

**Interfaces (Consumes — verified from source):**

- `PlaylistRowActions` already receives the FULL `row: PlaylistListRow` (`playlist-row-actions.tsx:25-36`) —
  it has `id`/`title`/`isPublic`, i.e. everything `PlaylistSharePopover` needs. **Wiring decision:**
  `PlaylistRowActions` composes `PlaylistSharePopover` directly around its Share `Button` and the
  `onShare` callback is DELETED from the whole chain (row-actions → row → list → content). This beats
  a `shareWrapper` render-prop: zero new props, one fewer threaded callback through four files, and
  the component stays hook-free (the mutation lives inside the popover). The delete `AlertDialog`
  already sets the precedent for row-actions composing its own overlay.
- `playlist-view.tsx` share parity: verified NONE — the view renders Play + Edit only
  (`playlist-view.tsx:116-130`, matching spec "view Play + Edit only"). No change there; skip.
- Cluster-B ordering: Task 10 already rewired `onPlay` in `playlists-content.tsx` to
  `PlaylistPlayerDialog`; this task touches only the share pieces of that file.

**Interfaces (Produces — verbatim):**

```ts
// playlist-row-actions.tsx — onShare removed
export const PlaylistRowActions = ({ row, onEdit, onPlay, onDelete }: {
  row: PlaylistListRow; onEdit: () => void; onPlay: () => void; onDelete: () => void;
}): ReactElement

// playlist-row.tsx — onShare removed
export const PlaylistRow = ({ row, onEdit, onPlay, onDelete }: { … }): ReactElement

// playlist-list.tsx — onShare removed
export const PlaylistList = ({ onEdit, onPlay, className }: {
  onEdit: (id: string) => void; onPlay: (id: string) => void; className?: string;
}): ReactElement
```

- [ ] Failing specs first:
  - `playlist-row-actions.spec.tsx`: add the module mock (before the imports-under-test)

```tsx
vi.mock('./playlist-share-popover', () => ({
  PlaylistSharePopover: ({
    children,
    playlistId,
    isPublic,
  }: {
    children: ReactNode;
    playlistId: string;
    isPublic: boolean;
  }) => (
    <div data-testid="share-popover" data-playlist-id={playlistId} data-public={String(isPublic)}>
      {children}
    </div>
  ),
}));
```

    delete the existing `onShare` callback test and add (uses the file's existing row fixture —
    `row.id = 'pl-1'`, `isPublic: false` — and `within` from `@testing-library/react`):

```tsx
it('wraps the Share button in the share popover with the row context', () => {
  renderActions();

  const popover = screen.getByTestId('share-popover');
  expect(popover).toHaveAttribute('data-playlist-id', 'pl-1');
  expect(popover).toHaveAttribute('data-public', 'false');
  expect(within(popover).getByRole('button', { name: 'Share playlist' })).toBeInTheDocument();
});
```

- `playlist-row.spec.tsx` / `playlist-list.spec.tsx`: drop `onShare` from the props fixtures and
  the `RowStubProps` row-stub (the `stub-share-*` buttons go away); delete `playlist-list`'s
  `it('calls onShare with the clicked row id')` block outright. Assertions on the remaining
  callbacks stay byte-identical — e.g. `expect(props.onPlay).toHaveBeenCalledWith('pl-2')` — and
  the compiler enforces the prop removal everywhere else.
- `playlists-content.spec.tsx`: delete the `'toasts the sharing stub copy from a list row share'`
  test and the `stub-list-share` button from the `PlaylistList` mock (the play-stub assertions are
  already gone — Task 10 owns those). Keep `expect(toastInfoMock).not.toHaveBeenCalled()` coverage
  via Task 10's `'never toasts the removed player stub copy'` test — no new content-level share
  test is needed (the popover is fully owned by the row actions now).
- [ ] `pnpm run test:run src/app/components/playlists` — expected fail: `onShare` prop mismatches +
      missing popover composition.
- [ ] Implement — `playlist-row-actions.tsx` share cluster becomes:

```tsx
import { PlaylistSharePopover } from './playlist-share-popover';
// …
<PlaylistSharePopover playlistId={row.id} playlistTitle={row.title} isPublic={row.isPublic}>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="size-8 shrink-0"
    aria-label="Share playlist"
  >
    <Share2 aria-hidden="true" />
  </Button>
</PlaylistSharePopover>;
```

      Remove `onShare` from `PlaylistRowActionsProps`, `PlaylistRowProps`, `PlaylistListProps`;
      in `playlists-content.tsx` delete `handleShare` and the `onShare={handleShare}` pass. Rewrite
      the now-stale jsdoc on `PlaylistRowActions` ("PR2 swaps in the share popover…" — it happened)
      and the `PlaylistsContent` jsdoc line about share being a toast stub (comment-accuracy rule).

- [ ] `pnpm run test:run src/app/components/playlists` PASS.
- [ ] Gate → commit `feat(playlists): ✨ wire row share popover`

### Task 14: My Playlists list load-more (consume `nextSkip`)

**Files:**

- Modify: `src/app/hooks/use-playlists-query.ts` + `use-playlists-query.spec.ts`
- Modify: `src/app/playlists/page.tsx` + `page.spec.tsx`
- Modify: `src/app/components/playlists/playlist-list.tsx` + `.spec.tsx`
- Modify: `src/app/components/playlists/my-playlist-search.tsx` + `.spec.tsx`
- Modify: `src/app/components/playlists/playlist-picker-combobox.tsx` + `.spec.tsx`

**Interfaces (Consumes — verified from source):**

- `usePlaylistsQuery` today hardcodes `skip=0&take=PLAYLISTS_PAGE_SIZE` and returns
  `{ isPending, error, data, refetch }` with `data: PlaylistsResponse = { rows, nextSkip }`
  (`use-playlists-query.ts:27-58`; `PlaylistsResponse` at `src/lib/types/domain/playlist.ts:107-110`).
  **Design decision:** convert to `useInfiniteQuery` — the repo idiom for exactly this cursor shape
  (`use-infinite-featured-artists-query.ts:85-93`: `initialPageParam: 0`,
  `getNextPageParam: (lastPage) => lastPage.nextSkip`). A `skip`-param `useQuery` + `keepPreviousData`
  cannot APPEND pages without a hand-rolled accumulator, which the guidelines forbid in spirit
  (lean on TanStack). Key stays `queryKeys.playlists.mine()`.
- Hydration parity: the infinite cache stores `InfiniteData` (`{ pages, pageParams }`), so
  `src/app/playlists/page.tsx:75-78` MUST switch `prefetchQuery` → `prefetchInfiniteQuery` in the
  same commit — mirror `src/app/videos/page.tsx:52-71` (first page only, service-direct, degrade to
  empty page on failure). `buildMinePlaylistsQueryFn` body is unchanged (`skip: 0` — prefetch only
  ever fetches page 1).
- Consumers of the old `data.rows` shape (all three verified): `playlist-list.tsx:64`,
  `my-playlist-search.tsx:41-42`, `playlist-picker-combobox.tsx:46-49`. All flatten across loaded
  pages with the new `rows` field — search and picker therefore automatically match across every
  loaded page, satisfying "MyPlaylistSearch + PlaylistPickerCombobox consume rows across loaded pages".
- `InfiniteQueryOptionsOverride` — `src/app/hooks/query-options.ts:40`.

**Interfaces (Produces — verbatim):**

```ts
export interface UsePlaylistsQueryResult {
  isPending: boolean;
  error: Error;
  /** All rows across loaded pages; undefined until the first page settles successfully. */
  rows: PlaylistListRow[] | undefined;
  /** Cursor of the next page; null when the last loaded page is final. */
  nextSkip: number | null;
  /** Fetches the next page (no-op while a page fetch is already in flight). */
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

export const usePlaylistsQuery = (
  options: InfiniteQueryOptionsOverride<PlaylistsResponse> = {}
): UsePlaylistsQueryResult
```

- [ ] Failing specs first:
  - `use-playlists-query.spec.ts` — full rework to infinite semantics (module-boundary
    `useInfiniteQuery` mock, the `use-infinite-published-videos-query.spec.tsx` idiom; replaces the
    file's current `useQuery` mock, `playlistsResponse` fixture, and all five tests):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import type { PlaylistListRow, PlaylistsResponse } from '@/lib/types/domain/playlist';

import { ResponseValidationError } from './fetch-and-parse';
import { usePlaylistsQuery } from './use-playlists-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

const makeRow = (id: string, title: string): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages: [],
  itemCount: 2,
  totalDuration: 371,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const pageOne: PlaylistsResponse = { rows: [makeRow('p1', 'Late Night Mix')], nextSkip: 24 };
const pageTwo: PlaylistsResponse = { rows: [makeRow('p2', 'Morning Mix')], nextSkip: null };

interface CapturedOptions {
  queryKey: unknown[];
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<PlaylistsResponse>;
  initialPageParam: number;
  getNextPageParam: (lastPage: PlaylistsResponse) => number | null;
  enabled?: boolean;
}

const fetchNextPageMock = vi.fn();

/** Seed the mocked useInfiniteQuery return; data uses the InfiniteData
 * `{ pages, pageParams }` shape — the same shape `prefetchInfiniteQuery`
 * dehydrates, which is what keeps SSR hydration parity honest. */
const mockReturn = (overrides: Record<string, unknown> = {}): void => {
  useInfiniteQueryMock.mockReturnValue({
    isPending: false,
    error: undefined,
    data: { pages: [pageOne, pageTwo], pageParams: [0, 24] },
    refetch: vi.fn(),
    fetchNextPage: fetchNextPageMock,
    isFetchingNextPage: false,
    ...overrides,
  });
};

const lastOptions = (): CapturedOptions =>
  useInfiniteQueryMock.mock.calls.at(-1)?.[0] as CapturedOptions;

describe('usePlaylistsQuery', () => {
  beforeEach(() => {
    mockReturn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the my-playlists key with locked pagination options', () => {
    renderHook(() => usePlaylistsQuery());

    const opts = lastOptions();
    expect(opts.queryKey).toEqual(['playlists', 'mine']);
    expect(opts.initialPageParam).toBe(0);
    expect(opts.getNextPageParam(pageOne)).toBe(24);
    expect(opts.getNextPageParam(pageTwo)).toBeNull();
  });

  it('fetches the requested cursor page with the forwarded signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => pageTwo });
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePlaylistsQuery());
    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ pageParam: 24, signal })).resolves.toEqual(pageTwo);

    expect(fetchMock).toHaveBeenCalledWith('/api/playlists?skip=24&take=24', { signal });
  });

  it('surfaces a ResponseValidationError for a malformed page body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: 'oops' }) })
    );
    renderHook(() => usePlaylistsQuery());

    await expect(lastOptions().queryFn({ pageParam: 0 })).rejects.toBeInstanceOf(
      ResponseValidationError
    );
  });

  it('flattens loaded pages into rows and mirrors the LAST page nextSkip', () => {
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows?.map(({ id }) => id)).toEqual(['p1', 'p2']);
    expect(result.current.nextSkip).toBeNull();
  });

  it('reports the intermediate cursor while more pages remain', () => {
    mockReturn({ data: { pages: [pageOne], pageParams: [0] } });
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows?.map(({ id }) => id)).toEqual(['p1']);
    expect(result.current.nextSkip).toBe(24);
  });

  it('leaves rows undefined until the first page settles', () => {
    mockReturn({ isPending: true, data: undefined });
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows).toBeUndefined();
    expect(result.current.nextSkip).toBeNull();
  });

  it('loadMore fetches the next page', () => {
    const { result } = renderHook(() => usePlaylistsQuery());

    result.current.loadMore();

    expect(fetchNextPageMock).toHaveBeenCalledTimes(1);
  });

  it('loadMore is a no-op while a page fetch is already in flight', () => {
    mockReturn({ isFetchingNextPage: true });
    const { result } = renderHook(() => usePlaylistsQuery());

    result.current.loadMore();

    expect(fetchNextPageMock).not.toHaveBeenCalled();
    expect(result.current.isLoadingMore).toBe(true);
  });

  it('passes caller overrides through to useInfiniteQuery', () => {
    renderHook(() => usePlaylistsQuery({ enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
```

- `playlist-list.spec.tsx` — mock returns the new surface
  (`{ isPending, rows, nextSkip, loadMore, isLoadingMore }`); new tests:

```tsx
it('shows Load more when nextSkip is set and forwards the click', async () => {
  const user = userEvent.setup();
  mockQueryState({ rows: [ROAD_TRIP], nextSkip: 24 });
  render(<PlaylistList onEdit={vi.fn()} onPlay={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Load more' }));

  expect(loadMoreMock).toHaveBeenCalledTimes(1);
});

it('hides Load more on the final page', () => {
  mockQueryState({ rows: [ROAD_TRIP], nextSkip: null });
  render(<PlaylistList onEdit={vi.fn()} onPlay={vi.fn()} />);

  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});

it('disables Load more while the next page is in flight', () => {
  mockQueryState({ rows: [ROAD_TRIP], nextSkip: 24, isLoadingMore: true });
  render(<PlaylistList onEdit={vi.fn()} onPlay={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
});
```

- `my-playlist-search.spec.tsx` / `playlist-picker-combobox.spec.tsx` — hook mock returns
  `{ isPending, rows }` instead of `{ data: { rows } }`; add one test each proving rows from a
  SECOND loaded page are listed/matchable (mock `rows` seeded from two pages flattened).
- `src/app/playlists/page.spec.tsx` — rename `mockPrefetchQuery` → `mockPrefetchInfiniteQuery`
  and expose it as `prefetchInfiniteQuery` on the `getQueryClient` mock (the
  `videos/page.spec.tsx` idiom — same queryFn-executing implementation); retarget the key test:

```tsx
expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
  expect.objectContaining({
    queryKey: ['playlists', 'mine'],
    initialPageParam: 0,
  })
);
```

- [ ] `pnpm run test:run src/app/hooks/use-playlists-query.spec.ts src/app/components/playlists src/app/playlists`
      — expected fail across all five surfaces.
- [ ] Implement the hook (full replacement of the query body):

```ts
import { useInfiniteQuery } from '@tanstack/react-query';
// … imports otherwise unchanged; QueryOptionsOverride → InfiniteQueryOptionsOverride

const fetchPlaylists = async (skip: number, signal?: AbortSignal): Promise<PlaylistsResponse> =>
  fetchAndParse(
    `/api/playlists?skip=${skip}&take=${PLAYLISTS_PAGE_SIZE}`,
    playlistsResponseSchema,
    { signal, errorMessage: 'Failed to fetch playlists' }
  );

export const usePlaylistsQuery = (
  options: InfiniteQueryOptionsOverride<PlaylistsResponse> = {}
): UsePlaylistsQueryResult => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.playlists.mine(),
    queryFn: ({ pageParam, signal }) => fetchPlaylists(pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    ...options,
  });

  const loadMore = (): void => {
    if (!isFetchingNextPage) void fetchNextPage();
  };

  return {
    isPending,
    error,
    rows: data?.pages.flatMap((page) => page.rows),
    nextSkip: data?.pages.at(-1)?.nextSkip ?? null,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    refetch: () => void refetch(),
  };
};
```

- [ ] Implement the page prefetch swap (`src/app/playlists/page.tsx` — `buildMinePlaylistsQueryFn`
      body unchanged):

```ts
// The query key and initialPageParam must exactly match usePlaylistsQuery or
// hydration misses and the client refetches (videos/page.tsx precedent).
await queryClient.prefetchInfiniteQuery({
  queryKey: queryKeys.playlists.mine(),
  initialPageParam: 0,
  queryFn: buildMinePlaylistsQueryFn(session.user.id),
});
```

- [ ] Implement `playlist-list.tsx`: destructure the new surface; the rows branch becomes a wrapper
      div so the button scrolls with the pane:

```tsx
return (
  <div className={cn(className)}>
    <ul>
      {rows.map((row) => (
        <PlaylistRow
          key={row.id}
          row={row}
          onEdit={() => onEdit(row.id)}
          onPlay={() => onPlay(row.id)}
          onDelete={() => handleDelete(row.id)}
        />
      ))}
    </ul>
    {nextSkip !== null && (
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={loadMore}
        disabled={isLoadingMore}
      >
        {isLoadingMore ? 'Loading…' : 'Load more'}
      </Button>
    )}
  </div>
);
```

      `my-playlist-search.tsx`: `const { rows } = usePlaylistsQuery();` + `const listRows = rows ?? [];`
      `playlist-picker-combobox.tsx`: `const { isPending, rows } = usePlaylistsQuery();` +
      `const visibleRows = (rows ?? []).filter(…)`. Error branch in the list keys off
      `rows === undefined` (was `!data`).

- [ ] `pnpm run test:run src/app/hooks/use-playlists-query.spec.ts src/app/components/playlists src/app/playlists` PASS.
- [ ] Gate → commit `feat(playlists): ✨ list load more`

### Task 15: PR1 hardening batch (5 ledger Minors)

**Files:**

- Modify: `src/app/components/playlists/use-add-to-other-playlist.ts`
- Create: `src/app/components/playlists/use-add-to-other-playlist.spec.ts` (the hook has no adjacent
  spec today — behavior is only covered through parents; the new fixes get direct `renderHook` tests)
- Modify: `src/app/components/playlists/playlist-list.tsx` + `.spec.tsx`
- Modify: `src/lib/actions/playlist-actions.ts` + `playlist-actions.spec.ts`
- Modify: `e2e/tests/playlists/playlist-public-search.spec.ts`

**Interfaces (Consumes — verified from source):**

- `useAddPlaylistItemMutation()` already exposes `isAddingPlaylistItem` (`use-playlist-mutations.ts:159-186`) —
  currently unused by `use-add-to-other-playlist.ts:59`.
- `useDeletePlaylistMutation()` already exposes `isDeletingPlaylist` (`use-playlist-mutations.ts:127-149`) —
  `playlist-list.tsx:65` destructures only `deletePlaylist`, so a second confirm click while a delete
  is in flight double-fires the action.
- Skeleton a11y precedent: `videos-content.tsx:24-27` (`aria-busy="true"` wrapper + sr-only
  `<p role="status">Loading …</p>`).
- `buildCoverObjectKey` (`playlist-actions.ts:58-68`): `fileName.split('.').pop()?.toLowerCase() || 'jpg'`
  drops the extension into the S3 key UNSANITIZED (e.g. `x.jpg?y` or a 200-char "extension" survives).
- `playlist-public-search.spec.ts:33` already pins "no Songs group"; the ledger Minor adds the
  matching "no Videos group" assertion (the snapshot token must not leak into ANY live-source group).

**Interfaces (Produces):** no signature changes — behavior-only hardening.

**Commit strategy:** ONE batch commit. All five are independent, reviewed Minors from the same PR1
ledger; each lands with its failing test in the same commit, so bisecting stays trivial while the
history avoids five one-line commits.

- [ ] Failing tests first — `use-add-to-other-playlist.spec.ts` (renderHook; mock
      `@/hooks/use-playlist-mutations` + `sonner`):

```ts
it('ignores pickPlaylist while an add is in flight', () => {
  isAddingPlaylistItemMock.value = true;
  const { result } = renderHook(() => useAddToOtherPlaylist());
  act(() => result.current.togglePicker(ITEM_A));

  act(() => result.current.pickPlaylist(PLAYLIST_ROW));

  expect(addPlaylistItemAsyncMock).not.toHaveBeenCalled();
  isAddingPlaylistItemMock.value = false;
});

it('keeps a newly opened picker open when a stale add for another row succeeds', async () => {
  let resolveAdd: (r: { success: true; data: unknown }) => void = () => undefined;
  addPlaylistItemAsyncMock.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));
  const { result } = renderHook(() => useAddToOtherPlaylist());
  act(() => result.current.togglePicker(ITEM_A));
  act(() => result.current.pickPlaylist(PLAYLIST_ROW)); // add for row A in flight
  act(() => result.current.togglePicker(ITEM_B)); // user opens row B meanwhile

  await act(async () => resolveAdd({ success: true, data: {} }));

  expect(result.current.openPickerKey).toBe(ITEM_B.key); // NOT nulled by row A's success
});
```

      `playlist-list.spec.tsx`: mock `useDeletePlaylistMutation` returning
      `{ deletePlaylist: deletePlaylistMock, isDeletingPlaylist: true }` → clicking the row-stub
      delete does NOT call the mutation; skeleton test asserts `role="status"` with
      "Loading playlists…" and the wrapper has `aria-busy="true"`.
      `playlist-actions.spec.ts` (cover-upload describe): a `fileName` of `'shot.J%2FPG..exe.....'`
      (and one with a 20-char tail) yields keys ending `.bin`; `'photo.WebP'` yields `.webp`.
      `playlist-public-search.spec.ts` one-liner appended after the Songs assertion:

```ts
await expect(userPage.getByRole('group', { name: 'Videos', exact: true })).toHaveCount(0);
```

- [ ] `pnpm run test:run src/app/components/playlists src/lib/actions/playlist-actions.spec.ts` —
      expected fail on the four unit surfaces (the E2E line is validated in Task 16's run).
- [ ] Implement:

```ts
// use-add-to-other-playlist.ts
const { addPlaylistItemAsync, isAddingPlaylistItem } = useAddPlaylistItemMutation();

// in runAdd's success branch — close only the picker this add was started from:
setActiveItem((current) => (current?.key === item.key ? null : current));

const pickPlaylist = (playlist: PlaylistListRow): void => {
  if (!activeItem || isAddingPlaylistItem) return;
  void runAdd({ item: activeItem, playlist }, false);
};

const confirmDuplicate = (): void => {
  if (!duplicateTarget || isAddingPlaylistItem) return;
  setDuplicateTarget(null);
  void runAdd(duplicateTarget, true);
};
```

```ts
// playlist-list.tsx
const { deletePlaylist, isDeletingPlaylist } = useDeletePlaylistMutation();

const handleDelete = (playlistId: string): void => {
  if (isDeletingPlaylist) return; // a confirmed delete is already in flight
  deletePlaylist(
    { playlistId },
    {
      onSuccess: () => toast.success('Playlist deleted'),
      onError: (error: Error) => toast.error(error.message),
    }
  );
};
```

```tsx
// playlist-list.tsx skeleton (videos-content precedent)
const PlaylistListSkeleton = ({ className }: { className?: string }): ReactElement => (
  <div className={cn(className)} aria-busy="true">
    <p role="status" className="sr-only">
      Loading playlists…
    </p>
    {SKELETON_KEYS.map((key) => (
      // …rows unchanged
```

```ts
// playlist-actions.ts — buildCoverObjectKey
const rawExtension = fileName.split('.').pop()?.toLowerCase() ?? '';
const extension = /^[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : 'bin';
```

      Update the hook's jsdoc ("leaves the picker open" wording gains the in-flight/keyed-close
      semantics) — comment-accuracy rule.

- [ ] `pnpm run test:run src/app/components/playlists src/lib/actions/playlist-actions.spec.ts` PASS.
- [ ] Gate → commit `fix(playlists): 🐛 pr1 review hardening`

### Task 16: E2E — player, download preflight, share, shared page

**Files:**

- Modify: `e2e/pages/playlists-page.ts` (page-object EXTENSION — no duplication)
- Create: `e2e/tests/playlists/playlist-player-share.spec.ts`
- `e2e/helpers/seed-test-db.ts`: **NO CHANGE NEEDED** — verified: `seedVideos` already bulk-seeds
  7 PUBLISHED videos via a single `createMany` (`'E2E Video Alpha'` … with
  `s3Key: media/videos/e2e/*.mp4`, `posterUrl: null` — the playlist video item falls back to the
  cover-tile placeholder, which the structural assertions tolerate), and the MP3 fixtures
  (`E2E Track Alpha`/`Beta`, 210 s each) plus the admin-owned public playlist already exist. The
  specs below create their own playlists through the UI with parallel-safe unique titles instead of
  seeding more (the fixture user's first list page holds ≤ ~8 rows per run — comfortably under the
  24-row page the id-lookup reads).

**Interfaces (Consumes — verified from source):**

- Fixtures: `e2e/fixtures/base.fixture.ts` re-exports `userPage` (regular-user session) and plain
  `page` (signed-out); title convention `` `${name} ${testInfo.retry}-${Date.now()}` `` per
  `playlist-create.spec.ts:29` (titles unique per owner forever — `@@unique([ownerId, title])`).
- Page object: `PlaylistsPage` (`e2e/pages/playlists-page.ts`) — `goto`, `search`,
  `searchOption(group, text)`, `saveDialog`, `submitSaveDialog`, `rowByTitle`,
  `createPlaylistWithFirstTrack`. Save-dialog public toggle:
  `getByRole('switch', { name: 'Public playlist' })` (`playlist-create.spec.ts:47`).
- Search groups: service labels `'Songs' | 'Videos' | 'From public playlists' | 'From releases'`
  (`playlist-service.ts:459-462`).
- Share popover internals (Task 11): Radix `PopoverContent` renders `role="dialog"` with
  `aria-label="Share playlist"`; react-share buttons carry `aria-label="Share on Facebook"` etc.; the
  SMS anchor (`aria-label="Share via SMS"`) hrefs
  `sms:?&body=<encoded '…{origin}/playlists/{id}'>` → contains `playlists%2F{id}`.
- Download-stream guard precedent: `e2e/tests/free-digital-downloads.spec.ts:95-142` — never assert
  a full zip stream, and never `waitForResponse` the anchor's stream request: fixture-less S3
  aborts the body mid-stream in CI, so higher-level clients hang or throw on it. That spec's
  `node:http` not-a-clean-500 probe is ANONYMOUS-only; this route is `withAuth`-gated (a
  cookie-less probe would 401 and pass vacuously), so the probe does not transfer — the spec
  asserts the preflight instead (`page.request` `ok()` + `waitForResponse` on `respond=preflight`)
  plus a signed-out 401 authorization check, and drops the stream assertion entirely.
- Codec-agnostic media lesson: assert either terminal state with `expect(a.or(b)).toBeVisible()` —
  never the error path (or happy path) alone.
- **DB isolation is MANDATORY:** run only via the harness against
  `mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0` (hardcoded default in
  `playwright.config.ts` / `seed-test-db.ts`). Never read `.env*`, never export `DATABASE_URL`.
- Cluster-B/A control names consumed here (verified against Task 8/9's JSX in this plan — re-align
  at execution time if the shipped components diverge): player dialog = Radix Dialog containing the
  playlist title; download row trigger `getByRole('button', { name: 'Download playlist' })` (the
  trigger's `aria-label`) opening a popover with `getByRole('button', { name: 'Download MP3' })` /
  `{ name: 'Download AAC' }` options (the per-format `aria-label`s); preflight URL carries
  `respond=preflight`, stream request same path without it.

**Interfaces (Produces — page-object additions, verbatim):**

```ts
/** The row's play-button, scoped by the row's unique title. */
rowPlayButton(title: string): Locator {
  return this.rowByTitle(title).getByRole('button', { name: 'Play playlist' });
}

/** The row's share-button, scoped by the row's unique title. */
rowShareButton(title: string): Locator {
  return this.rowByTitle(title).getByRole('button', { name: 'Share playlist' });
}

/** The share popover (Radix popover content renders role="dialog"). */
sharePopover(): Locator {
  return this.page.getByRole('dialog', { name: 'Share playlist' });
}

/** The player dialog, disambiguated by the playlist title it displays. */
playerDialog(title: string): Locator {
  return this.page.getByRole('dialog').filter({ hasText: title });
}

/** Click the Videos-group result for `title` (stages/adds it). */
async addVideoResult(title: string): Promise<void> {
  const option = this.searchOption('Videos', title);
  await expect(option).toBeVisible();
  await option.click();
}

/**
 * Resolve a playlist's id by its spec-unique title via the authenticated
 * list API (page.request shares the fixture session cookies). Reads the
 * first page — per-run playlist volume stays far below PLAYLISTS_PAGE_SIZE.
 */
async playlistIdByTitle(title: string): Promise<string> {
  const response = await this.page.request.get('/api/playlists?skip=0&take=24');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { rows: Array<{ id: string; title: string }> };
  const row = body.rows.find((r) => r.title === title);
  if (!row) throw new Error(`Playlist not found in first page: ${title}`);
  return row.id;
}
```

      Plus an ADDITIVE options param on the existing helper (callers untouched):

```ts
async createPlaylistWithFirstTrack(
  trackTitle: string,
  playlistTitle: string,
  { makePublic = false }: { makePublic?: boolean } = {}
): Promise<void> {
  await this.search(trackTitle);
  await this.addSongResult(trackTitle);
  const dialog = this.saveDialog('create');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill(playlistTitle);
  if (makePublic) {
    const publicSwitch = dialog.getByRole('switch', { name: 'Public playlist' });
    await publicSwitch.click();
    await expect(publicSwitch).toHaveAttribute('aria-checked', 'true');
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(this.rowByTitle(playlistTitle)).toBeVisible();
}
```

- [ ] Write `e2e/tests/playlists/playlist-player-share.spec.ts` (web-first assertions, no sleeps):

```ts
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/base.fixture';
import { PlaylistsPage } from '../../pages/playlists-page';

const TRACK_ALPHA = 'E2E Track Alpha';
const VIDEO_ALPHA = 'E2E Video Alpha';

/**
 * PR2 flows: row → player dialog, download preflight (never the full zip —
 * fixture-less S3 aborts streams in CI), share popover (public URL + private
 * make-public swap), and the /playlists/[id] shared page. Titles embed the
 * retry index + a timestamp (unique per owner forever, parallel-safe).
 */
test.describe('Playlist player and share', () => {
  test('opens the player dialog from a row with a mixed queue', async ({ userPage }, testInfo) => {
    const title = `Player Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    await playlists.search(VIDEO_ALPHA);
    await playlists.addVideoResult(VIDEO_ALPHA);
    await expect(playlists.rowByTitle(title)).toContainText('2 items');

    await playlists.rowPlayButton(title).click();
    const dialog = playlists.playerDialog(title);
    await expect(dialog).toBeVisible();

    // Queue lists both items.
    await expect(dialog.getByText(TRACK_ALPHA)).toBeVisible();
    await expect(dialog.getByText(VIDEO_ALPHA)).toBeVisible();

    // Cover art OR media surface — codec-agnostic terminal state (repo lesson:
    // local macOS Chromium lacks H.264; never assert one terminal path alone).
    await expect(dialog.locator('img').first().or(dialog.locator('video').first())).toBeVisible();
    // Transport controls render.
    await expect(dialog.getByRole('button', { name: /play|pause/i }).first()).toBeVisible();
  });

  test('authorizes a playlist download via preflight', async ({ page, userPage }, testInfo) => {
    const title = `Download Mix ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    const id = await playlists.playlistIdByTitle(title);

    // Direct authenticated preflight probe — ok:true JSON, no zip stream.
    const preflight = await userPage.request.get(
      `/api/playlists/${id}/download?format=MP3_320KBPS&respond=preflight`
    );
    expect(preflight.ok()).toBe(true);
    expect(await preflight.json()).toMatchObject({ ok: true });

    // Authorization boundary: the same preflight without a session is denied
    // (withAuth). The signed-out `page` fixture's request context has no cookies.
    const anonymous = await page.request.get(
      `/api/playlists/${id}/download?format=MP3_320KBPS&respond=preflight`
    );
    expect(anonymous.status()).toBe(401);

    // UI path from the shared page: the download row's preflight gates the
    // anchor stream. Assert ONLY the preflight response — never waitForResponse
    // the stream itself (free-digital-downloads lesson: fixture-less S3 aborts
    // the zip body mid-stream in CI, hanging anything that awaits it; that
    // spec's anonymous node:http probe does not transfer to this auth-gated
    // route, so the stream assertion is dropped, not emulated).
    await userPage.goto(`/playlists/${id}`);
    await expect(userPage.getByRole('heading', { level: 1, name: title })).toBeVisible();

    const preflightResponse = userPage.waitForResponse(
      (response) =>
        response.url().includes(`/api/playlists/${id}/download`) &&
        response.url().includes('respond=preflight'),
      { timeout: 15_000 }
    );
    await userPage.getByRole('button', { name: 'Download playlist' }).click();
    await userPage.getByRole('button', { name: 'Download MP3' }).click();
    expect((await preflightResponse).ok()).toBe(true);
  });

  test('shares a public playlist with its /playlists/{id} url', async ({ userPage }, testInfo) => {
    const title = `Share Public ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title, { makePublic: true });
    const id = await playlists.playlistIdByTitle(title);

    await playlists.rowShareButton(title).click();
    const popover = playlists.sharePopover();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Share on Facebook' })).toBeVisible();
    // The SMS anchor carries the encoded share URL — pin it to this playlist.
    await expect(popover.getByLabel('Share via SMS')).toHaveAttribute(
      'href',
      new RegExp(`playlists%2F${id}`)
    );
  });

  test('makes a private playlist public from the share popover', async ({ userPage }, testInfo) => {
    const title = `Share Private ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);

    await playlists.rowShareButton(title).click();
    const popover = playlists.sharePopover();
    await expect(
      popover.getByText('Only you can see this playlist — make it public to share.')
    ).toBeVisible();

    await popover.getByRole('button', { name: 'Make public' }).click();

    // The mine() invalidation flips isPublic → the widget swaps in live.
    await expect(popover.getByRole('button', { name: 'Share on Facebook' })).toBeVisible();
    await expect(playlists.rowByTitle(title)).toContainText('1 item · Public');
  });

  test('renders the shared page for the owner', async ({ userPage }, testInfo) => {
    const title = `Owner Page ${testInfo.retry}-${Date.now()}`;
    const playlists = new PlaylistsPage(userPage);
    await playlists.goto();
    await playlists.createPlaylistWithFirstTrack(TRACK_ALPHA, title);
    const id = await playlists.playlistIdByTitle(title);

    await userPage.goto(`/playlists/${id}`);

    await expect(userPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(userPage.getByRole('link', { name: 'Open in My Playlists' })).toHaveAttribute(
      'href',
      `/playlists?edit=${id}`
    );
    await expect(userPage.getByText(TRACK_ALPHA).first()).toBeVisible();
    // Player surface, codec-agnostic (image fallback OR media element).
    const main = userPage.getByRole('main');
    await expect(main.locator('img').first().or(main.locator('video').first())).toBeVisible();
  });

  test('redirects a signed-out visitor to /signin', async ({ page }) => {
    await page.goto('/playlists/000000000000000000000000');

    await expect(page).toHaveURL(/\/signin/);
  });
});
```

- [ ] Run against the isolated stack ONLY (the harness scopes the env — never export
      `DATABASE_URL` from the shell): `pnpm run e2e:docker:up` then
      `pnpm run test:e2e -- e2e/tests/playlists e2e/tests/placeholder-pages.spec.ts` —
      adjacent-spec rerun list = the new spec + the existing four
      (`playlist-create`, `playlist-edit-reorder`, `playlist-delete-duplicate`,
      `playlist-public-search` — the latter now carries Task 15's no-Videos-group line) +
      `placeholder-pages.spec.ts` (references the `/playlists` signed-out redirect). Iterate to
      green; unexpected empty-seed/404 results → first hypothesis is wrong-database: stop and
      surface, don't retry.
- [ ] Confirm the locator names (`'Download playlist'` trigger, `'Download MP3'` / `'Download AAC'`
      options, player-dialog accessible structure) against the SHIPPED Task 8/9 components and
      re-align if they diverged — page-object/locator edits only, assertions unchanged.
- [ ] Gate (unit gate unaffected but mandatory pre-commit) → commit
      `test(playlists): ✅ player share e2e flows`

---

## Self-review notes

- Share wiring drops `onShare` end-to-end instead of a `shareWrapper` render-prop: `PlaylistRowActions`
  already holds the full row, and the delete AlertDialog sets the in-component-overlay precedent.
- `SocialShareWidget` keeps `artistUrl` (optional) and gains `url` — 20+ spec usages and
  `release-share-widget.tsx` stay untouched; the `?? ''` fallback branch is covered by a dedicated spec.
- `usePlaylistsQuery` → `useInfiniteQuery` is the smallest design that APPENDS pages with TanStack
  doing the accumulation; the `/playlists` page prefetch switches to `prefetchInfiniteQuery`
  (same key, `initialPageParam: 0`) in the same commit to preserve hydration parity.
- `/playlists/[id]` seeds the detail cache via `setQueryData` (tours precedent) — the service payload
  is already the wire shape, so hydration is byte-identical with zero self-fetch.
- E2E never asserts a complete zip stream (CI S3 divergence) and never asserts a single media
  terminal state (codec divergence); all playlists are created through the UI with
  retry+timestamp-unique titles, so no seed changes were needed (verified: videos + MP3 fixtures
  already seeded via `createMany`).

### Task 17: Full gate + coverage

- [ ] `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format` — run in order; if `format` writes, inspect and commit as `style: 🎨 format playlists pr2 branch`.
- [ ] `pnpm run test:coverage:check` — must not regress the `COVERAGE_METRICS.md` baseline (branches −2% tolerance, hard floor 95% global). Add targeted branch tests where new code drags it down; do NOT contort tests for by-construction-unreachable guards.
- [ ] `pnpm exec prisma generate` idempotent; `git status` clean except intended files; commit any gate fixes as `test(playlists): ✅ …` / `style: 🎨 …`.
- [ ] Re-run the adjacent E2E specs the branch touched (all `e2e/tests/playlists/*.spec.ts` + `placeholder-pages.spec.ts`) against the isolated Docker Mongo — green before the final review.

## Self-review notes (already applied during planning)

- Video `streamUrl` is nullable by design (signing-unconfigured environments) — mirrors the shipped videos feature; the player and E2E account for it (Assembly ratification 1).
- The requested-format track resolution uses per-release format lookup (`findManyByReleaseIdsAndFormatType`) — the PR1-deferred `findManyByFormatIdsAndTrackNumbers` shape was superseded by this simpler query.
- `usePlaylistsQuery`'s switch to infinite pagination (Task 14) changes the page prefetch to `prefetchInfiniteQuery` in the same commit — hydration parity is re-verified there.
- PR3 (global add-to-playlist menu) remains out of scope; `PlaylistPickerCombobox` and dialog components were built PR3-ready in PR1.
