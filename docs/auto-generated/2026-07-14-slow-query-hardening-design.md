# Slow-Query Hardening — Design

**Date:** 2026-07-14
**Branch:** `perf/slow-query-hardening`
**Author:** AI-assisted (Claude), directed by @michauxkelley

## Context & honest framing

The request was "analyze and improve slow queries above 200ms." The codebase
**already** instruments exactly this: `src/lib/utils/slow-query-extension.ts`
logs every Prisma op ≥ `SLOW_QUERY_MS` (default 200ms) to
`loggers.database.warn` → Loki/Grafana, and `scripts/check-query-plans.ts`
asserts the hot queries are index-served. The schema carries 123 index
declarations across 48 models — a prior slow-query pass already happened.

A five-cluster static audit of all ~40 repositories surfaced **no query that
will demonstrably exceed 200ms and is not already handled**. There is currently
**no measured evidence** any query is slow (that data lives in prod
Grafana/Loki + Atlas Performance Advisor, to be supplied separately and folded
in). This work is therefore **preventive hardening**, undertaken at the user's
explicit direction to implement the full valid audit set. It runs on **Atlas M0
free tier** (512MB, RAM-bound), so index count is a real cost and the set is
deliberately limited to changes that serve a real query shape.

**Correctness guardrail:** findings that are factually no-ops (index already
exists) or cannot serve their query (a range field cannot lead a sort) are
excluded, not implemented — see [Excluded](#excluded-with-reasons). Every index
added is proven with an `explain` IXSCAN assertion before it ships.

## Goals

- Add missing indexes that serve real repository query shapes (filter + sort),
  each verified by an `explain` plan that considers the index.
- Make a few behavior-preserving latency/hygiene refactors on hot/growing paths.
- Extend `scripts/check-query-plans.ts` so every newly-indexed query is guarded
  against future regression.

## Non-goals

- No mass/speculative indexing of M0 beyond query-backed additions.
- No behavior changes to public output (discography completeness, API shapes).
- No override of deliberate, documented design (e.g. chat read-time predicate)
  without measured evidence.
- Not a substitute for acting on real prod slow-query data when it arrives.

## A. Index additions

> **Trimmed 2026-07-14 (post-review):** shipped only the **four** indexes that
> close a genuine gap (the query was not index-served before) — `Venue`
> `[createdAt]`, `FeaturedArtist` `[position, featuredOn]`, `User`
> `[allowSmsNotifications, phone]`, `Release` `[publishedAt]`. The other twelve
> "M" indexes below were dropped: running the guard proved the queries were
> already index-served at the leading-field level, so they were pure M0 write
> cost for no measurable gain. They can be reinstated when prod data justifies.

Each is added to `prisma/schema.prisma` and gets a `check-query-plans.ts`
`TARGETS` entry asserting an applicable IXSCAN. Value column: **H** = serves a
hot/growing path, **M** = marginal (leading field already narrows, or
small/rare path) but query-backed and cheap.

| Model                  | Index                                                                          | Serves (repo method)                                                                 | Value |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----- |
| `DownloadEvent`        | `[userId, releaseId, downloadedAt]`                                            | `countSuccessfulDownloadsInWindow` (auth path) — mirrors existing guest index        | **H** |
| `DownloadEvent`        | `[releaseId, success]`                                                         | `getTotalDownloads`, `getUniqueUsers`, `getAnalyticsByRelease`                       | M     |
| `DownloadEvent`        | `[userId, success]`                                                            | `getAnalyticsByUser`                                                                 | M     |
| `ReleaseDigitalFormat` | `[releaseId, deletedAt]`                                                       | `findActiveByReleaseAndFormat`, `findAllByRelease`                                   | M     |
| `Image`                | `[artistId, sortOrder]`                                                        | `findManyByArtist`                                                                   | M     |
| `Artist`               | `[isActive, displayName]`                                                      | `listPublishedWithBio` (isActive eq + displayName sort; publishedOn filtered inline) | **H** |
| `FeaturedArtist`       | `[position, featuredOn]`                                                       | `findAll` (admin compound sort)                                                      | M     |
| `ArtistBioImage`       | `[artistId, isPrimary, sortOrder]`                                             | primary-bio-image subquery                                                           | M     |
| `ArtistBioLink`        | `[artistId, sortOrder]`                                                        | bio-link ordering                                                                    | M     |
| `VideoArtist`          | `[videoId, sortOrder]`                                                         | `findByVideoId`                                                                      | M     |
| `Venue`                | `[createdAt]`                                                                  | `findRecent` (blocking sort)                                                         | M     |
| `User`                 | `[allowSmsNotifications, phone]`                                               | `findSmsOptedInUsers`                                                                | M     |
| `BannedIdentity`       | `[email, unbannedAt]`, `[fingerprintHash, unbannedAt]`, `[userId, unbannedAt]` | `findActiveMatch` branches                                                           | M     |
| `Release`              | `[publishedAt]`                                                                | published-count filter                                                               | M     |

Exact leading-field order is confirmed by the `explain` assertion. Any candidate
whose `explain` shows it cannot serve the intended filter/sort is rewritten or
dropped — it does not ship on faith.

## B. Behavior-preserving refactors

1. **`UserDownloadQuota.addUniqueRelease`** → single `upsert` (create-or-push)
   instead of `findOrCreateBySubject` (findUnique [+create]) then `update`.
   Removes one Atlas round-trip on the download path. Pure latency win; output
   identical. (The `uniqueReleaseIdsCount` denormalization is **not** done — the
   `uniqueReleaseIds` array is bounded to `maxQuota`≈5 by the quota logic, so
   there is no array-scan problem.)

2. **`ChatRateLimitLog` retention** — prune rows older than the rolling window so
   the log cannot grow unbounded on M0. Mechanism: application-side
   `deleteMany({ attemptedAt: { lt: cutoff } })` invoked opportunistically from
   the existing write path (no new infra/cron). The `[fingerprint, attemptedAt]`
   index already serves the count.

3. **High, effectively-invisible payload caps** on unbounded nested includes
   where a pathological row could bloat a hot payload — set well above real data
   (e.g. `files: { take: 200 }` per format; real albums are < ~50 tracks) so no
   real content is ever hidden. Only applied where the cap cannot change real
   output; the artist discography `releases` list is **left uncapped**.

## Excluded (with reasons)

| Finding                                                    | Why excluded                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatUser [flagged]`, `ChatUser [disabled]`                | Already exist (schema:909–910) — no-op                                                                                                        |
| `VideoEnrichmentSuggestion [videoId, status]`              | Already exists — no-op                                                                                                                        |
| `Release [publishedAt, releasedOn]` compound               | Range field can't lead a sort; `releasedOn` already serves `findPublished` (guarded)                                                          |
| `UserDownloadQuota.uniqueReleaseIdsCount` denorm           | Array bounded to `maxQuota`≈5 by quota logic — no scan to avoid                                                                               |
| `chat findRecent` relation denormalization                 | Not a COLLSCAN (walks `[createdAt desc]`, lookups bounded by `take`); read-time predicate is deliberate + documented; no evidence of slowness |
| Artist-detail `releases` cap / purchase-history pagination | Behavior change (would hide discography / alter API shape) — out of scope                                                                     |
| Video/Tour/Venue `contains` text search index              | MongoDB can't index substring `contains` without `$text`; pagination already bounds these admin paths                                         |

Any excluded item can be reinstated on request (or when prod data justifies it).

## Verification

- **Query-plan guard:** add a `TARGETS` entry in `scripts/check-query-plans.ts`
  for each newly-indexed query (TDD: entry FAILs "no applicable index" → add the
  index → PASSes). Requires the relevant collections to be seeded locally; extend
  `e2e/helpers/seed-test-db.ts` where a collection is currently empty
  (`DownloadEvent`, `ChatRateLimitLog`, `BannedIdentity`, etc.) so the planner
  can consider the index (empty collection → SKIP, not PASS).
- **Unit tests:** for each refactor (quota `upsert` equivalence; rate-limit
  retention prune boundary), test behavior/output, mocking Prisma at the repo
  boundary.
- **Full gate** before every commit:
  `pnpm run typecheck && pnpm run test:run && pnpm run lint && pnpm run format`.
- **Coverage:** do not regress the `COVERAGE_METRICS.md` baseline.

## Rollout / ops

- Indexes apply via `prisma db push` on deploy (2 new-index builds are online on
  MongoDB). No data migration is required (the count-denorm was dropped).
- `ChatRateLimitLog` retention is code-only; no schema/infra change.
- Post-deploy: confirm the new indexes exist in Atlas; fold in the real
  Grafana/Loki + Performance Advisor data to confirm/prioritize (the "Both"
  half still pending from the user).

## Risks

- **M0 over-indexing** — acknowledged and accepted by explicit user direction;
  set held to query-backed additions only. `DownloadEvent` is write-heavy (one
  insert per download attempt); its 3 added indexes carry the most write cost —
  flagged for the user, kept because the window-cap index (H) is genuinely on
  the hot path and the two analytics indexes are cheap at current volume.
- **Seed drift** — adding TARGETS needs seed rows; kept minimal and colocated
  with existing e2e seed helpers.

## Test plan (execution order)

1. Extend `check-query-plans.ts` TARGETS + seed helper (RED for new indexes).
2. Add indexes to `prisma/schema.prisma`; `prisma db push` to local E2E Mongo;
   run the guard (GREEN).
3. Quota `upsert` refactor + unit tests.
4. `ChatRateLimitLog` retention + unit tests.
5. Payload caps (where invisible) + assertions.
6. Full gate + coverage check; atomic commits per logical group; open PR.
