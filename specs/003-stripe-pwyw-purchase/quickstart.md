# Quickstart: Stripe Pay-What-You-Want Purchase

**Feature**: `003-stripe-pwyw-purchase`
**Branch**: `003-stripe-pwyw-purchase`

---

## Overview

This feature adds a PWYW one-time purchase flow to the release download dialog. A user selects
a price, completes payment via embedded Stripe checkout, waits briefly for webhook confirmation,
then receives a download link and a confirmation email. Returning purchasers get up to 5 free
re-downloads before the button locks with a support message.

---

## Prerequisites

- Node.js 20+ and `npm` installed
- Docker running (for local MongoDB via `docker compose up`)
- A Stripe account with test mode enabled
- A Stripe CLI installation (`brew install stripe/stripe-cli/stripe`) for local webhook forwarding
- AWS SES credentials configured for test email delivery (or a sandbox override)

---

## Environment Variables

Add the following to `.env.local`. All others (`STRIPE_SECRET_KEY`, `DATABASE_URL`, etc.) should
already be present.

```bash
# NEW — Stripe webhook IP allowlist (CIDR ranges, comma-separated)
# Current Stripe webhook IP ranges (update when Stripe announces changes):
STRIPE_WEBHOOK_IP_RANGES="54.187.174.169/32,54.187.205.235/32,54.187.126.231/32,54.241.31.99/32,54.241.31.102/32,54.241.31.104/32"

# Already required — verify these are set
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          # From Stripe CLI: stripe listen --print-secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EMAIL_FROM=noreply@fakefourrecords.com
```

> **IP allowlist note**: In local development via Stripe CLI, webhook events are forwarded from
> `127.0.0.1`, which will not match the Stripe IP allowlist. Set
> `SKIP_STRIPE_IP_CHECK=true` in `.env.local` only — this flag must never be set in production.

---

## Database Setup

```bash
# Push the updated schema (adds ReleasePurchase, ReleaseDownload, Release.suggestedPrice)
npx prisma db push

# Verify new collections exist
npx prisma studio
# → Check for ReleasePurchase and ReleaseDownload collections
```

---

## Setting a Suggested Price on a Release

Use the admin panel or Prisma Studio to set `suggestedPrice` on a release (in cents):

```
# Example: $9.99 suggested price
suggestedPrice: 999
```

A release with `suggestedPrice: null` will show the PWYW input with no pre-fill.

---

## Local Stripe Webhook Forwarding

```bash
# Terminal 1: Start the dev server
npm run dev

# Terminal 2: Forward Stripe webhooks to your local server
stripe listen \
  --forward-to http://localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,payment_intent.succeeded

# Copy the webhook secret printed by the CLI and set it as STRIPE_WEBHOOK_SECRET in .env.local
# Restart the dev server after updating .env.local
```

---

## Running the Purchase Flow Locally

1. Navigate to a release page: `http://localhost:3000/releases/[any-release-id]`
2. Click the **Download** button
3. If not logged in: enter an email address (new or existing)
4. Select "Premium digital formats", enter or accept the suggested price
5. Click **Purchase** — the embedded Stripe payment form appears
6. Use Stripe test card: `4242 4242 4242 4242`, any future date, any CVC
7. Observe the "payment received" progress indicator in the dialog
8. Wait ~2–5 seconds for the Stripe CLI to forward the webhook and the dialog to update
9. Click the download link that appears
10. Check the email address used — a purchase confirmation email should arrive (or be logged
    to the console if email delivery is mocked in development)

---

## Key Files Reference

| File                                                         | Role                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `prisma/schema.prisma`                                       | Schema — `ReleasePurchase`, `ReleaseDownload`, `Release.suggestedPrice` |
| `src/app/components/download-dialog.tsx`                     | Main dialog step machine — extends with purchase steps                  |
| `src/app/components/purchase-checkout-step.tsx`              | NEW — Stripe PaymentElement for PWYW                                    |
| `src/app/components/purchase-success-step.tsx`               | NEW — Download link reveal after webhook                                |
| `src/lib/actions/create-purchase-checkout-session-action.ts` | NEW — Payment-mode Checkout Session                                     |
| `src/app/api/releases/[releaseId]/download/route.ts`         | NEW — Authenticated download gate                                       |
| `src/app/api/releases/[releaseId]/purchase-status/route.ts`  | NEW — Webhook confirmation poll                                         |
| `src/app/api/stripe/webhook/route.ts`                        | MODIFIED — add payment-mode branch                                      |
| `src/lib/repositories/purchase-repository.ts`                | NEW — DB access for purchases + downloads                               |
| `src/lib/services/purchase-service.ts`                       | NEW — Ownership check + cap enforcement                                 |
| `src/lib/email/send-purchase-confirmation.ts`                | NEW — SES confirmation email dispatch                                   |
| `src/lib/validation/purchase-schema.ts`                      | NEW — Zod schemas for purchase flow                                     |

---

## Architecture Decision: Hybrid Post-Payment UX

After the user submits payment:

1. **Browser-level** — `checkout.confirm()` returns `{ type: 'complete' }` synchronously
   → Dialog shows "Payment received, preparing your download..." + spinner
2. **Background** — Stripe fires `checkout.session.completed` to the webhook route
   → Webhook writes `ReleasePurchase` and dispatches confirmation email
3. **Frontend poll** — `PurchaseCheckoutStep` polls
   `GET /api/releases/[releaseId]/purchase-status?paymentIntentId=pi_xxx` every 2 seconds
4. **Confirmation** — Poll returns `{ confirmed: true }` → Dialog transitions to
   `PurchaseSuccessStep` showing the download link
5. **Timeout** — After 90 seconds without confirmation: dialog shows
   "processing delayed" message with support contact prompt

This ensures the download link is only revealed after server-side purchase recording,
preventing the main edge case of users receiving download access before the purchase is recorded.

---

## Architecture Decision: Download Cap Enforcement

The `ReleaseDownload` model holds one document per user-release pair with a running
`downloadCount`. The download gate route:

1. Reads `downloadCount` from `ReleaseDownload` (creates if absent via upsert)
2. Returns `403 download_limit_reached` if `downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT` (5)
3. Atomically increments `downloadCount` and sets `lastDownloadedAt = now()`
4. Issues the `302` redirect to the download URL

The count is authoritative and cannot be decremented by the user. Support staff adjust it
directly via admin tools.

---

## Running Tests

```bash
# Run all tests once
npm run test:run

# Run tests for this feature only
npm run test:run -- --grep "purchase"

# Coverage report (target: 90–95%+ on all new files)
npm run test:coverage
```

---

## Troubleshooting

**Dialog shows "payment received" but never reveals download link**
→ Check that the Stripe CLI is running and forwarding events. Verify `STRIPE_WEBHOOK_SECRET`
matches the CLI output. Check server logs for webhook handler errors.

**403 `no_purchase` on download route after successful payment**
→ The webhook has not yet fired or failed. Check Stripe CLI output and server logs.
Use Stripe dashboard "Resend" to replay the event.

**403 `download_limit_reached` unexpectedly**
→ Check `ReleaseDownload.downloadCount` for the user-release pair via Prisma Studio.
Support can reset the count manually.

**IP allowlist rejection (403) in local development**
→ Ensure `SKIP_STRIPE_IP_CHECK=true` is set in `.env.local`. Never set this in production.

**Webhook works but no confirmation email received**
→ Check `ReleasePurchase.confirmationEmailSentAt` — if set, the email was already dispatched.
Check SES delivery logs or the local email mock/console output.
