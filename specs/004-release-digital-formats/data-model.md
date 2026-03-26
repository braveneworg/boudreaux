# Data Model: Release Digital Formats Management

**Feature**: `004-release-digital-formats`
**Branch**: `004-release-digital-formats`
**Date**: 2026-03-23

---

## Schema Changes Overview

| Change                                 | Type   | Model     |
| -------------------------------------- | ------ | --------- |
| Add `suggestedPrice` field             | MODIFY | `Release` |
| Add `digitalFormats` back-relation     | MODIFY | `Release` |
| Add `userDownloadQuotas` back-relation | MODIFY | `User`    |
| Add `downloadEvents` back-relation     | MODIFY | `User`    |
| Add `ReleaseDigitalFormat` model       | NEW    | —         |
| Add `UserDownloadQuota` model          | NEW    | —         |
| Add `DownloadEvent` model              | NEW    | —         |

---

## Modified Model: `Release`

Add the following fields to the existing `Release` model in `prisma/schema.prisma`:

```prisma
// NEW fields — add after existing fields
suggestedPrice   Int?                // Suggested PWYW price in cents (stored as Int, not Decimal - MongoDB limitation); null = no suggestion
digitalFormats   ReleaseDigitalFormat[] // All digital format files for this release
```

**Notes**:

- `suggestedPrice` uses `Int` type storing price in cents (e.g., 1599 = $15.99). MongoDB does not support Decimal128 well via Prisma, so cents-as-integer is the established pattern. Dollar↔cents conversion happens at the application boundary. Null value means no suggested price is set.
- `digitalFormats` back-relation allows querying all audio files associated with a release.

---

## Modified Model: `User`

Add the following back-relations to the existing `User` model:

```prisma
// NEW back-relations — add after existing relations
userDownloadQuotas UserDownloadQuota[]
downloadEvents     DownloadEvent[]
```

---

## New Model: `ReleaseDigitalFormat`

Stores metadata for each digital audio format file (MP3, FLAC, WAV, AAC) associated with a release. Files are stored in S3, this model stores references and metadata.

```prisma
model ReleaseDigitalFormat {
  id            String    @id @default(auto()) @map("_id") @db.ObjectId
  releaseId     String    @db.ObjectId
  release       Release   @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  formatType    String    // Enum: MP3_320KBPS, FLAC, WAV, AAC (matches existing ReleaseFormat enumeration)
  s3Key         String    // S3 object key: releases/${releaseId}/digital-formats/${formatType}/${uuid}.${ext}
  fileName      String    // Original uploaded filename (for user-friendly download naming)
  fileSize      BigInt    // File size in bytes
  mimeType      String    // MIME type: audio/mpeg, audio/flac, audio/wav, audio/aac
  checksum      String?   // MD5 or SHA256 checksum for integrity verification (optional)
  deletedAt     DateTime? // Soft delete timestamp; null = active
  uploadedAt    DateTime  @default(now())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([releaseId, formatType]) // One file per format type per release
  @@index([releaseId])
  @@index([s3Key])
  @@index([deletedAt]) // For soft delete queries
}
```

### Field Details

| Field        | Type                  | Description                                                                                                |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `releaseId`  | `String @db.ObjectId` | Reference to parent `Release`                                                                              |
| `formatType` | `String`              | Format identifier (e.g., `MP3_320KBPS`, `FLAC`); matches existing `ReleaseFormat` enum values              |
| `s3Key`      | `String`              | S3 object key for locating file in bucket                                                                  |
| `fileName`   | `String`              | Original filename for user-friendly download naming                                                        |
| `fileSize`   | `BigInt`              | File size in bytes (BigInt to support >2GB WAV files)                                                      |
| `mimeType`   | `String`              | MIME type for Content-Type header in presigned URLs                                                        |
| `checksum`   | `String?`             | Optional file integrity checksum (MD5/SHA256)                                                              |
| `deletedAt`  | `DateTime?`           | Soft delete timestamp; query with `deletedAt: null` for active formats, apply grace period logic for users |
| `uploadedAt` | `DateTime`            | When the file was successfully uploaded to S3                                                              |

### Constraints

- `@@unique([releaseId, formatType])`: Enforces one file per format type per release (e.g., only one MP3_320KBPS file per release).
- `@@index([deletedAt])`: Optimizes soft delete queries (`WHERE deletedAt IS NULL OR deletedAt > gracePeriodCutoff`).
- `onDelete: Cascade`: If a Release is deleted, all associated digital formats are also deleted.

---

## New Model: `UserDownloadQuota`

Tracks the freemium download quota (5 free unique releases) per user. Uses array of release IDs to count unique downloads.

```prisma
model UserDownloadQuota {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  userId           String   @db.ObjectId @unique
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  uniqueReleaseIds String[] @db.Array(ObjectId) // Array of release IDs downloaded for free
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([userId])
}
```

### Field Details

| Field              | Type                      | Description                                                                      |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------- |
| `userId`           | `String @db.ObjectId`     | Reference to the `User`; unique constraint ensures one quota record per user     |
| `uniqueReleaseIds` | `String[] @db.Array(...)` | Array of release ObjectIds downloaded for free; max length enforced at app layer |
| `createdAt`        | `DateTime`                | When the quota tracking started (first free download)                            |
| `updatedAt`        | `DateTime`                | Last time a free download was added (for analytics)                              |

### Constraints

- `userId @unique`: One download quota record per user.
- `onDelete: Cascade`: If a User is deleted, their quota record is also deleted.
- **Application-level enforcement**: Check `uniqueReleaseIds.length < 5` before allowing free download. Use MongoDB `$addToSet` operator (via Prisma) to atomically add release IDs only if not already present.

---

## New Model: `DownloadEvent`

Logs every download attempt for analytics, audit trail, and usage monitoring. Supports both successful and failed downloads.

```prisma
model DownloadEvent {
  id           String    @id @default(auto()) @map("_id") @db.ObjectId
  userId       String?   @db.ObjectId // Nullable for guest downloads (future feature)
  user         User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  releaseId    String    @db.ObjectId
  formatType   String    // Format downloaded (e.g., MP3_320KBPS, FLAC)
  success      Boolean   // true = download succeeded, false = failed (quota exceeded, auth error, etc.)
  errorCode    String?   // Optional error code for failed downloads (e.g., QUOTA_EXCEEDED, NOT_PURCHASED)
  ipAddress    String?   // IP address for security audit (optional, privacy-sensitive)
  userAgent    String?   // User agent string (optional, for analytics)
  downloadedAt DateTime  @default(now())
  createdAt    DateTime  @default(now())

  @@index([userId])
  @@index([releaseId])
  @@index([downloadedAt]) // For time-based analytics queries
  @@index([userId, releaseId]) // For per-user per-release download history
}
```

### Field Details

| Field          | Type                   | Description                                                      |
| -------------- | ---------------------- | ---------------------------------------------------------------- |
| `userId`       | `String? @db.ObjectId` | Reference to downloading User; nullable for guest downloads      |
| `releaseId`    | `String @db.ObjectId`  | Release being downloaded                                         |
| `formatType`   | `String`               | Format type downloaded (e.g., `MP3_320KBPS`)                     |
| `success`      | `Boolean`              | Whether the download authorization succeeded                     |
| `errorCode`    | `String?`              | Error code for failed downloads (e.g., `QUOTA_EXCEEDED`)         |
| `ipAddress`    | `String?`              | IP address for security/abuse monitoring (consider privacy laws) |
| `userAgent`    | `String?`              | Browser user agent for analytics                                 |
| `downloadedAt` | `DateTime`             | Timestamp of download attempt                                    |

### Constraints

- `@@index([userId, releaseId])`: Optimizes queries for "all downloads by user for a specific release" (analytics feature, User Story 5).
- `@@index([downloadedAt])`: Supports time-based analytics (e.g., "downloads in the past 30 days").
- `onDelete: SetNull`: If a User is deleted, preserve download event history for analytics (set `userId` to null).

---

## Constants

Define format-specific file size limits and MIME type mappings as named constants to avoid magic numbers:

```typescript
// src/lib/constants/digital-formats.ts

/**
 * File size limits per format type (in bytes)
 */
export const FORMAT_SIZE_LIMITS = {
  MP3_320KBPS: 100 * 1024 * 1024, // 100MB
  AAC: 100 * 1024 * 1024, // 100MB
  FLAC: 250 * 1024 * 1024, // 250MB
  WAV: 500 * 1024 * 1024, // 500MB
} as const;

/**
 * MIME type allowlist per format type
 */
export const FORMAT_MIME_TYPES = {
  MP3_320KBPS: ['audio/mpeg', 'audio/mp3'],
  AAC: ['audio/aac', 'audio/x-aac'],
  FLAC: ['audio/flac', 'audio/x-flac'],
  WAV: ['audio/wav', 'audio/x-wav', 'audio/wave'],
} as const;

/**
 * Freemium download quota limit
 */
export const MAX_FREE_DOWNLOAD_QUOTA = 5;

/**
 * Soft delete grace period in days (for purchasers)
 */
export const SOFT_DELETE_GRACE_PERIOD_DAYS = 90;

/**
 * Replaced file archive retention in days
 */
export const FILE_REPLACEMENT_ARCHIVE_DAYS = 30;

/**
 * Presigned URL expiration times
 */
export const PRESIGNED_URL_EXPIRATION = {
  UPLOAD: 15 * 60, // 15 minutes (900 seconds)
  DOWNLOAD: 24 * 60 * 60, // 24 hours (86400 seconds)
} as const;
```

---

## Migration Notes

When applying schema changes:

1. Run `prisma generate` to update Prisma Client types
2. Run `prisma db push` to apply schema changes to MongoDB
3. Verify indexes are created: `uniqueReleaseIds` array field, `deletedAt` timestamp, composite `[userId, releaseId]` for DownloadEvent
4. Seed development database with sample digital formats for testing (see `prisma/seed.ts` modifications)

---
