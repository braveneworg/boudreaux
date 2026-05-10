# Phase 1 Data Model: Free Digital Format Downloads

**Feature**: `007-free-digital-downloads` | **Date**: 2026-05-07

This document captures the Prisma deltas required by the clarified spec. All other entities (releases, digital formats, files) are unchanged.

## New Model: `VisitorIdentity`

Stores the dual-key index linking a `visitorId` (the cookie value) to its server-derived `fingerprintHash`. Used to recover a visitor's prior identity after cookies are cleared.

```prisma
model VisitorIdentity {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  // Canonical anonymous identifier — same value as the boudreaux_visitor_id cookie.
  visitorId       String   @unique
  // SHA-256(UA | Accept-Language | IP /24) hex digest. Indexed for cookie-recovery lookups.
  fingerprintHash String
  firstSeenAt     DateTime @default(now())
  lastSeenAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([fingerprintHash])
  @@index([lastSeenAt])
}
```

**Validation rules**:

- `visitorId` MUST match the canonical UUID pattern enforced by `guest-visitor-id.ts`.
- `fingerprintHash` MUST be a 64-character lowercase hex string.

**State transitions**: append-only. `lastSeenAt` and `fingerprintHash` may change as the visitor moves between networks (UA + IP /24 may shift). `visitorId` never changes for a given row.

## Reused Model: `DownloadEvent` (no schema change)

Existing model (already in schema):

```prisma
model DownloadEvent {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       String?  @db.ObjectId
  visitorId    String?
  releaseId    String   @db.ObjectId
  formatType   String
  success      Boolean
  errorCode    String?
  ipAddress    String?
  userAgent    String?
  downloadedAt DateTime @default(now())
  createdAt    DateTime @default(now())

  @@index([userId])
  @@index([visitorId])
  @@index([releaseId])
  @@index([downloadedAt])
  @@index([userId, releaseId])
}
```

**New repository method (no schema change)**:

```ts
// src/lib/repositories/download-event-repository.ts
async function countSuccessfulDownloadsInWindow(params: {
  visitorId: string;
  releaseId: string;
  windowStart: Date;
}): Promise<{ count: number; oldestInWindow: Date | null }>;
```

Adds (or relies on) compound index `(visitorId, releaseId, downloadedAt)` for performance. If query plan is unsatisfactory, add `@@index([visitorId, releaseId, downloadedAt])` in a follow-up migration.

**Validation rules**:

- `visitorId` MUST be a non-empty string for guest events.
- `releaseId` MUST be a 24-char hex ObjectId.
- `formatType` MUST be one of `MP3_320KBPS` or `AAC` for free-flow events.

## Reused Model: `GuestDownloadCount` (no schema change; deprecated as cap source)

Already in schema. Will continue to be written alongside `DownloadEvent` for legacy fast reads, but **MUST NOT** be the source of truth for cap enforcement (it cannot represent rolling-window semantics).

## Retired Concept: Freemium AAC Cross-Release Quota

`UserDownloadQuota` row writes for the AAC free-flow path are removed. The model itself remains in the schema for potential future use.

## Entity Relationships

```text
┌─────────────────────────┐       ┌─────────────────────────┐
│ VisitorIdentity         │       │ DownloadEvent           │
│ ─────────────────────── │       │ ─────────────────────── │
│ visitorId  (unique)     │◄──────│ visitorId               │
│ fingerprintHash (idx)   │       │ releaseId  (idx)        │
│ lastSeenAt              │       │ downloadedAt (idx)      │
└─────────────────────────┘       │ success                 │
                                  └─────────────────────────┘
```

The cap query is:

```sql
SELECT COUNT(*), MIN(downloadedAt)
FROM DownloadEvent
WHERE visitorId = :canonicalVisitorId
  AND releaseId = :releaseId
  AND success = true
  AND downloadedAt >= NOW() - INTERVAL '24 hours';
```

Block if `count >= 3`. `resetsAt = oldestInWindow + 24h`.

## Migration Notes

- Add `VisitorIdentity` model via `pnpm exec prisma db push` (MongoDB; no migration files).
- No backfill needed: existing free-flow guest events already carry `visitorId`; `VisitorIdentity` rows are created lazily on the first request handled by the new resolver.
