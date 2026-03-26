# API Contracts: Release Digital Formats Management

**Feature**: `004-release-digital-formats`
**Branch**: `004-release-digital-formats`
**Date**: 2026-03-23

---

## Overview

This document defines the API contracts for digital format download authorization. The API follows RESTful patterns and returns JSON responses with standardized error codes.

---

## Endpoint: Download Authorization

**Route**: `/api/releases/[releaseId]/download/[formatType]`  
**Method**: `GET`  
**Purpose**: Authorize a user to download a specific digital format, generate a time-limited S3 presigned URL, and log the download event.

### Path Parameters

| Parameter    | Type   | Description                                         | Example                             |
| ------------ | ------ | --------------------------------------------------- | ----------------------------------- |
| `releaseId`  | string | MongoDB ObjectId of the release                     | `65f8a3b2c4d5e6f7a8b9c0d1`          |
| `formatType` | string | Format type identifier (matches ReleaseFormat enum) | `MP3_320KBPS`, `FLAC`, `WAV`, `AAC` |

### Authentication

**Required**: Yes

- Uses Auth.js JWT authentication via `getToken()` from `next-auth/jwt` for API routes, or `withAdmin` decorator from `@/lib/decorators/with-auth` for admin-only API routes. Server Actions use `requireRole('admin')` decorator.
- Unauthenticated requests return `401 Unauthorized`.

### Authorization Logic

The endpoint performs the following checks in order:

1. **Authentication Check**: Verify user is authenticated (session or JWT token). If not → `401 Unauthorized`.
2. **Format Existence Check**: Verify `ReleaseDigitalFormat` exists for the given `releaseId` and `formatType`. Apply soft delete filter (allow access during grace period for purchasers). If not found → `404 Not Found`.
3. **Purchase Check**: Query `ReleasePurchase` for `userId` and `releaseId`. If found → **allow download** (skip quota check).
4. **Freemium Quota Check** (if no purchase):
   - Fetch `UserDownloadQuota` for `userId`.
   - Check if `uniqueReleaseIds` contains `releaseId` (already downloaded this release for free) → **allow download** (no quota consumption).
   - Check if `uniqueReleaseIds.length < 5` (quota not exhausted) → **allow download** and atomically add `releaseId` to `uniqueReleaseIds` array via MongoDB `$addToSet`.
   - If `uniqueReleaseIds.length >= 5` and `releaseId` not in set → `403 Forbidden` with `QUOTA_EXCEEDED` error code.
5. **Soft Delete Grace Period Check**:
   - If `ReleaseDigitalFormat.deletedAt` is not null:
     - Calculate grace period cutoff: `deletedAt + 90 days`.
     - Check if user has purchased the release (via `ReleasePurchase`).
     - If purchased and within grace period → **allow download**.
     - If not purchased or outside grace period → `410 Gone` with `DELETED` error code.
6. **Generate Presigned URL**: Use AWS SDK S3 `getSignedUrl()` with `GetObjectCommand` for `ReleaseDigitalFormat.s3Key`, set expiration to 24 hours (86400 seconds).
7. **Log Download Event**: Create `DownloadEvent` record with `userId`, `releaseId`, `formatType`, `success: true`, `downloadedAt: now()`, optional `ipAddress` and `userAgent`.
8. **Return Success Response**: JSON with `{ success: true, downloadUrl: string, expiresAt: ISO8601 timestamp }`.

### Success Response (200 OK)

```json
{
  "success": true,
  "downloadUrl": "https://s3.amazonaws.com/bucket-name/releases/65f8a3b2c4d5e6f7a8b9c0d1/digital-formats/MP3_320KBPS/abc123-def456.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=...",
  "expiresAt": "2026-03-24T14:32:15Z",
  "fileName": "Artist Name - Album Name - MP3 320kbps.mp3"
}
```

**Fields**:

- `success` (boolean): Always `true` for successful responses.
- `downloadUrl` (string): S3 presigned GET URL, valid for 24 hours.
- `expiresAt` (string): ISO8601 timestamp when the URL expires.
- `fileName` (string): Suggested filename for browser download (from `ReleaseDigitalFormat.fileName`).

### Error Responses

#### 401 Unauthorized

**Condition**: User is not authenticated (no session or invalid JWT token).

```json
{
  "success": false,
  "error": "UNAUTHORIZED",
  "message": "You must be logged in to download releases."
}
```

#### 403 Forbidden — Quota Exceeded

**Condition**: User has exhausted free download quota (5 unique releases) and has not purchased this release.

```json
{
  "success": false,
  "error": "QUOTA_EXCEEDED",
  "message": "You have reached your free download limit (5 unique releases). Please purchase this release or contact support.",
  "contactSupportUrl": "/support"
}
```

#### 404 Not Found

**Condition**: `ReleaseDigitalFormat` does not exist for the given `releaseId` and `formatType`, or release itself does not exist.

```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "The requested digital format is not available for this release."
}
```

#### 410 Gone — Soft Deleted

**Condition**: `ReleaseDigitalFormat` is soft deleted (`deletedAt` is set) and either:

- User has not purchased the release, OR
- Grace period (90 days) has expired.

```json
{
  "success": false,
  "error": "DELETED",
  "message": "This digital format is no longer available."
}
```

#### 500 Internal Server Error

**Condition**: Unexpected server error (S3 client failure, database connection error, etc.).

```json
{
  "success": false,
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred. Please try again later."
}
```

---

## Endpoint: Upload Presigned URL Generation

**Route**: Server Action (not RESTful endpoint)  
**Function**: `uploadDigitalFormatAction(releaseId, formatType, fileInfo)`  
**Method**: Server Action (POST via Next.js Server Actions)  
**Purpose**: Generate S3 presigned PUT URL for admin to upload digital format file.

### Parameters

```typescript
interface FileInfo {
  fileName: string; // Original filename (e.g., "album.mp3")
  mimeType: string; // MIME type (e.g., "audio/mpeg")
  fileSize: number; // File size in bytes
}

function uploadDigitalFormatAction(
  releaseId: string,
  formatType: string,
  fileInfo: FileInfo
): Promise<ActionResult<PresignedUploadResponse>>;
```

### Validation

**Pre-upload validation** (Zod schema):

1. `formatType` must be one of: `MP3_320KBPS`, `AAC`, `FLAC`, `WAV`.
2. `mimeType` must match allowed MIME types for the format (see `FORMAT_MIME_TYPES` constant).
3. `fileSize` must not exceed format-specific limit:
   - MP3/AAC: 100MB (104,857,600 bytes)
   - FLAC: 250MB (262,144,000 bytes)
   - WAV: 500MB (524,288,000 bytes)
4. `releaseId` must be a valid MongoDB ObjectId.
5. User must have admin role (enforced via `requireRole('ADMIN')` decorator).

### Success Response

```typescript
interface PresignedUploadResponse {
  uploadUrl: string; // S3 presigned PUT URL, valid for 15 minutes
  s3Key: string; // S3 object key for tracking upload completion
  expiresIn: number; // Expiration time in seconds (900 = 15 minutes)
}
```

### Error Response

```typescript
interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Example error:
{
  success: false,
  error: "File size exceeds limit for MP3_320KBPS format (max 100MB)"
}
```

### Post-Upload Flow

After the client uploads the file to S3 using the presigned URL:

1. Client calls `confirmDigitalFormatUploadAction(releaseId, formatType, s3Key)`.
2. Server Action verifies the S3 object exists (HEAD request to S3).
3. Server Action creates `ReleaseDigitalFormat` record in database.
4. Server Action returns success response with checksum and metadata.

---

## Endpoint: Delete Digital Format

**Route**: Server Action (not RESTful endpoint)  
**Function**: `deleteDigitalFormatAction(releaseId, formatType)`  
**Method**: Server Action (POST via Next.js Server Actions)  
**Purpose**: Soft delete a digital format, setting `deletedAt` timestamp and applying grace period logic.

### Parameters

```typescript
function deleteDigitalFormatAction(
  releaseId: string,
  formatType: string
): Promise<ActionResult<void>>;
```

### Authorization

- User must have admin role (enforced via `requireRole('ADMIN')` decorator).

### Success Response

```typescript
{
  success: true,
  message: "Digital format deleted successfully. Existing purchasers will retain access for 90 days."
}
```

### Error Response

```typescript
{
  success: false,
  error: "Digital format not found for the specified release and format type."
}
```

### Soft Delete Behavior

- Sets `ReleaseDigitalFormat.deletedAt = new Date()` (current timestamp).
- **Does NOT** delete the S3 object immediately.
- Existing purchasers can download for 90 days via grace period logic in download authorization endpoint.
- Hard delete (S3 object removal) occurs via scheduled job after grace period expires.

---

## Endpoint: Replace Digital Format

**Route**: Server Action (not RESTful endpoint)  
**Function**: `replaceDigitalFormatAction(releaseId, formatType, fileInfo)`  
**Method**: Server Action (POST via Next.js Server Actions)  
**Purpose**: Replace an existing digital format file, archive the old file for 30 days, preserve the download URL pattern.

### Parameters

Same as `uploadDigitalFormatAction`, but requires existing `ReleaseDigitalFormat` record.

### Replacement Behavior

1. Generate new S3 presigned PUT URL with same key pattern (different UUID suffix to avoid caching issues).
2. Client uploads new file to S3.
3. Archive old S3 object by copying to `archives/` prefix with timestamp suffix.
4. Update `ReleaseDigitalFormat` record: new `s3Key`, `fileSize`, `checksum`, `updatedAt`.
5. Schedule old S3 object deletion after 30 days via metadata tag or separate tracking table.

### Success Response

```typescript
{
  success: true,
  uploadUrl: "https://s3.amazonaws.com/...",
  s3Key: "releases/65f8a3b2c4d5e6f7a8b9c0d1/digital-formats/MP3_320KBPS/new-uuid.mp3",
  archiveKey: "archives/releases/65f8a3b2c4d5e6f7a8b9c0d1/digital-formats/MP3_320KBPS/old-uuid-2026-03-23.mp3"
}
```

---

## Analytics Endpoint (User Story 5)

**Route**: `/api/releases/[releaseId]/download-analytics`  
**Method**: `GET`  
**Purpose**: Retrieve download analytics for a specific release (admin-only).

### Query Parameters

| Parameter   | Type   | Required | Description                      | Example      |
| ----------- | ------ | -------- | -------------------------------- | ------------ |
| `startDate` | string | No       | ISO8601 start date for filtering | `2026-03-01` |
| `endDate`   | string | No       | ISO8601 end date for filtering   | `2026-03-31` |

### Authorization

- User must have admin role (enforced via `requireRole('ADMIN')` middleware).

### Success Response (200 OK)

```json
{
  "success": true,
  "releaseId": "65f8a3b2c4d5e6f7a8b9c0d1",
  "totalDownloads": 487,
  "uniqueUsers": 123,
  "formatBreakdown": [
    { "formatType": "MP3_320KBPS", "count": 245 },
    { "formatType": "FLAC", "count": 180 },
    { "formatType": "WAV", "count": 42 },
    { "formatType": "AAC", "count": 20 }
  ],
  "periodStart": "2026-03-01T00:00:00Z",
  "periodEnd": "2026-03-31T23:59:59Z"
}
```

**Fields**:

- `totalDownloads` (number): Total number of successful download events.
- `uniqueUsers` (number): Count of distinct `userId` values.
- `formatBreakdown` (array): Download count per format type.
- `periodStart`/`periodEnd` (string): ISO8601 date range used for filtering (if provided).

### Error Responses

Same as download endpoint (`401 Unauthorized`, `403 Forbidden` if not admin, `404 Not Found` if release doesn't exist, `500 Internal Server Error`).

---

## Rate Limiting

All endpoints include rate limiting to prevent abuse:

- **Download Authorization**: 100 requests per minute per user (Upstash Redis rate limiter).
- **Upload/Delete Actions**: 20 requests per minute per admin user.
- **Analytics Endpoint**: 10 requests per minute per admin user.

Rate limit exceeded response (429 Too Many Requests):

```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again in 60 seconds.",
  "retryAfter": 60
}
```

---

## Error Code Reference

| Code                  | HTTP Status | Description                                               |
| --------------------- | ----------- | --------------------------------------------------------- |
| `UNAUTHORIZED`        | 401         | User is not authenticated                                 |
| `FORBIDDEN`           | 403         | User lacks required role (admin)                          |
| `QUOTA_EXCEEDED`      | 403         | Free download quota (5 unique releases) exhausted         |
| `NOT_FOUND`           | 404         | Release or format does not exist                          |
| `DELETED`             | 410         | Format is soft deleted and outside grace period           |
| `VALIDATION_ERROR`    | 400         | Invalid input (file too large, wrong MIME type, etc.)     |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests                                         |
| `INTERNAL_ERROR`      | 500         | Unexpected server error (S3 failure, DB connection, etc.) |

---
