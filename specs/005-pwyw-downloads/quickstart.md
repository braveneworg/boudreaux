# Quickstart: PWYW Downloads

**Feature**: 005-pwyw-downloads
**Date**: 2026-04-01

## Prerequisites

- Node.js 24+, pnpm 10+
- MongoDB running (local or Atlas)
- Stripe CLI installed (`stripe listen`)
- AWS S3 bucket configured with digital format files uploaded
- At least one release with `ReleaseDigitalFormat` records in the DB

## Setup

```bash
# 1. Install dependencies (if not already)
pnpm install

# 2. Start the dev server
pnpm run dev

# 3. Start Stripe webhook forwarding (separate terminal)
stripe listen --forward-to http://localhost:3000/api/stripe/webhook

# 4. Ensure test data exists
# - A published release with suggestedPrice set
# - At least 2 ReleaseDigitalFormat records for that release
# - S3 files uploaded for those formats
pnpm exec prisma studio  # verify data
```

## Testing the Feature

### Manual Test: Post-Purchase Format Selection

1. Open a release page in the browser
2. Click the "download" button to open the DownloadDialog
3. Select "Digital Download" radio option
4. Enter a custom amount (min $0.50) or accept the suggested price
5. Click "Buy & Download for $X.XX"
6. Complete the Stripe test payment (card: `4242 4242 4242 4242`)
7. **Expected**: After purchase confirmation, see a format picker with
   ToggleGroup buttons for each available format (e.g., "FLAC", "MP3
   V0", "WAV")
8. Select desired formats (all selected by default)
9. Click "Download N formats"
10. **Expected**: ZIP file downloads with directories named after each
    format, containing the correct audio files

### Manual Test: Returning Purchaser

1. Close and reopen the download dialog for the same release
2. **Expected**: Dialog opens directly to the format selection step
3. Download count should show "1/5 downloads used"

### Manual Test: Guest Returning Purchaser

1. Sign out
2. Open the download dialog
3. Select "Digital Download" and enter an amount
4. Enter the email used for the previous purchase
5. **Expected**: "Welcome Back!" message with the format picker
   (not the legacy download link)

## Running Tests

```bash
# Run all tests
pnpm run test:run

# Run tests for modified files
pnpm run test -- download-dialog
pnpm run test -- purchase-success
pnpm run test -- send-purchase-confirmation

# Coverage check
pnpm run test:coverage
```

## Key Files

| File                                                 | Role                                 |
| ---------------------------------------------------- | ------------------------------------ |
| `src/app/components/download-dialog.tsx`             | Dialog step flow (modified)          |
| `src/app/components/purchase-success-step.tsx`       | Post-purchase UI (modified)          |
| `src/app/components/format-bundle-download.tsx`      | Format picker (reused)               |
| `src/app/api/releases/[id]/download/bundle/route.ts` | ZIP streaming (existing)             |
| `src/app/api/releases/[id]/download/route.ts`        | Legacy route (deprecated → redirect) |
| `src/lib/email/send-purchase-confirmation.ts`        | Email template (modified)            |
