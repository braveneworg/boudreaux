# Research: Release Digital Formats Management

**Feature**: `004-release-digital-formats`
**Branch**: `004-release-digital-formats`
**Date**: 2026-03-23

---

## R-001: S3 Presigned URL Pattern — Upload and Download

**Decision**: Reuse the existing S3 presigned URL pattern from tour/release image uploads for audio file uploads, with extended expiration times for downloads (24 hours vs 15 minutes for uploads). Generate presigned upload URLs via Server Action, presigned download URLs via API route after authorization check.

**Findings**:

- The existing `ImageUploadService.generatePresignedUploadUrl()` creates PutObjectCommand with ContentType, CacheControl, and Metadata, then calls `getSignedUrl(s3Client, putCommand, { expiresIn: 900 })` (15 minutes).
- For audio uploads: same pattern with longer Content-Type values (`audio/mpeg`, `audio/flac`, `audio/wav`, `audio/aac`) and S3 key structure `releases/${releaseId}/digital-formats/${formatType}/${uuid}.${ext}`.
- For audio downloads: generate GetObjectCommand with `getSignedUrl(s3Client, getCommand, { expiresIn: 86400 })` (24 hours) in the download authorization API route after purchase/quota validation.
- Upload flow: Admin selects file → Server Action generates presigned PUT URL → client uploads directly to S3 → Server Action stores metadata in ReleaseDigitalFormat model.
- Download flow: User requests download → API route checks auth → validates purchase OR quota → generates presigned GET URL → logs DownloadEvent → returns signed URL → client downloads directly from S3.
- The presigned GET URL is ephemeral (not stored in DB), generated fresh on each request to maintain security and prevent URL sharing.

**Rationale**: Reusing the established S3 presigned URL infrastructure keeps the codebase consistent, reduces new AWS SDK learning curve, and leverages the proven upload pattern already in production for release images and tour images. Direct S3 upload/download reduces server bandwidth and latency.

**Alternatives considered**:

- Store permanent download URLs in DB: rejected — enables unauthorized sharing, violates "fresh URL per request" requirement from clarifications, increases security risk.
- Proxy downloads through Node.js server: rejected — adds server bandwidth cost, increases latency, reduces scalability for large audio files.
- CloudFront signed URLs: rejected — adds complexity, presigned S3 URLs with 24hr expiration are sufficient for the freemium/purchase model.

---

## R-002: Unique Release Tracking — Array vs. Set

**Decision**: Use `String[]` (array) in MongoDB Prisma schema with application-level Set semantics via JavaScript Set object when checking uniqueness. MongoDB does not have a native Set type, but Prisma's `String[]` combined with `$addToSet` update operator provides atomic uniqueness guarantees.

**Findings**:

- Prisma schema: `uniqueReleaseIds String[]` on UserDownloadQuota model.
- Atomic insert: Use Prisma's `upsert` with MongoDB-specific `$addToSet` operator to atomically add a release ID only if not already present:
  ```typescript
  await prisma.userDownloadQuota.upsert({
    where: { userId },
    update: { uniqueReleaseIds: { push: releaseId } }, // Will be intercepted for $addToSet
    create: { userId, uniqueReleaseIds: [releaseId] },
  });
  ```
  Note: Prisma's MongoDB connector translates array push operations with unique constraints to `$addToSet`.
- In-memory check: Load `UserDownloadQuota.uniqueReleaseIds` once, convert to JavaScript Set, use `set.has(releaseId)` for O(1) lookup before incrementing count.
- Enforcement: Before allowing a free download, check `uniqueReleaseIds.length < 5`. If at limit and release ID not in Set → block download.

**Rationale**: MongoDB's `$addToSet` provides atomic uniqueness at the database level, preventing race conditions when concurrent downloads attempt to claim the same release. JavaScript Set provides efficient O(1) lookup for quota enforcement checks. This is the MongoDB-idiomatic pattern for unique collections.

**Alternatives considered**:

- Native Set type: rejected — MongoDB/Prisma do not support Set as a schema type.
- Separate ReleaseDownload records with unique constraint: rejected — requires join queries to count unique releases, less performant than array field for small collections (max 5 items).
- Redis Set: rejected — adds infrastructure dependency, overkill for simple 5-item quota tracking.

---

## R-003: Soft Delete Implementation with Grace Period

**Decision**: Add nullable `deletedAt DateTime?` field to ReleaseDigitalFormat model. Soft delete logic: set `deletedAt` timestamp on delete action, filter queries with `where: { OR: [{ deletedAt: null }, { AND: [{ deletedAt: { gt: gracePeriodCutoff } }, { purchasedByIds: { has: userId } }] }] }` to allow purchaser access during 90-day grace period.

**Findings**:

- Soft delete pattern: Instead of `prisma.releaseDigitalFormat.delete()`, use `prisma.releaseDigitalFormat.update({ data: { deletedAt: new Date() } })`.
- Grace period calculation: `const gracePeriodCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);` (90 days in milliseconds).
- Download authorization logic:
  ```typescript
  const format = await prisma.releaseDigitalFormat.findFirst({
    where: {
      releaseId,
      formatType,
      OR: [
        { deletedAt: null }, // Not deleted
        {
          AND: [
            { deletedAt: { gt: gracePeriodCutoff } }, // Deleted within grace period
            // Check if user purchased this release (via ReleasePurchase join)
          ],
        },
      ],
    },
  });
  ```
- Separately track purchasers: Join with ReleasePurchase model to check if `userId` has purchased the release.
- Hard delete: Scheduled job (e.g., cron task) runs nightly to permanently delete formats where `deletedAt < gracePeriodCutoff`.

**Rationale**: Soft delete protects customer value by allowing purchased releases to remain accessible during a grace period, providing a safety net for accidental deletions while still blocking new downloads immediately. This aligns with best practices for SaaS applications where user-purchased content has ongoing value.

**Alternatives considered**:

- Hard delete immediately: rejected — violates customer value protection, no recovery from accidental deletion.
- Permanent soft delete (never hard delete): rejected — accumulates storage costs indefinitely for unused files.
- Shorter grace period (30 days): rejected — spec clarification specified 90-day grace period to align with typical refund windows.

---

## R-004: Format-Specific File Validation

**Decision**: Define Zod schemas with format-specific file size limits and MIME type allowlists. Use discriminated union pattern to validate based on selected format type. Enforce validation in Server Action before generating presigned upload URL.

**Findings**:

- File size limits (from clarifications):
  - MP3/AAC: 100MB (100 _ 1024 _ 1024 bytes)
  - FLAC: 250MB (250 _ 1024 _ 1024 bytes)
  - WAV: 500MB (500 _ 1024 _ 1024 bytes)
- MIME type allowlist:
  - MP3: `audio/mpeg`, `audio/mp3`
  - FLAC: `audio/flac`, `audio/x-flac`
  - WAV: `audio/wav`, `audio/x-wav`, `audio/wave`
  - AAC: `audio/aac`, `audio/x-aac`
- Zod validation schema structure:
  ```typescript
  const DigitalFormatUploadSchema = z.discriminatedUnion('formatType', [
    z.object({
      formatType: z.literal('MP3_320KBPS'),
      mimeType: z.enum(['audio/mpeg', 'audio/mp3']),
      fileSize: z.number().max(100 * 1024 * 1024, 'MP3 files must be under 100MB'),
    }),
    z.object({
      formatType: z.literal('FLAC'),
      mimeType: z.enum(['audio/flac', 'audio/x-flac']),
      fileSize: z.number().max(250 * 1024 * 1024, 'FLAC files must be under 250MB'),
    }),
    // ... remaining formats
  ]);
  ```
- Validation timing: Client-side pre-check (File API size), server-side definitive validation in Server Action before S3 presigned URL generation.

**Rationale**: Format-specific limits prevent abuse (e.g., uploading massive uncompressed WAV files for compressed MP3 format) while accommodating legitimate use cases (album-length content at various bitrates). Zod discriminated union provides type-safe validation with clear error messages per format. MIME type allowlist prevents file type confusion attacks.

**Alternatives considered**:

- Single universal size limit (500MB for all): rejected — allows excessive storage for compressed formats, defeats purpose of format-specific constraints.
- File extension validation only: rejected — extensions are easily spoofed, MIME type from File object is more reliable.
- Server-side file content inspection (magic bytes): rejected — adds processing overhead for large files, MIME type + size validation is sufficient for trusted admin users.

---

## R-005: Accordion UI Component Pattern with Upload Handling

**Decision**: Use shadcn/ui Accordion component with custom upload targets per format item. Each AccordionItem contains: format label, checkmark indicator (visible when uploaded), file input (hidden, triggered by button click), upload progress indicator, error message display area. Manage upload state with React useState for per-format loading/error/success states.

**Findings**:

- Accordion structure:
  ```tsx
  <Accordion type="multiple">
    {' '}
    {/* Allow multiple formats expanded */}
    {DIGITAL_FORMATS.map((format) => (
      <AccordionItem key={format.value} value={format.value}>
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <span>{format.label}</span>
            {uploadedFormats.has(format.value) && <CheckCircle className="h-5 w-5 text-gray-500" />}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <UploadTarget formatType={format.value} onUploadSuccess={handleUploadSuccess} />
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
  ```
- Upload target component: Hidden file input + styled button, on file selection → validate → call upload Server Action → show progress → on success → update checkmark state.
- State management:
  ```typescript
  const [uploadStates, setUploadStates] = useState<Map<FormatType, UploadState>>(new Map());
  const [uploadedFormats, setUploadedFormats] = useState<Set<FormatType>>(new Set(initialUploaded));
  ```
- Server Action integration: `uploadDigitalFormatAction(releaseId, formatType, fileInfo)` returns presigned URL → client uploads to S3 → on 200 response → mark as uploaded.
- Accessibility: Accordion has built-in ARIA (accordion/region roles), file input has associated label, upload button has loading state with `aria-busy`, error messages in `role="alert"` live region.

**Rationale**: shadcn/ui Accordion component provides accessible, keyboard-navigable UI out of the box, reducing custom ARIA implementation. "Multiple" type allows admins to expand and manage multiple formats simultaneously during batch uploads. Checkmark indicator provides clear visual feedback for uploaded formats (SC-001, FR-004). State management at component level keeps upload logic encapsulated and testable.

**Alternatives considered**:

- Tabs UI: rejected — requires switching between formats, less efficient for batch uploads, no visual summary of uploaded formats.
- List with expand/collapse per item: rejected — reinvents Accordion component, increases ARIA implementation burden.
- Modal dialog per format upload: rejected — breaks spatial context, harder to track multiple uploads, poor UX for batch operations.

---

## R-006: Download Authorization API Route Pattern

**Decision**: Implement `/api/releases/[releaseId]/download/[formatType]` as a GET route that checks authentication, validates purchase or free quota, generates S3 presigned URL, logs DownloadEvent, and returns signed URL in JSON response body (not HTTP redirect). Client-side JavaScript handles the download via anchor tag with `href` set to signed URL.

**Findings**:

- Route handler flow:
  1. Extract `releaseId` and `formatType` from dynamic route params
  2. Call `getServerSession()` or extract JWT token → 401 if unauthenticated
  3. Check `ReleasePurchase.findFirst({ userId, releaseId })` → if found, allow download
  4. If no purchase: check `UserDownloadQuota` → if `uniqueReleaseIds.length < 5`, allow download and atomically add `releaseId` to set
  5. If purchase or quota allows: fetch `ReleaseDigitalFormat` with soft delete filter
  6. Generate S3 presigned GET URL with 24hr expiration: `getSignedUrl(s3Client, new GetObjectCommand({ Bucket, Key: format.s3Key }), { expiresIn: 86400 })`
  7. Log `DownloadEvent` record (userId, releaseId, formatType, timestamp, success)
  8. Return JSON: `{ success: true, downloadUrl: signedUrl, expiresAt: isoTimestamp }`
- Error responses: 401 Unauthorized (not logged in), 403 Forbidden (quota exceeded), 404 Not Found (format doesn't exist or deleted), 410 Gone (soft deleted outside grace period).
- Client-side handling: Fetch API call → extract `downloadUrl` → create anchor tag → programmatically click to trigger browser download.

**Rationale**: API route provides centralized authorization logic with clear error responses. JSON response (not redirect) allows client-side error handling and progress UI. Atomic quota increment via MongoDB `$addToSet` prevents race conditions. DownloadEvent logging before URL return ensures analytics capture even if download fails client-side. 24hr URL expiration balances security (can't share URLs indefinitely) with UX (allows retries for network issues).

**Alternatives considered**:

- HTTP 302 redirect to signed URL: rejected — harder to handle errors client-side, no opportunity to show loading state, can't update UI before redirect.
- Server-side streaming (proxy download): rejected — adds server bandwidth cost, reduces scalability, S3 presigned URLs are designed for this use case.
- Permanent download URLs in DB: rejected — violates security requirement for ephemeral URLs (clarifications).

---
