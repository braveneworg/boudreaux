# API Contracts: Stripe Pay-What-You-Want Purchase

**Feature**: `003-stripe-pwyw-purchase`
**Branch**: `003-stripe-pwyw-purchase`
**Date**: 2026-03-21

---

## Overview

This feature introduces two new API routes and one new Server Action. It also modifies one
existing API route (the Stripe webhook) and one existing Server Action (the download dialog
step context).

---

## New API Routes

### `GET /api/releases/[releaseId]/download`

**Purpose**: Authenticated download gate. Verifies purchase ownership, enforces the 5-download
cap, increments the count, and redirects to the actual download URL.

**Authentication**: Required. Returns `401` if the user is not authenticated.

**Request**

| Parameter   | Location | Type     | Required | Description                     |
| ----------- | -------- | -------- | -------- | ------------------------------- |
| `releaseId` | Path     | `string` | Yes      | MongoDB ObjectId of the release |

**Response — Success (302 Redirect)**

```
HTTP 302 Found
Location: <raw download URL from release.downloadUrls[0]>
```

**Response — Error Cases**

| Status | Body                                                                               | Condition                                      |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `401`  | `{ "error": "unauthenticated" }`                                                   | No valid session                               |
| `403`  | `{ "error": "no_purchase" }`                                                       | User has not purchased this release            |
| `403`  | `{ "error": "download_limit_reached", "downloadCount": 5, "maxDownloadCount": 5 }` | Download count ≥ 5                             |
| `404`  | `{ "error": "release_not_found" }`                                                 | `releaseId` does not match a published release |
| `404`  | `{ "error": "no_download_url" }`                                                   | Release exists but `downloadUrls` is empty     |
| `500`  | `{ "error": "internal_error" }`                                                    | Unexpected server error                        |

**Side Effects**:

- On success: `ReleaseDownload.downloadCount` is incremented by 1;
  `ReleaseDownload.lastDownloadedAt` is set to `now()` via upsert.

**Notes**:

- The redirect URL is the raw `release.downloadUrls[0]` value. Future iterations may support
  a `?format=` query param to select from the array; for now index 0 is always served.
- The download count increment happens server-side before the redirect — partial failures
  (redirect issued but user navigates away) still count against the cap.

---

### `GET /api/releases/[releaseId]/purchase-status`

**Purpose**: Lightweight polling endpoint. Returns whether a given payment intent has been
confirmed and recorded as a `ReleasePurchase` by the webhook. Used by `PurchaseCheckoutStep`
for the hybrid UX (progress indicator → download link reveal).

**Authentication**: Not required (returns only a boolean; no personal data exposed).

**Request**

| Parameter         | Location | Type     | Required | Description                                |
| ----------------- | -------- | -------- | -------- | ------------------------------------------ |
| `releaseId`       | Path     | `string` | Yes      | MongoDB ObjectId of the release            |
| `paymentIntentId` | Query    | `string` | Yes      | Stripe `payment_intent.id` (e.g. `pi_xxx`) |

**Response — Success (200)**

```json
{
  "confirmed": true
}
```

```json
{
  "confirmed": false
}
```

**Response — Error Cases**

| Status | Body                                       | Condition                            |
| ------ | ------------------------------------------ | ------------------------------------ |
| `400`  | `{ "error": "missing_payment_intent_id" }` | `paymentIntentId` query param absent |
| `500`  | `{ "error": "internal_error" }`            | Unexpected server error              |

**Polling Behavior (client-side)**:

- Poll every 2 seconds via Tanstack Query `refetchInterval: 2000`.
- Stop polling when `confirmed: true` is returned.
- After 90 seconds (45 polls) without confirmation, the client treats the session as "delayed"
  and transitions the dialog to a support-contact state.

**Cache headers**: `Cache-Control: no-store` to prevent stale polling results.

---

## Modified API Route

### `POST /api/stripe/webhook`

**Purpose**: Existing Stripe event handler. Extended to process
`checkout.session.completed` events for `mode: 'payment'` (purchase flow), alongside the
existing subscription event handling.

**New event branch — `checkout.session.completed` (payment mode)**:

Triggered when: `session.mode === 'payment'` AND
`session.metadata?.type === 'release_purchase'`

**Expected `session.metadata`**:

```json
{
  "type": "release_purchase",
  "releaseId": "<MongoDB ObjectId>",
  "userId": "<MongoDB ObjectId>"
}
```

**Handler behavior** (`handleReleasePurchaseCompleted`):

1. Extract `payment_intent` from `session.payment_intent`
2. Check `PurchaseRepository.findByPaymentIntentId(paymentIntentId)`:
   - Found → log warning `"Duplicate webhook event for payment intent {id}"`, return 200
3. Write `ReleasePurchase` record via `PurchaseRepository.create(...)`
4. Dispatch purchase confirmation email via `sendPurchaseConfirmationEmail(...)` with
   `confirmationEmailSentAt` atomic guard
5. Return 200

**Security guards** (applied before all event processing, unchanged from existing):

- Stripe webhook signature verification (`stripe-signature` header)
- Stripe IP allowlist check (`x-forwarded-for` first hop)

---

## New Server Action

### `createPurchaseCheckoutSessionAction`

**File**: `src/lib/actions/create-purchase-checkout-session-action.ts`

**Purpose**: Creates a Stripe Checkout Session in `payment` mode with `ui_mode: 'custom'`,
returning a `clientSecret` for the `CheckoutProvider`.

**Directive**: `'use server'`

**Input Schema** (Zod — `purchaseCheckoutSchema`):

```typescript
z.object({
  releaseId: z.string().min(1),
  amountCents: z.number().int().min(50), // Stripe minimum: $0.50 = 50 cents
  userId: z.string().min(1),
  releaseTitle: z.string().min(1), // For Stripe line item display
});
```

**Return Type**:

```typescript
type PurchaseCheckoutSessionResult =
  | { success: true; clientSecret: string; paymentIntentId: string }
  | { success: false; error: string };
```

**Stripe Session Parameters**:

```typescript
stripe.checkout.sessions.create({
  mode: 'payment',
  ui_mode: 'custom',
  line_items: [
    {
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: { name: releaseTitle },
      },
      quantity: 1,
    },
  ],
  payment_intent_data: {
    metadata: {
      type: 'release_purchase',
      releaseId,
      userId,
    },
  },
  return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/releases/${releaseId}?purchase=success`,
});
```

**Error cases**:

- `amountCents < 50`: returns `{ success: false, error: 'amount_below_minimum' }`
- `releaseId` not found or release has no `downloadUrls`: returns `{ success: false, error: 'release_unavailable' }`
- Pre-existing `ReleasePurchase` for this `userId + releaseId`: returns `{ success: false, error: 'already_purchased' }` (prevents double-charge attempt)
- Stripe API error: returns `{ success: false, error: 'stripe_error' }`

---

## Reused Existing Server Action (No Changes)

### `resolveSubscriberAction`

**File**: `src/lib/actions/resolve-subscriber-action.ts`

Used unchanged for the guest purchase flow: looks up or creates a user account by email before
the purchase checkout step begins. Returns `{ success: boolean, status: 'existing' | 'created' }`.

---

## Email Contract

### `sendPurchaseConfirmationEmail`

**File**: `src/lib/email/send-purchase-confirmation.ts`

**Trigger**: Called from the `handleReleasePurchaseCompleted` webhook handler after the
`ReleasePurchase` record is written.

**Idempotency**: Uses an atomic `prisma.releasePurchase.updateMany` with
`confirmationEmailSentAt: null` filter — only the first call sets the timestamp and dispatches
the email (same pattern as `markConfirmationEmailSent` on `User`).

**Input**:

```typescript
interface SendPurchaseConfirmationInput {
  toEmail: string;
  releaseTitle: string;
  releaseId: string;
  amountPaidCents: number;
  purchaseId: string; // ReleasePurchase.id — used for idempotency updateMany
}
```

**Email Content**:

| Field         | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| From          | `EMAIL_FROM` env var                                             |
| Subject       | `Thank you for supporting Fake Four Inc.!`                       |
| Body (HTML)   | Thank-you message, release title, amount paid, download CTA link |
| Body (text)   | Plain-text equivalent                                            |
| Download link | `${NEXT_PUBLIC_BASE_URL}/api/releases/${releaseId}/download`     |

**Delivery**: AWS SES (`@aws-sdk/client-ses`). No new env vars required.

---

## Environment Variables Required

| Variable                             | Description                          | New?          |
| ------------------------------------ | ------------------------------------ | ------------- |
| `STRIPE_SECRET_KEY`                  | Stripe secret key                    | No (existing) |
| `STRIPE_WEBHOOK_SECRET`              | Webhook signing secret               | No (existing) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key               | No (existing) |
| `NEXT_PUBLIC_BASE_URL`               | Site base URL for email links        | No (existing) |
| `EMAIL_FROM`                         | SES sender address                   | No (existing) |
| `STRIPE_WEBHOOK_IP_RANGES`           | Comma-separated Stripe webhook CIDRs | **Yes (new)** |
| `DATABASE_URL`                       | MongoDB connection string            | No (existing) |
