# Security Audit Report — Boudreaux

**Date:** April 8, 2026
**Branch:** `chore/security-audit`
**Stack:** Next.js 16, TypeScript 5+, Prisma 5 (MongoDB), Auth.js v5 (beta.30), Stripe 20, AWS S3/SES, shadcn/ui
**Scope:** Full audit — authentication, API routes, server actions, Stripe, S3, dependencies, headers, secrets, data exposure

---

## Executive Summary

The codebase demonstrates strong fundamentals: Stripe webhook signature verification with IP allowlisting, server-side price enforcement, idempotent payment handling, comprehensive security headers, Zod validation on most mutations, and a structured audit logging framework. However, there are **critical gaps in authentication on API mutation routes**, a potentially dangerous open redirect, and several medium-severity issues around rate limiting, dependency hygiene, and environment configuration.

**Findings by severity:**

| Severity | Count |
| -------- | ----- |
| Critical | 4     |
| High     | 7     |
| Medium   | 14    |
| Low      | 14    |
| Info     | 10    |

---

## Critical Findings

### C-1: Unprotected API Mutation Routes — No Authentication

**Files:**

- `src/app/api/artists/[id]/route.ts` — PUT (line 48), PATCH (line 86), DELETE (line 124)
- `src/app/api/artists/[id]/archive/route.ts` — POST (line 15)
- `src/app/api/releases/[id]/route.ts` — PATCH (line 53), DELETE (line 91)
- `src/app/api/featured-artists/[id]/route.ts` — PATCH (line 49), DELETE (line 99)

**Issue:** These endpoints perform destructive operations (update, delete, archive) with **zero authentication or authorization**. Any unauthenticated user can modify or delete any artist, release, or featured artist record via direct HTTP requests. The middleware matcher only covers `/profile*`, `/admin*`, and `/api/admin*` — these routes are completely unprotected.

**Impact:** Complete data integrity compromise. An attacker can delete all artists, releases, and featured artists.

**Remediation:** Wrap all mutation handlers with the `withAdmin` decorator. Expand middleware matcher to cover `/api/*` mutation routes.

---

### C-2: `artist-actions.ts` Server Action Has No Auth Check

**File:** `src/lib/actions/artist-actions.ts` (lines 12–43)

**Issue:** The `createArtistAction` is exported with `'use server'` but performs no authentication check. Any client can invoke it to create arbitrary artist records. It also lacks `import 'server-only'`.

**Remediation:** Add `await requireRole('admin')` and `import 'server-only'`.

---

### C-3: Middleware Matcher Does Not Cover API Mutation Routes

**File:** `src/proxy.ts` (lines 88–101)

**Issue:** The matcher only covers:

```
'/profile', '/profile/:path*', '/admin', '/admin/:path*', '/api/admin/:path*'
```

Routes under `/api/artists/*`, `/api/releases/*`, `/api/tours/*`, `/api/venues/*`, `/api/featured-artists/*`, `/api/notification-banners/*` bypass middleware entirely. Auth depends entirely on per-handler decorators — and many handlers omit them (see C-1).

**Remediation:** Expand the matcher to include all API routes, or ensure every handler has proper auth decorators.

---

### C-4: `resolveSubscriberAction` — User Creation Without Auth + Email Enumeration

**File:** `src/lib/actions/resolve-subscriber-action.ts` (lines 25–72)

**Issue:** This action creates new user accounts without authentication, rate limiting, or CAPTCHA. The response differentiates `existing` vs `created` status, enabling email enumeration.

**Remediation:** Add rate limiting (like `signinAction`), add CAPTCHA verification, return a uniform response status regardless of whether the user existed.

---

## High Findings

### H-1: Open Redirect via `callbackUrl` in Middleware

**File:** `src/proxy.ts` (line 52)

**Issue:**

```typescript
if (token && callbackUrl && callbackUrl !== pathname) {
  return NextResponse.redirect(new URL(callbackUrl, request.url));
}
```

The `callbackUrl` is used directly without validating it's a same-origin path. An attacker can craft `?callbackUrl=//evil.com` or protocol-relative URLs to redirect authenticated users.

**Remediation:** Validate that `callbackUrl` starts with `/` and does not contain `//`.

---

### H-2: 20+ Server Actions Missing `import 'server-only'`

**Files:** All files in `src/lib/actions/` (20+ files)

**Issue:** Per project guidelines, all server-only files must include `import 'server-only'` as a build-time safeguard. These files contain database mutations, S3 operations, and auth checks.

**Remediation:** Add `import 'server-only'` to all server action files.

---

### H-3: No Rate Limiting on Any API Route

**File:** `src/lib/utils/rate-limit.ts` (exists but unused by API routes)

**Issue:** The rate limiter is only used in 4 server actions (`signin`, `signup`, `contact`, `check-guest-purchase`). Zero API routes have rate limiting. Public endpoints (search, health, CDN status, purchase-status polling, proxy-image) are all unthrottled at the application layer.

**Note:** NGINX does provide `limit_req_zone` at 10r/s for `/api/` routes, which partially mitigates this.

**Remediation:** Apply rate limiting to all API routes, especially public search, download, and proxy endpoints.

---

### H-4: Arbitrary S3 Key Override via `existingS3Key`

**File:** `src/lib/actions/presigned-upload-actions.ts` (line 233)

**Issue:** The `existingS3Key` field from client input is used directly as the S3 key with no path validation. A compromised admin could overwrite arbitrary S3 objects.

**Remediation:** Validate that `existingS3Key` starts with the expected prefix `media/{entityType}/{entityId}/`.

---

### H-5: Unvalidated Client-Provided `s3Key` in Confirm Upload

**File:** `src/lib/actions/confirm-upload-action.ts` (lines 52–55)

**Issue:** The `s3Key` from client input is stored in the database after only verifying the object exists in S3. No path pattern validation. An admin could point a release's download entry at any file in the bucket.

**Remediation:** Validate that `s3Key` matches `releases/{releaseId}/digital-formats/{formatType}/...`.

---

### H-6: AWS Credentials Fallback to Empty String

**Files:**

- `src/lib/actions/presigned-upload-actions.ts` (lines 27–29)
- `src/lib/services/tours/image-upload-service.ts` (lines 24–27)

**Issue:** Two S3 client instantiation points fall back to empty string credentials (`|| ''`) instead of failing fast. The canonical `s3-client.ts` properly throws on missing credentials.

**Remediation:** Consolidate all S3 client creation to use `getS3Client()` from `src/lib/utils/s3-client.ts`.

---

### H-7: Server Actions Body Size Limit is 2GB

**File:** `next.config.ts` (line 60)

**Issue:** `bodySizeLimit: '2048mb'` applies to ALL server actions. Since file uploads use presigned S3 URLs (bypassing Next.js), this limit serves no purpose and creates a DoS vector — any user can send multi-GB payloads to any server action.

**Remediation:** Reduce to 10–50 MB.

---

## Medium Findings

### M-1: Role Change Error Swallowed in JWT Callback

**File:** `auth.ts` (lines 130–159)

**Issue:** When a role change is detected, the code throws `new Error('Role changed')` inside a `try/catch` that logs and returns the existing token — defeating the intended re-auth enforcement.

**Remediation:** Return `null` or an empty token instead of throwing inside the catch block.

---

### M-2: `withAuth` Decorator Does Not Validate Session Structure

**File:** `src/lib/decorators/with-auth.ts` (lines 36–48)

**Issue:** Checks `if (!session)` but not `session.user?.id`. The session is cast to `Session` without verifying required fields exist.

**Remediation:** Add `if (!session?.user?.id)` validation.

---

### M-3: `E2E_MODE` Disables Cookie Security

**File:** `auth.ts` (lines 186–198)

**Issue:** When `E2E_MODE=true`, cookies lose `__Secure-` prefix, `secure` flag, and `useSecureCookies`. If accidentally set in production, all cookie security is degraded.

**Remediation:** Add a guard: `if (E2E_MODE && NODE_ENV === 'production') throw`.

---

### M-4: CSP Includes `'unsafe-inline'` and `'unsafe-eval'`

**File:** `next.config.ts` (line 69)

**Issue:** Both weaken XSS protections significantly. `'unsafe-eval'` is especially concerning.

**Remediation:** Investigate nonce-based CSP. Consider removing `'unsafe-eval'` in production.

---

### M-5: Webhook Metadata Not Zod-Validated

**File:** `src/app/api/stripe/webhook/route.ts` (lines 93–98, 147, 164)

**Issue:** `session.metadata?.releaseId` and `session.metadata?.userId` are used in database queries without format validation (e.g., MongoDB ObjectId check).

**Remediation:** Add Zod validation on webhook metadata before using in queries.

---

### M-6: No Rate Limiting on Checkout Session Creation

**Files:**

- `src/lib/actions/create-purchase-checkout-session-action.ts`
- `src/lib/actions/create-checkout-session-action.ts`

**Issue:** Each call creates a Stripe Checkout Session. An attacker could exhaust Stripe API rate limits.

**Remediation:** Add rate limiting similar to `check-guest-purchase-action.ts`.

---

### M-7: CDN Status Endpoint Unauthenticated

**File:** `src/app/api/cdn-status/route.ts`

**Issue:** Exposes CloudFront invalidation timing information to any unauthenticated user.

**Remediation:** Require admin authentication.

---

### M-8: SSRF-Capable Image Proxy

**File:** `src/app/api/proxy-image/route.ts` (lines 19–25)

**Issue:** Domain allowlist includes `s3.amazonaws.com` (overly broad — any public S3 bucket). No authentication. No rate limiting.

**Remediation:** Restrict to the project's own S3 bucket/CDN paths. Add auth and rate limiting.

---

### M-9: Incomplete Environment Validation

**File:** `src/lib/config/env-validation.ts` (lines 17–26)

**Issue:** Only validates `DATABASE_URL`, `AUTH_SECRET`, and email vars. Missing: AWS credentials, S3 bucket, Stripe keys, CDN config.

**Remediation:** Add all required env vars. Convert to Zod schema.

---

### M-10: `SKIP_ENV_VALIDATION` Bypass

**File:** `src/lib/config/env-validation.ts` (lines 10–15)

**Issue:** Completely skips all env validation. If set in production runtime, critical misconfiguration goes undetected.

**Remediation:** Restrict to build phase only via `process.env.NEXT_PHASE === 'phase-production-build'`.

---

### M-11: Custom Regex HTML Sanitizer

**File:** `src/lib/validation/banner-notification-schema.ts` (lines 68–103)

**Issue:** Custom regex-based HTML sanitizer is historically fragile. While the current implementation appears thorough for the narrow tag set, it hasn't been formally audited.

**Remediation:** Consider replacing with DOMPurify or `sanitize-html`.

---

### M-12: Audit Log Persistence Not Implemented

**File:** `src/lib/utils/audit-log.ts` (line 92)

**Issue:** `shouldPersistEvent` has a TODO — critical audit events only go to `console.info`, not a durable store.

**Remediation:** Implement database persistence for critical events.

---

### M-13: Stripe Client Not Cached in Production

**File:** `src/lib/stripe.ts` (lines 26–28)

**Issue:** The caching logic is inverted — `globalThis` cache only applies in development. In production, a new Stripe instance is created on every property access, losing connection pooling.

**Remediation:** Cache in production, recreate in development (standard Next.js pattern).

---

### M-14: `nextjs` Package — Unused Name-Squatting Risk

**File:** `package.json` (line 113)

**Issue:** `nextjs@0.0.3` is NOT the official Next.js framework — it's an abandoned, unrelated package by a third party. Supply chain risk.

**Remediation:** Remove immediately.

---

## Low Findings

| #    | Finding                                                           | File                                                                             |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| L-1  | `deletePurchaseAction` IDOR — admin can delete any purchase by ID | `src/lib/actions/collection-actions.ts:37`                                       |
| L-2  | `purchase-status` API lacks auth                                  | `src/app/api/releases/[id]/purchase-status/route.ts`                             |
| L-3  | Debug endpoints exist in production build                         | `src/app/api/debug/route.ts`, `debug/session/route.ts`                           |
| L-4  | 24-hour presigned download URL expiration (piracy risk)           | `src/lib/constants/digital-formats.ts:100`                                       |
| L-5  | Unbounded `take` parameter on list endpoints                      | `api/artists/route.ts`, `api/releases/route.ts`, `api/featured-artists/route.ts` |
| L-6  | No ObjectId validation on URL params                              | `api/tours/[tourId]/route.ts`, tour image routes                                 |
| L-7  | X-Frame-Options mismatch (NGINX: SAMEORIGIN vs Next.js: DENY)     | `nginx.conf:55` vs `next.config.ts:101`                                          |
| L-8  | HSTS max-age mismatch (NGINX: 1yr vs Next.js: 2yr)                | `nginx.conf:59` vs `next.config.ts:109`                                          |
| L-9  | Email addresses logged in webhook handler                         | `src/app/api/stripe/webhook/route.ts:202`                                        |
| L-10 | In-memory rate limiter not shared across instances                | `src/lib/utils/rate-limit.ts`                                                    |
| L-11 | Dual `bcrypt`/`bcryptjs` packages — only one needed               | `package.json:96–97`                                                             |
| L-12 | `ls` package — unused, abandoned                                  | `package.json:106`                                                               |
| L-13 | Broad `cloudfront.net` in proxy-image allowlist                   | `src/app/api/proxy-image/route.ts:20`                                            |
| L-14 | Error messages may leak internals in upload route                 | `src/app/api/releases/[id]/upload/[formatType]/route.ts:236`                     |

---

## Dependency Vulnerabilities (pnpm audit)

**25 vulnerabilities found** (1 low, 14 moderate, 10 high)

| Package                   | Severity | Issue                              | Via                                             |
| ------------------------- | -------- | ---------------------------------- | ----------------------------------------------- |
| `effect`                  | High     | AsyncLocalStorage context lost     | `prisma > @prisma/config`                       |
| `flatted`                 | High     | Prototype pollution via parse()    | `@vitest/ui` (dev only)                         |
| `picomatch` (<2.3.2)      | High     | ReDoS via extglob                  | `eslint-config-next` (dev only)                 |
| `picomatch` (4.0.0–4.0.3) | High     | ReDoS via extglob                  | `@typescript-eslint` (dev only)                 |
| `path-to-regexp`          | High     | DoS via sequential optional groups | `shadcn > express` (dev only)                   |
| `lodash` (<=4.17.23)      | High     | Code injection via `_.template`    | `archiver > archiver-utils`                     |
| `@xmldom/xmldom`          | High     | XML injection via CDATA            | `video.js > mpd-parser`                         |
| `hono`                    | High     | Multiple issues                    | `shadcn > @modelcontextprotocol/sdk` (dev only) |
| `@hono/node-server`       | Moderate | Middleware bypass                  | `shadcn` (dev only)                             |
| `nodemailer`              | Low      | SMTP command injection             | Direct dependency                               |

**Production-relevant:** `lodash` (via archiver for bundle downloads), `@xmldom/xmldom` (via video.js), `nodemailer` (direct), `effect` (via Prisma).

**Remediation:**

- Update `nodemailer` to >=8.0.4
- Check if `archiver` can be updated to a version using `lodash` >=4.18.0
- Check if `video.js` has a release with patched `@xmldom/xmldom`
- The `effect` vulnerability is upstream in Prisma's config — monitor for Prisma update

---

## Positive Security Practices

These are well-implemented and should be preserved:

1. **Stripe webhook:** Signature verification + IP allowlisting + idempotent purchase handling
2. **Download endpoints:** JWT auth + purchase verification + quota enforcement + download event logging with IP/UA
3. **Upload endpoints:** Admin auth + format-type validation + file size/MIME validation
4. **Prices set server-side:** PWYW has double validation (Zod min + explicit check)
5. **Race condition handling:** P2002 unique constraint guards on user and purchase creation
6. **Email deduplication:** Atomic `updateMany` with `confirmationEmailSentAt: null` filter
7. **Security headers:** Comprehensive CSP, HSTS with preload, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
8. **S3 key sanitization:** Server-generated keys use regex sanitization + timestamp + random suffix
9. **Structured logger:** Redacts sensitive keys (password, secret, token, key, credential, cookie, session)
10. **Cookie security:** `__Secure-` prefix, `httpOnly`, `sameSite: lax`, `secure` in production
11. **NGINX rate limiting:** 10r/s for `/api/`, burst=5 for upload routes
12. **Docker non-root user:** Container runs as UID 1001
13. **Turnstile CAPTCHA:** Properly verified server-side with test bypass only in non-production
14. **`pnpm.onlyBuiltDependencies`:** Restricts install scripts to known packages

---

## Prioritized Remediation Roadmap

### Immediate (This Sprint)

1. **C-1/C-3:** Add `withAdmin` to all unprotected API mutation routes
2. **C-2:** Add auth check to `artist-actions.ts`
3. **H-1:** Fix open redirect — validate `callbackUrl` is same-origin
4. **H-7:** Reduce server actions body size limit to 10–50 MB
5. **M-14:** Remove `nextjs` package from dependencies

### Short-Term (Next 2 Weeks)

6. **H-2:** Add `import 'server-only'` to all server action files
7. **H-4/H-5:** Validate S3 keys against expected path prefixes
8. **H-6:** Consolidate S3 client creation to single validated function
9. **M-1:** Fix role change enforcement in JWT callback
10. **M-2:** Validate session structure in `withAuth`/`withAdmin`
11. **C-4:** Add rate limiting and uniform response to `resolveSubscriberAction`
12. **M-5:** Add Zod validation to webhook metadata
13. **M-6:** Rate-limit checkout session creation actions
14. Update `nodemailer` to >=8.0.4

### Medium-Term (Next Month)

15. **H-3:** Add application-level rate limiting to API routes
16. **M-3:** Guard against `E2E_MODE` in production
17. **M-4:** Investigate nonce-based CSP
18. **M-7/M-8:** Add auth to CDN status and proxy-image endpoints
19. **M-9/M-10:** Expand env validation, restrict skip to build phase
20. **M-11:** Replace custom HTML sanitizer with DOMPurify
21. **M-12:** Implement audit log persistence
22. **M-13:** Fix Stripe client caching (invert the logic)
23. Clean up unused deps (`ls`, dual bcrypt)
24. Align NGINX/Next.js header duplications

### Long-Term

25. **L-4:** Reduce download URL expiration to 1–4 hours (or switch to CloudFront signed URLs)
26. **L-5:** Cap `take` parameters on all list endpoints
27. **L-3:** Gate debug endpoints to development only
28. Monitor Auth.js v5 for stable release
29. Monitor upstream fixes for `lodash`, `@xmldom/xmldom`, `effect` vulnerabilities

---

## `.env` Secret Safety Check

Verified via `git log --all --diff-filter=A -- .env`: The `.env` file was **never committed** to git history. The `.gitignore` properly excludes `.env`, `.env.local`, `.env.development`, `.env.production`, and `.env*.local`.

---

_Generated by automated security audit — April 8, 2026_
