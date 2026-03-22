# Data Model: Stripe Pay-What-You-Want Purchase

**Feature**: `003-stripe-pwyw-purchase`
**Branch**: `003-stripe-pwyw-purchase`
**Date**: 2026-03-21

---

## Schema Changes Overview

| Change                               | Type   | Model     |
| ------------------------------------ | ------ | --------- |
| Add `suggestedPrice` field           | MODIFY | `Release` |
| Add `releasePurchases` back-relation | MODIFY | `Release` |
| Add `releasePurchases` back-relation | MODIFY | `User`    |
| Add `releaseDownloads` back-relation | MODIFY | `User`    |
| Add `ReleasePurchase` model          | NEW    | —         |
| Add `ReleaseDownload` model          | NEW    | —         |

---

## Modified Model: `Release`

Add the following fields to the existing `Release` model in `prisma/schema.prisma`:

```prisma
// NEW fields — add after existing fields
suggestedPrice   Int?             // Suggested purchase price in cents (USD); null = no suggestion
releasePurchases ReleasePurchase[] // All purchases of this release
```

**Notes**:

- `suggestedPrice` is nullable. A `null` value means there is no suggested price; the PWYW
  input in the dialog shows an empty placeholder.
- Monetary amounts are stored as integers in cents (consistent with Stripe and existing
  subscriber tier amounts).

---

## Modified Model: `User`

Add the following back-relations to the existing `User` model:

```prisma
// NEW back-relations — add after existing relations
releasePurchases ReleasePurchase[]
releaseDownloads ReleaseDownload[]
```

---

## New Model: `ReleasePurchase`

Records a confirmed, paid purchase of a release by a user. One record per user-release pair
(enforced by `@@unique`).

```prisma
model ReleasePurchase {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @db.ObjectId
  user                  User     @relation(fields: [userId], references: [id])
  releaseId             String   @db.ObjectId
  release               Release  @relation(fields: [releaseId], references: [id])
  amountPaid            Int      // Amount charged in cents (USD)
  currency              String   @default("usd")
  stripePaymentIntentId String   @unique // payment_intent.id — idempotency key for webhook
  stripeSessionId       String?  // checkout.session.id — for reference/reconciliation
  confirmationEmailSentAt DateTime? // Null until email is dispatched; prevents duplicate sends
  purchasedAt           DateTime @default(now())
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([userId, releaseId])   // One purchase per user per release
  @@index([userId])
  @@index([releaseId])
  @@index([stripePaymentIntentId])
}
```

### Field Details

| Field                     | Type                  | Description                                                                                         |
| ------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `userId`                  | `String @db.ObjectId` | Reference to the purchasing `User`                                                                  |
| `releaseId`               | `String @db.ObjectId` | Reference to the purchased `Release`                                                                |
| `amountPaid`              | `Int`                 | Final amount charged, in cents (USD)                                                                |
| `currency`                | `String`              | Currency code; defaults to `"usd"`                                                                  |
| `stripePaymentIntentId`   | `String @unique`      | Stripe `payment_intent.id`; used as webhook idempotency key                                         |
| `stripeSessionId`         | `String?`             | Stripe `checkout.session.id`; nullable, stored for reconciliation                                   |
| `confirmationEmailSentAt` | `DateTime?`           | Set atomically when the confirmation email is first sent; prevents duplicate sends on webhook retry |
| `purchasedAt`             | `DateTime`            | When the payment was confirmed by the Stripe webhook                                                |

### Constraints

- `@@unique([userId, releaseId])`: prevents a user from purchasing the same release twice
- `stripePaymentIntentId @unique`: enables O(log n) idempotency check in the webhook handler
- `confirmationEmailSentAt` null-check pattern (same as `User.confirmationEmailSentAt`) for
  atomic idempotent email dispatch

---

## New Model: `ReleaseDownload`

Tracks the cumulative download count per user per release. One document per user-release pair,
maintained via upsert.

```prisma
model ReleaseDownload {
  id               String    @id @default(auto()) @map("_id") @db.ObjectId
  userId           String    @db.ObjectId
  user             User      @relation(fields: [userId], references: [id])
  releaseId        String    @db.ObjectId
  release          Release   @relation(fields: [releaseId], references: [id])
  downloadCount    Int       @default(0) // Running total; capped at MAX_DOWNLOAD_COUNT (5)
  lastDownloadedAt DateTime? // Timestamp of the most recent download
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@unique([userId, releaseId])
  @@index([userId])
  @@index([releaseId])
}
```

### Field Details

| Field              | Type                  | Description                                                  |
| ------------------ | --------------------- | ------------------------------------------------------------ |
| `userId`           | `String @db.ObjectId` | Reference to the `User`                                      |
| `releaseId`        | `String @db.ObjectId` | Reference to the `Release`                                   |
| `downloadCount`    | `Int`                 | Total number of downloads; enforced ≤ 5 at the service layer |
| `lastDownloadedAt` | `DateTime?`           | Timestamp of the most recent successful download             |

### Constraints

- `@@unique([userId, releaseId])`: one tracking record per user-release pair
- Count enforcement: the `PurchaseService.getDownloadAccess` method checks
  `downloadCount < MAX_DOWNLOAD_COUNT` before allowing a download and before incrementing

---

## Constants

The download cap is defined as a named constant to avoid magic numbers:

```typescript
// src/lib/constants.ts — add to existing constants
export const MAX_RELEASE_DOWNLOAD_COUNT = 5;
```

---

## Entity Relationship Summary

```text
User ──────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │  1:N                                                             1:N │
  ▼                                                                     ▼
ReleasePurchase ──────────── N:1 ──────────── Release ─── N:1 ────── ReleaseDownload
  (stripePaymentIntentId @unique)             (suggestedPrice Int?)
  (@@unique userId+releaseId)                 (releasePurchases [])    (@@unique userId+releaseId)
                                              (downloadUrls String[])
```

---

## State Transitions: Download Button

```text
Release page loads
       │
       ▼
[ Check auth + purchase status ]
       │
   ┌───┴──────────────────────────────────────┐
   │                                          │
Not logged in or no purchase             Has purchase
   │                                          │
   ▼                                          ▼
[ "Download" → opens payment dialog ]   [ Check ReleaseDownload.downloadCount ]
                                               │
                                    ┌──────────┴──────────┐
                                    │                      │
                               count < 5              count >= 5
                                    │                      │
                                    ▼                      ▼
                           [ Download starts ]   [ Button disabled + support msg ]
```

---

## Migration Notes

- **No destructive migrations**: all changes are additive (new models, new nullable field).
- **Prisma push**: `npx prisma db push` creates the new collections and indexes in MongoDB.
- **Existing Release documents**: `suggestedPrice` will be `null` for all existing records —
  this is valid and handled by the UI (no pre-fill = empty PWYW input).
- **Index creation**: MongoDB creates the `@@unique` indexes automatically on `db push`.
  The `stripePaymentIntentId @unique` index is non-sparse (always set on insert), so no
  sparse index workaround (unlike `User.stripeCustomerId`) is needed.
