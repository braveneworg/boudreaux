# Data Model: PWYW Downloads

**Feature**: 005-pwyw-downloads
**Date**: 2026-04-01

## Overview

This feature requires **no new Prisma models**. All data entities already
exist from features 003 (Stripe PWYW Purchase) and 004 (Release Digital
Formats).

## Existing Models Used

### ReleasePurchase (from 003)

```prisma
model ReleasePurchase {
  id                      String    @id @default(auto()) @map("_id") @db.ObjectId
  userId                  String    @db.ObjectId
  releaseId               String    @db.ObjectId
  stripePaymentIntentId   String    @unique
  stripeSessionId         String?
  amountCents             Int
  currency                String    @default("usd")
  confirmationEmailSentAt DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  user                    User      @relation(fields: [userId], references: [id])
  release                 Release   @relation(fields: [releaseId], references: [id])

  @@unique([userId, releaseId])
}
```

**Role in this feature**: Verified before allowing format selection.
Bundle route checks `PurchaseRepository.findByUserAndRelease()`.

### ReleaseDownload (from 003)

```prisma
model ReleaseDownload {
  id            String @id @default(auto()) @map("_id") @db.ObjectId
  userId        String @db.ObjectId
  releaseId     String @db.ObjectId
  downloadCount Int    @default(0)

  @@unique([userId, releaseId])
}
```

**Role in this feature**: Tracks per-release download count. Bundle
download increments by 1.
Cap: `MAX_RELEASE_DOWNLOAD_COUNT = 5`.

### ReleaseDigitalFormat (from 004)

```prisma
model ReleaseDigitalFormat {
  id         String                    @id @default(auto()) @map("_id") @db.ObjectId
  releaseId  String                    @db.ObjectId
  formatType String
  s3Key      String?
  fileName   String?
  fileSize   Int?
  mimeType   String?
  deletedAt  DateTime?
  createdAt  DateTime                  @default(now())
  updatedAt  DateTime                  @updatedAt
  release    Release                   @relation(fields: [releaseId], references: [id])
  files      ReleaseDigitalFormatFile[]

  @@unique([releaseId, formatType])
}
```

**Role in this feature**: Queried to populate `availableFormats[]` prop.
Bundle route resolves S3 keys from format records.

### DownloadEvent (from 004)

```prisma
model DownloadEvent {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  userId     String   @db.ObjectId
  releaseId  String   @db.ObjectId
  formatType String
  success    Boolean
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())
}
```

**Role in this feature**: Bundle route logs one event per format in the
ZIP. No changes needed.

## State Transitions

```text
DownloadDialog step flow (modified):

[download] → user selects "premium-digital" + amount
    ↓
[email-step] (guest) OR [purchase-checkout] (auth'd)
    ↓
[purchase-checkout] → Stripe payment → poll purchase-status
    ↓
[purchase-success] → NOW SHOWS FormatBundleDownload
    ↓                  (instead of static download link)
User selects formats → GET /api/releases/[id]/download/bundle?formats=...
    ↓
ZIP streamed to browser (1 download counted)
```

## Validation Rules

No new Zod schemas needed. The existing
`bundleDownloadQuerySchema` validates the `formats` query parameter
on the bundle route.
