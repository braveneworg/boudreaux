# Security Review Report

**Project:** Boudreaux
**Date:** 2026-03-20
**Branch:** `develop/feature/download-freemium-music`
**Scope:** Files changed in commits `d4173fc..58564ed` (last 5 commits)
**Reviewer:** AI-assisted security review (Claude)

---

## Executive Summary

A security review of 13 recently modified files across the Stripe integration, subscription management, email confirmation, and download dialog features identified **1 high-priority**, **4 medium-priority**, and **4 low-priority** findings. The most critical issue is the lack of server-side ownership verification on the `stripeCustomerId` passed to the checkout session action, which could allow one user to initiate a checkout linked to another user's Stripe account. Additional findings include webhook error-handling behavior that can cause subscription data drift, an unauthenticated success page exposing subscriber emails, and potential internal error message leakage to clients.

Overall, the codebase demonstrates strong foundational practices: `server-only` imports are consistently applied, Stripe webhook signatures are verified, the repository layer uses selective field projection, and confirmation email delivery uses an atomic idempotency guard. The recommendations below are intended to harden the existing implementation.

---

## Files Reviewed

| File                                                     | Purpose                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `prisma/schema.prisma`                                   | MongoDB data model (users, subscriptions, artists, auth) |
| `src/app/api/stripe/webhook/route.ts`                    | Stripe webhook event handler                             |
| `src/app/api/stripe/webhook/route.spec.ts`               | Webhook handler tests                                    |
| `src/app/components/download-dialog.tsx`                 | Multi-step download/checkout dialog (client component)   |
| `src/app/subscribe/success/page.tsx`                     | Post-checkout success page (server component)            |
| `src/app/subscribe/success/page.spec.tsx`                | Success page tests                                       |
| `src/lib/actions/create-checkout-session-action.ts`      | Server Action: creates Stripe Checkout sessions          |
| `src/lib/actions/create-checkout-session-action.spec.ts` | Checkout session action tests                            |
| `src/lib/repositories/subscription-repository.ts`        | Data access layer for subscription operations            |
| `src/lib/repositories/subscription-repository.spec.ts`   | Repository tests                                         |
| `src/lib/stripe.ts`                                      | Lazily-initialized Stripe SDK client                     |
| `src/lib/utils/ses-client.ts`                            | Lazily-initialized AWS SES client                        |
| `src/lib/utils/ses-client.spec.ts`                       | SES client tests                                         |

---

## Findings

### HIGH — Unverified Stripe Customer Ownership

**File:** `src/lib/actions/create-checkout-session-action.ts`
**Lines:** Parameters `stripeCustomerId` and `customerEmail`

**Issue:** The server action accepts `stripeCustomerId` and `customerEmail` as parameters from the client without verifying that these values belong to the currently authenticated user. A malicious caller could pass another user's Stripe customer ID to create a checkout session linked to that user's account.

**Impact:** Subscription billing could be attached to the wrong Stripe customer. Potential for billing abuse or data association errors.

**Recommendation:**

1. Retrieve the authenticated user's session server-side (via `auth()` or equivalent).
2. Look up the user's `stripeCustomerId` from the database instead of trusting client input.
3. If the user has no Stripe customer, create one server-side and persist it.

---

### MEDIUM — Webhook Returns 200 on Handler Errors

**File:** `src/app/api/stripe/webhook/route.ts`
**Line:** ~60

**Issue:** When an event handler (e.g., `linkStripeCustomer`, `updateSubscription`) throws, the route returns `200 { received: true, error: 'Handler failed' }`. Stripe interprets this as successful delivery and will not retry.

**Impact:** If database writes fail (network blip, timeout, deadlock), subscription data becomes permanently out of sync — users may pay but not receive access, or cancel without losing access.

**Recommendation:**

- Return HTTP `500` for transient/retryable errors so Stripe retries delivery.
- Return HTTP `200` only for permanent failures that should not be retried (e.g., user not found, duplicate event).
- Implement idempotency keys or event deduplication to safely handle retries.

---

### MEDIUM — Unauthenticated Success Page Exposes Email

**File:** `src/app/subscribe/success/page.tsx`
**Lines:** ~44–60

**Issue:** The success page takes a `session_id` from query parameters, retrieves the Stripe session, and renders the subscriber's email address — all without authentication. Anyone possessing a valid `session_id` URL can view the subscriber's email.

**Impact:** Minor PII disclosure. Stripe session IDs are long, random, and unpredictable, so risk is low, but the page lacks defense-in-depth.

**Recommendation:**

- Require the user to be authenticated and verify the session belongs to them, OR
- Avoid displaying the full email (e.g., mask as `j***@example.com`), OR
- Use a short-lived, single-use token instead of the raw `session_id`.

---

### MEDIUM — Internal Error Messages Leaked to Client

**File:** `src/lib/actions/create-checkout-session-action.ts`
**Line:** ~66

**Issue:** When an error occurs, `error.message` is returned directly to the client. Stripe SDK errors can include details about API key issues, rate limiting, or internal Stripe state.

**Impact:** Could disclose internal implementation details useful for reconnaissance.

**Recommendation:**

- Log the full error server-side.
- Return a generic user-facing message (e.g., `"Unable to start checkout. Please try again."`).
- Map known error codes to specific user messages if granularity is needed.

---

### MEDIUM — OAuth Tokens Stored in Plaintext

**File:** `prisma/schema.prisma` — `Account` model

**Issue:** `access_token`, `refresh_token`, and `id_token` are stored as plain strings. If the database is compromised, these tokens grant access to external OAuth providers.

**Impact:** In a database breach, attacker gains access to all users' linked OAuth accounts.

**Recommendation:**

- Encrypt tokens at rest using application-level encryption (e.g., AES-256-GCM with a key from AWS KMS or similar).
- This is standard Auth.js behavior and may require a custom adapter to implement encryption, so prioritize based on threat model.

---

### LOW — `dangerouslySetInnerHTML` on Option Labels

**File:** `src/app/components/download-dialog.tsx`
**Line:** ~141

**Issue:** `dangerouslySetInnerHTML={{ __html: option.label }}` renders HTML from `DOWNLOAD_OPTIONS`. Currently safe because the data is a hardcoded constant, but the pattern is fragile.

**Impact:** If `DOWNLOAD_OPTIONS` ever sources data from user input or an API, this becomes an XSS vector.

**Recommendation:**

- If HTML is needed in labels, use a sanitizer (e.g., `DOMPurify`) or render safe JSX instead.
- If labels are plain text, remove `dangerouslySetInnerHTML` and render directly.

---

### LOW — `session_id` Not Format-Validated

**File:** `src/app/subscribe/success/page.tsx`

**Issue:** The `session_id` from the URL is passed directly to `stripe.checkout.sessions.retrieve()` without validating its format (e.g., checking it starts with `cs_`).

**Impact:** Minimal — Stripe will reject invalid IDs and the error is caught. But format validation provides fail-fast behavior and prevents unnecessary API calls.

**Recommendation:**

```typescript
if (!session_id?.startsWith('cs_')) {
  return <ErrorState message="Invalid session." />;
}
```

---

### LOW — Unbounded Subscription Status Values

**File:** `src/lib/repositories/subscription-repository.ts`

**Issue:** `updateSubscriptionStatus` accepts an arbitrary `status` string with no validation. It could be called with any value.

**Impact:** Database integrity — an invalid status string could break downstream logic that expects specific Stripe status values.

**Recommendation:**

- Validate the `status` parameter against a Zod enum or TypeScript literal union of valid Stripe subscription statuses (`active`, `canceled`, `past_due`, `trialing`, `unpaid`, etc.).

---

### LOW — Empty `AUTH_URL` Produces Relative URL

**File:** `src/lib/actions/create-checkout-session-action.ts`

**Issue:** `process.env.AUTH_URL ?? 'http://localhost:3000'` — if `AUTH_URL` is an empty string, `??` does not trigger the fallback (empty string is not `null`/`undefined`), resulting in relative redirect URLs like `/subscribe/success?...`.

**Recommendation:**

```typescript
const baseUrl = process.env.AUTH_URL || 'http://localhost:3000';
```

---

## Informational Notes

| Item                                   | File                          | Note                                                                                                  |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| URL validation TODO                    | `prisma/schema.prisma:241`    | Comment notes URL validation is needed but not implemented                                            |
| Stripe client not cached in production | `src/lib/stripe.ts`           | New `Stripe` instance created on every proxy access in prod — performance concern, not security       |
| SES client not cached                  | `src/lib/utils/ses-client.ts` | Same proxy pattern as Stripe; new `SESClient` per access — performance concern                        |
| Artist PII unencrypted                 | `prisma/schema.prisma`        | Phone, email, address stored as plain strings; application-level access controls must prevent leakage |

---

## What's Working Well

- **`server-only` imports** consistently applied on server modules (`stripe.ts`, `ses-client.ts`, `subscription-repository.ts`, `create-checkout-session-action.ts`)
- **Stripe webhook signature verification** is correctly implemented using raw body + `constructEvent`
- **Selective field projection** in the repository layer prevents over-fetching sensitive data
- **Atomic idempotency guard** on confirmation email (`updateMany` with `confirmationEmailSentAt: null` condition) prevents duplicate sends
- **Secrets loaded from environment variables** — no hardcoded keys or credentials
- **Good test coverage** across all changed files, including edge cases and error paths
- **Duplicate subscription guard** prevents creating checkout sessions for already-active subscriptions at the same tier

---

## Prioritized Remediation Checklist

1. [ ] **HIGH** — Verify `stripeCustomerId` ownership server-side in checkout action
2. [ ] **MEDIUM** — Return 500 for retryable webhook handler errors
3. [ ] **MEDIUM** — Add authentication or email masking to success page
4. [ ] **MEDIUM** — Sanitize error messages returned to client in checkout action
5. [ ] **MEDIUM** — Evaluate OAuth token encryption based on threat model
6. [ ] **LOW** — Replace `dangerouslySetInnerHTML` with safe rendering
7. [ ] **LOW** — Add `session_id` format validation
8. [ ] **LOW** — Add Zod enum validation for subscription status values
9. [ ] **LOW** — Change `??` to `||` for `AUTH_URL` fallback
