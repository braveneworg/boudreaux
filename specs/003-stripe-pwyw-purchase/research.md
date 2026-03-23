# Research: Stripe Pay-What-You-Want Purchase

**Feature**: `003-stripe-pwyw-purchase`
**Branch**: `003-stripe-pwyw-purchase`
**Date**: 2026-03-21

---

## R-001: Stripe Checkout Session — Payment Mode vs. Subscription Mode

**Decision**: Use Stripe Checkout Sessions in `mode: 'payment'` with `ui_mode: 'custom'` (embedded
Stripe Elements), identical to the existing subscription checkout infrastructure.

**Findings**:

- The existing `create-checkout-session-action.ts` creates sessions with `mode: 'subscription'`
  and `ui_mode: 'custom'`, returning a `clientSecret` consumed by `CheckoutProvider` +
  `CheckoutForm`.
- For a one-time payment, the same `ui_mode: 'custom'` pattern applies: pass `mode: 'payment'`
  and `line_items` with `price_data.unit_amount` (in cents) instead of a fixed Price ID.
- `payment_intent_data.metadata` should carry `{ type: 'release_purchase', releaseId, userId }`
  so the webhook can discriminate from subscription events without a separate route.
- The `useCheckout()` hook and `PaymentElement` component work identically for both modes —
  no new frontend Stripe imports needed.
- `checkout.confirm()` returns synchronously with a `type: 'complete'` status on success,
  which is the browser-level confirmation signal for the hybrid UX (FR-011).

**Rationale**: Reusing the established custom UI mode avoids introducing Stripe Payment Links or
a separate PaymentIntents flow, keeping the codebase consistent and the existing
`CheckoutProvider` / `CheckoutForm` / `checkout-step.tsx` architecture directly reusable.

**Alternatives considered**:

- Stripe Payment Links: rejected — no embedded UX, opens external page, breaks dialog flow.
- Direct PaymentIntents API (`stripe.paymentIntents.create`): rejected — adds client-side
  `confirmPayment()` integration complexity vs. the simpler Checkout Session approach already
  established in the codebase.

---

## R-002: Webhook Routing — Payment vs. Subscription Events

**Decision**: Extend the existing `/api/stripe/webhook/route.ts` with a `payment_intent_id`-keyed
handler branch inside the `checkout.session.completed` event dispatcher.

**Findings**:

- The existing webhook handles `checkout.session.completed` for subscription mode. When
  `session.mode === 'payment'` the same event fires but with a `payment_intent` field instead
  of a `subscription` field.
- The pattern `if (session.mode === 'payment' && session.metadata?.type === 'release_purchase')`
  cleanly separates the purchase path from the subscription path inside the same handler.
- Idempotency is enforced by checking `PurchaseRepository.findByPaymentIntentId(paymentIntentId)`
  before writing. If a record exists → skip + log warning, return 200 (FR-022).
- IP allowlisting: Stripe publishes its webhook source IPs via their API. The `X-Forwarded-For`
  or `x-real-ip` header is checked before signature verification. Stripe's published IP list is
  fetched from `https://stripe.com/files/ips/ips_webhooks.txt` and should be stored as an env
  var or build-time constant (refreshed periodically). As a defense-in-depth measure, this is
  checked before signature verification — if the IP is not allowlisted, a 403 is returned
  immediately (FR-020).

**Rationale**: A single webhook route is simpler to maintain and already exists at a known path
with the Stripe signature verification infrastructure in place.

**Alternatives considered**:

- Separate webhook route `/api/stripe/purchase-webhook`: rejected — duplicates verifier logic,
  requires a second Stripe webhook endpoint registration.

---

## R-003: Guest Account Creation

**Decision**: Reuse `resolveSubscriberAction` as-is for the purchase guest flow — no changes needed.

**Findings**:

- `resolveSubscriberAction` already: (a) looks up a user by email, (b) creates a bare passwordless
  stub if none found via `CustomPrismaAdapter.createUser`, and (c) returns
  `{ success, status: 'existing' | 'created' }`.
- The `email-step.tsx` dialog component that calls this action is already wired into the
  `DownloadDialog` step machine — the same step is reused for both subscription and purchase
  flows.
- Guest users remain unauthenticated through Stripe checkout. After `checkout.session.completed`,
  the webhook links the Stripe customer to the user record by email (same as subscription flow).
  For the purchase flow, the webhook writes a `ReleasePurchase` linked to the email-matched user.

**Rationale**: Zero additional code for guest account handling; complete reuse of battle-tested path.

---

## R-004: Download Dialog Step Machine Extension

**Decision**: Extend the existing `DialogStep` union type with two new steps:
`'purchase-checkout'` and `'purchase-success'`. The `'email-step'` step is reused unchanged,
routing back to `'purchase-checkout'` when the user arrived via the purchase path.

**Findings**:
Current step machine: `'download' | 'rate-select' | 'email-step' | 'checkout'`

The `'download'` step has two options:

1. Free (320 Kbps) — existing TODO stub
2. Premium digital formats — PWYW amount input + subscribe CTA

For the PWYW purchase path:

- Premium digital option: PWYW input + **"Purchase" button** (new)
- "Purchase" → if authenticated → `'purchase-checkout'`
- "Purchase" → if guest → `'email-step'` (with `returnStep: 'purchase-checkout'` context)
- `'purchase-checkout'` → calls `createPurchaseCheckoutSessionAction`, renders `PurchaseCheckoutStep`
- On browser-level payment confirmation (`checkout.confirm()` returns `type: 'complete'`) → show
  inline "payment received" + progress indicator within `PurchaseCheckoutStep`
- Poll `/api/releases/[releaseId]/purchase-status?paymentIntentId=...` via Tanstack Query
  until `{ confirmed: true }` → transition to `'purchase-success'`
- `'purchase-success'` → show download link button + "check your email" note

The existing `'rate-select' → 'email-step' → 'checkout'` subscription path is unchanged.

**Rationale**: Step-machine extension is the cleanest pattern for the existing architecture;
avoids parallel dialog components; the `'email-step'` `returnStep` context pattern is already
implicit in the subscription flow and can be made explicit with a single shared state field.

---

## R-005: Download Gate API Route

**Decision**: Implement `/api/releases/[releaseId]/download` as a GET route that verifies
authentication, validates purchase ownership + download cap, increments the count, then
redirects (HTTP 302) to the raw download URL from `release.downloadUrls[0]`.

**Findings**:

- `Release.downloadUrls` is a `String[]` containing raw download URLs (S3 or CDN links).
- The download route must: (1) verify `getServerSession()` or `getToken()` — 401 if missing;
  (2) call `PurchaseService.getDownloadAccess(userId, releaseId)` which checks
  `ReleasePurchase` and `ReleaseDownload.downloadCount` — 403 if no purchase or count ≥ 5;
  (3) call `PurchaseService.incrementDownloadCount(userId, releaseId)` atomically;
  (4) fetch `release.downloadUrls[0]` and redirect.
- For users at exactly count = 5: return a 403 with a JSON body `{ error: 'download_limit_reached' }`
  so the UI can display the support message.
- A `?format=` query param can select from `downloadUrls` array in the future; for now,
  always serve index 0.

**Rationale**: Server-side redirect keeps the download URL private and enforces the cap
atomically before every download. The existing API route pattern with `withAuth`-style guards
is familiar to the codebase.

---

## R-006: Purchase-Status Polling for Hybrid UX

**Decision**: Implement `/api/releases/[releaseId]/purchase-status?paymentIntentId=...` as a
lightweight GET route polled by `PurchaseCheckoutStep` via Tanstack Query with
`refetchInterval: 2000` (2-second poll), stopping when `{ confirmed: true }` is returned.

**Findings**:

- After `checkout.confirm()` succeeds client-side, the browser-level payment is confirmed but
  the webhook may not have fired yet. The status endpoint checks for a `ReleasePurchase` record
  with `stripePaymentIntentId = paymentIntentId` and returns `{ confirmed: boolean }`.
- Client polls every 2 seconds. After 90 seconds of polling without a confirmed record,
  a `{ confirmed: false, timedOut: true }` response is shown — the dialog transitions to a
  "processing delayed" state with a support message (per edge case in spec).
- Authentication: the status endpoint requires the user to be authenticated (the same user
  who initiated the checkout). Guest users become "effectively authenticated" for the session
  after `resolveSubscriberAction` creates their account, but their JWT is not issued until
  magic link. For guest users, the status may be polled with the `paymentIntentId` alone
  (no auth required on the status endpoint) — the endpoint only returns boolean confirmation,
  not personal data, so the disclosure risk is negligible.

**Rationale**: Polling is simpler than server-sent events or WebSockets for a low-frequency,
short-lived confirmation wait within a dialog. Tanstack Query's `refetchInterval` + `enabled`
pattern is already used in the codebase.

---

## R-007: Purchase Confirmation Email

**Decision**: Add new templates `purchase-confirmation-email-html.ts` and
`purchase-confirmation-email-text.ts` and a `sendPurchaseConfirmationEmail` function in
`src/lib/email/`, following the identical pattern as `send-subscription-confirmation.ts`.

**Findings**:

- AWS SES client (`ses-client.ts`) is the sole email transport.
- `sendSubscriptionConfirmationEmail` uses `PrismaRepository.markConfirmationEmailSent` for
  idempotency. For purchase emails, idempotency is enforced using a nullable
  `confirmationEmailSentAt` field on `ReleasePurchase` with an atomic conditional update
  (same `updateMany` + null-check pattern).
- Email content: subject "Thank you for supporting Fake Four Inc.", body includes the release
  title, amount paid, and an authenticated download link
  (e.g. `https://fakefourrecords.com/releases/[releaseId]?download=true`).
- `EMAIL_FROM` env var is already defined; no new env vars needed for the email transport.

**Rationale**: Consistent with existing email infrastructure; zero new dependencies; SES handles
delivery retries at the transport level.

---

## R-008: Stripe Webhook IP Allowlisting Implementation

**Decision**: Hard-code Stripe's documented webhook IP ranges as an array constant in the webhook
route file; update this list when Stripe announces IP changes. Check `x-forwarded-for` (first
hop) before signature verification.

**Findings**:

- Stripe publishes its webhook source IPs. In a Next.js/Vercel environment, `x-forwarded-for`
  contains the originating IP as the first comma-separated value.
- The IP check is a middleware-style guard at the top of the POST handler, before `stripe.webhooks.constructEvent`.
- The constant list is extracted to a `STRIPE_WEBHOOK_IP_ALLOWLIST` array in the webhook file
  or a shared constants module. Vercel's edge may swap IPs, so CIDR-range matching is used
  with a small CIDR utility.
- If the deployment runs behind Vercel's infrastructure, the raw Stripe IP is preserved in
  `x-forwarded-for[0]`. If the deployment is behind a custom proxy that re-writes headers,
  this needs verification — documented in quickstart.md.

**Rationale**: Spec clarification Q1 chose option B (signature + IP allowlist). Defense in depth:
a forged request from an unknown IP is rejected before reaching the HMAC computation.

---

## R-009: Prisma MongoDB Schema Constraints

**Decision**: Use `@@unique([userId, releaseId])` on both `ReleasePurchase` and `ReleaseDownload`;
use `stripePaymentIntentId String @unique` on `ReleasePurchase` for the idempotency key.

**Findings**:

- MongoDB via Prisma supports compound unique indexes. The `@@unique` directive creates a
  sparse-capable index.
- For `ReleaseDownload`, a single document per user-release pair holds the running count
  (updated via `prisma.releaseDownload.upsert`). This is simpler than one-document-per-download
  and avoids unbounded collection growth.
- `stripePaymentIntentId` must be `@unique` to allow the idempotency lookup to use an indexed
  query rather than a collection scan.
- `User.stripeCustomerId` already uses a sparse unique index managed outside Prisma (see
  `prisma/scripts/fix-stripe-customer-id-index.ts`). The same pattern applies if payment intent
  IDs on `ReleasePurchase` ever need to be null-able — but since they are always set on write,
  the standard `@unique` is sufficient.

**Rationale**: Compound unique index prevents duplicate purchases; `stripePaymentIntentId` unique
index enables O(log n) idempotency check; upsert-based ReleaseDownload count is simpler and
more efficient than append-only event log for this scale.

---

## R-010: `suggestedPrice` Field on Release

**Decision**: Add `suggestedPrice Int?` (in cents, USD) to the `Release` Prisma model. `null`
means no suggested price — the dialog defaults to an empty/zero amount field.

**Findings**:

- All other monetary amounts in the codebase (subscriber tiers) are defined as integers in cents.
- The existing `download-schema.ts` already parses `finalAmount` as a numeric string. The
  new `purchase-schema.ts` will validate the final chosen amount (in cents) as `z.number().int().min(50)`.
- A `null` `suggestedPrice` is valid: releases may have no suggested price, in which case the
  PWYW input shows a placeholder instead of a pre-filled value.

**Rationale**: Integer cents is the universal Stripe convention; nullable preserves flexibility
for releases without a defined price point.
