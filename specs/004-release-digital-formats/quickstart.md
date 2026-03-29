# Quickstart Guide: Release Digital Formats Management

**Feature**: `004-release-digital-formats`
**Branch**: `004-release-digital-formats`
**Date**: 2026-03-23

---

## Overview

This guide provides step-by-step instructions for setting up, developing, and testing the Release Digital Formats Management feature. It covers environment configuration, database schema updates, development workflow, and testing procedures.

---

## Prerequisites

Before starting, ensure you have:

- **Node.js** 18+ and **pnpm** installed
- **MongoDB** running locally or connection string for MongoDB Atlas
- **AWS account** with S3 bucket configured
- **AWS credentials** (Access Key ID and Secret Access Key) with S3 read/write permissions
- **Docker** (optional, for running MongoDB locally)
- **Git** for branch management

---

## Step 1: Environment Configuration

### 1.1 AWS S3 Setup

Ensure you have an S3 bucket configured for storing digital format files (can reuse existing bucket from release images):

- **Bucket Name**: e.g., `boudreaux-releases-prod` or `boudreaux-releases-dev`
- **Region**: e.g., `us-east-1`
- **CORS Configuration**: Allow `PUT`, `GET` methods from your Next.js app domain
- **IAM Policy**: Ensure AWS credentials have `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` permissions

### 1.2 Environment Variables

Add the following environment variables to your `.env.local` file (or `.env` for production):

```bash
# AWS S3 Configuration (reuse existing variables if already set)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME=boudreaux-releases-dev

# MongoDB Connection (existing)
DATABASE_URL=mongodb://localhost:27017/boudreaux

# Next.js Auth (existing)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

**Notes**:

- Reuse existing AWS credentials if you already have release image upload configured.
- For local development, use a separate S3 bucket prefix (e.g., `dev/`) to avoid pollution.

---

## Step 2: Database Schema Updates

### 2.1 Update Prisma Schema

The Prisma schema changes are defined in [data-model.md](./data-model.md). Key additions:

- `ReleaseDigitalFormat` model (stores S3 keys, metadata, soft delete timestamps)
- `UserDownloadQuota` model (tracks freemium 5-download limit per user)
- `DownloadEvent` model (logs all download attempts for analytics)
- `Release` model modifications (add `suggestedPrice` Decimal field, `digitalFormats` back-relation)

**File**: `prisma/schema.prisma`

### 2.2 Apply Schema Changes

Run the following commands to update the database:

```bash
# Generate Prisma Client with updated types
pnpm exec prisma generate

# Push schema changes to MongoDB (dev environment)
pnpm exec prisma db push

# Verify schema in Prisma Studio
pnpm exec prisma studio
```

**Expected Output**:

- Prisma Client regenerated with `ReleaseDigitalFormat`, `UserDownloadQuota`, `DownloadEvent` types
- MongoDB collections created: `ReleaseDigitalFormat`, `UserDownloadQuota`, `DownloadEvent`
- Indexes created on `releaseId`, `userId`, `deletedAt`, `downloadedAt`

### 2.3 Seed Test Data (Optional)

Modify `prisma/seed.ts` to add sample digital formats for development:

```typescript
// Add sample digital formats for an existing release
const sampleRelease = await prisma.release.findFirst();

if (sampleRelease) {
  await prisma.releaseDigitalFormat.createMany({
    data: [
      {
        releaseId: sampleRelease.id,
        formatType: 'MP3_320KBPS',
        s3Key: `releases/${sampleRelease.id}/digital-formats/MP3_320KBPS/sample.mp3`,
        fileName: 'Sample Album - MP3 320kbps.mp3',
        fileSize: 45000000, // 45MB
        mimeType: 'audio/mpeg',
        uploadedAt: new Date(),
      },
      {
        releaseId: sampleRelease.id,
        formatType: 'FLAC',
        s3Key: `releases/${sampleRelease.id}/digital-formats/FLAC/sample.flac`,
        fileName: 'Sample Album - FLAC.flac',
        fileSize: 180000000, // 180MB
        mimeType: 'audio/flac',
        uploadedAt: new Date(),
      },
    ],
  });
  console.log('✅ Seeded sample digital formats');
}
```

Run seed script:

```bash
pnpm exec prisma db seed
```

---

## Step 3: Development Workflow

### 3.1 Start Development Server

```bash
pnpm run dev
```

Server will start at `http://localhost:3000`.

### 3.2 Admin Panel Access

1. Navigate to `http://localhost:3000/admin/releases`
2. Select a release to edit
3. Scroll to "Digital Formats" section (new accordion UI)
4. Upload digital format files (MP3, FLAC, WAV, AAC)

### 3.3 Testing Upload Flow

**Manual Test Steps**:

1. Click "Add Digital Format" or expand an accordion item (e.g., "MP3 320kbps")
2. Select a valid audio file (ensure file size is within limits: MP3/AAC ≤100MB, FLAC ≤250MB, WAV ≤500MB)
3. Click "Upload" button
4. Verify:
   - Upload progress indicator appears
   - On success: gray checkmark icon appears next to format type
   - On error: error message displays with specific reason (e.g., "File too large for MP3_320KBPS format (max 100MB)")
5. Refresh the page and verify checkmark persists (database record created)

**Expected Behavior**:

- Upload completes in <10 seconds for files up to 100MB (SC-001)
- Checkmark indicator visible after successful upload (FR-004)
- File metadata stored in `ReleaseDigitalFormat` table

### 3.4 Testing Download Flow

**Authenticated User (Purchased Release)**:

1. Create a `ReleasePurchase` record for a test user and release (via Prisma Studio or seed script)
2. Log in as that user
3. Navigate to the release page
4. Click "Download MP3" button
5. Verify:
   - Download authorization succeeds (200 OK response)
   - Presigned URL generated (inspect network tab)
   - File downloads successfully
   - `DownloadEvent` record created with `success: true`

**Freemium User (No Purchase)**:

1. Create a new user account (or use existing non-purchaser)
2. Navigate to 5 different releases
3. Download a format from each (without purchasing)
4. Verify:
   - First 5 downloads succeed
   - `UserDownloadQuota.uniqueReleaseIds` array grows to length 5
   - 6th download attempt blocked with "QUOTA_EXCEEDED" error
   - Error message displays "Free download limit reached. Please purchase or contact support."

**Soft Delete Grace Period**:

1. Soft delete a digital format (set `deletedAt` timestamp via Prisma Studio or delete action)
2. As a user who purchased the release: download the format within 90 days of `deletedAt`
3. Verify download succeeds (grace period logic allows access)
4. As a non-purchaser: attempt download after soft delete
5. Verify download blocked with "DELETED" error (410 Gone)

---

## Step 4: Running Tests

### 4.1 Unit Tests

Run Vitest unit tests for repositories, services, and validation schemas:

```bash
# Run all unit tests in watch mode
pnpm run test

# Run tests once (CI mode)
pnpm run test:run

# Run tests with coverage report
pnpm run test:coverage
```

**Key Test Files**:

- `src/lib/repositories/release-digital-format-repository.spec.ts` — CRUD operations, soft delete queries
- `src/lib/repositories/user-download-quota-repository.spec.ts` — Atomic unique-release tracking
- `src/lib/services/upload-service.spec.ts` — File validation, presigned URL generation
- `src/lib/services/download-authorization-service.spec.ts` — Purchase/quota checks, grace period logic
- `src/lib/validation/digital-format-schema.spec.ts` — Format-specific size/MIME validation

**Coverage Target**: 90-95% for all testable code (repositories, services, validation, Server Actions).

### 4.2 Component Tests

Run component tests for the accordion UI:

```bash
pnpm run test src/app/components/forms/digital-formats-accordion.spec.tsx
```

**Test Cases**:

- Accordion renders with all format items
- Checkmark icon appears when format is uploaded
- Upload button triggers file input click
- Upload progress indicator appears during upload
- Error message displays on validation failure
- Keyboard navigation works (Tab, Space, Enter)

### 4.3 E2E Tests (Playwright)

Run end-to-end tests for the full upload → download flow:

```bash
# Start E2E test server (separate database)
pnpm run test:e2e

# Run specific E2E test file
pnpm exec playwright test e2e/tests/admin-upload-digital-formats.spec.ts
```

**E2E Test Scenarios**:

1. **Admin Upload Flow** (`admin-upload-digital-formats.spec.ts`):
   - Admin logs in → navigates to release edit page
   - Expands "MP3 320kbps" accordion item
   - Selects and uploads valid MP3 file
   - Verifies checkmark indicator appears within 10 seconds
   - Refreshes page and verifies checkmark persists

2. **User Download Purchased Release** (`user-download-purchased.spec.ts`):
   - User logs in with purchased release
   - Navigates to release page
   - Clicks "Download MP3" button
   - Verifies file downloads successfully (checks download event in DB)

3. **Freemium Quota Enforcement** (`freemium-quota-enforcement.spec.ts`):
   - New user logs in
   - Downloads 5 different releases (no purchase)
   - Attempts 6th download
   - Verifies download blocked with quota error message
   - Purchases a release → verifies download succeeds

**Expected E2E Runtime**: <5 minutes for full suite.

---

## Step 5: Linting and Formatting

Run code quality checks before committing:

```bash
# Run ESLint and auto-fix issues
pnpm run lint

# Format code with Prettier
pnpm run format
```

**Ensure**:

- No ESLint errors or warnings
- All code follows project style guide (TypeScript strict mode, named exports, absolute imports)

---

## Step 6: Manual Verification Checklist

Before marking the feature as complete, verify the following:

### Admin Panel

- [ ] Accordion UI renders with all digital format types (MP3, FLAC, WAV, AAC)
- [ ] File upload works for each format type
- [ ] Upload progress indicator appears and completes within 10 seconds (SC-001)
- [ ] Checkmark icon appears after successful upload
- [ ] Error messages display for invalid file types or oversized files
- [ ] File replacement works (upload new file for existing format, old file archived)
- [ ] Soft delete works (format removed from UI, existing purchasers retain access)

### User Download

- [ ] Purchased releases show download buttons
- [ ] Download buttons are disabled for non-purchased releases when quota exceeded
- [ ] Download authorization API returns presigned URL (24hr expiration)
- [ ] File downloads successfully in browser
- [ ] Download completes in <30 seconds for 100MB files (SC-002)

### Freemium Quota

- [ ] First 5 unique release downloads succeed without purchase
- [ ] 6th unique release download blocked with clear error message
- [ ] Repeat downloads of same release don't consume additional quota
- [ ] Quota persists across sessions (stored in DB)

### Analytics (if implemented)

- [ ] Admin can view download counts per format
- [ ] Analytics display accurate data within 1 minute of download (SC-007)

### Accessibility

- [ ] Accordion is keyboard-navigable (Tab, Space, Enter)
- [ ] Screen reader announces upload success/failure
- [ ] Error messages have `role="alert"`
- [ ] All interactive elements have proper ARIA labels

---

## Step 7: Deployment Preparation

### 7.1 Environment Variables (Production)

Ensure production `.env` file has:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<prod_access_key>
AWS_SECRET_ACCESS_KEY=<prod_secret_key>
AWS_S3_BUCKET_NAME=boudreaux-releases-prod
DATABASE_URL=<prod_mongodb_connection_string>
```

### 7.2 Database Migration

For production deployment, run Prisma migrations instead of `db push`:

```bash
# Generate migration file
pnpm exec prisma migrate dev --name add-digital-formats

# Apply migration to production
pnpm exec prisma migrate deploy
```

### 7.3 Build Verification

Test production build locally:

```bash
# Build Next.js app
pnpm run build

# Start production server
pnpm run start
```

Verify:

- No build errors
- Upload and download flows work in production mode
- Static assets load correctly (checkmark icons, etc.)

---

## Troubleshooting

### Issue: Presigned URL Upload Fails (CORS Error)

**Solution**: Ensure S3 bucket CORS configuration allows `PUT` method and your app domain:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

### Issue: Download Authorization Returns 403 (Quota Exceeded) for Purchased Release

**Solution**: Verify `ReleasePurchase` record exists for the user and release:

```bash
pnpm exec prisma studio
# Navigate to ReleasePurchase model
# Check userId and releaseId match
```

### Issue: Checkmark Icon Doesn't Appear After Upload

**Solution**: Check browser console for errors. Verify:

- `ReleaseDigitalFormat` record created in DB
- Client state update logic in `handleUploadSuccess()` callback
- Accordion component re-renders after state update

### Issue: E2E Tests Fail Due to File Upload Timeout

**Solution**: Increase Playwright timeout for upload test:

```typescript
test('admin uploads digital format', async ({ page }) => {
  // ... test setup
  await page.locator('button:has-text("Upload")').click();
  await expect(page.locator('[data-testid="checkmark-mp3"]')).toBeVisible({ timeout: 15000 });
});
```

---

## Next Steps

After completing this quickstart:

1. Review [data-model.md](./data-model.md) for detailed schema design
2. Review [contracts/api.md](./contracts/api.md) for API specifications
3. Review [research.md](./research.md) for technical decisions and rationale
4. Proceed to implementation tasks (see `tasks.md` when available)

---

## Support

For questions or issues with this feature:

- Check [spec.md](./spec.md) for full requirements
- Review [plan.md](./plan.md) for architecture overview
- Consult [Constitution](.specify/memory/constitution.md) for coding standards
- Open an issue in the project repository

---
