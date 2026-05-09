# Phase 0 Research: Free Digital Format Downloads

**Feature**: `007-free-digital-downloads` | **Date**: 2026-05-07

All `NEEDS CLARIFICATION` items in spec.md were resolved by the 2026-05-07 clarification session. This document captures the technical research that informs the Phase 1 design.

## R-1: Anonymous visitor identity (FR-019, FR-020)

**Decision**: Composite identity. The cookie ID (`boudreaux_visitor_id`, UUID, 1-year `Max-Age`, `Secure`+`HttpOnly`+`SameSite=Lax`, `Path=/api`) is the canonical key. A fingerprint hash — `SHA-256(UA | Accept-Language | IP-prefix-/24)` — is computed on every free request and stored in a `VisitorIdentity` table mapping `fingerprintHash → visitorId`. When the cookie is missing or invalid, the server falls back to the fingerprint hash to find the prior `visitorId` and re-issues the cookie. Per-IP rate limiting on the bundle route (existing `downloadLimiter`) supplies the third leg.

**Rationale**:

- Cookie alone is trivially defeated by clearing site data; fingerprint alone has high collision risk on mobile carriers behind CGNAT (shared /24).
- Combining cookie OR fingerprint match resolves to the same `visitorId`, so per-release counts can't be reset by clearing cookies.
- IP prefix /24 (rather than full IP) provides a stable signal for ~24 hours on residential ISPs while avoiding storing the full client IP, satisfying minimization.
- Per-IP rate limit is enforced by the existing decorator, providing abuse resistance independent of identity.

**Alternatives considered**:

- _Cookie only_: rejected — fails SC-004 abuse goals.
- _Per-IP only_: rejected — penalizes shared-NAT users.
- _Email capture_: rejected — violates FR-010.

## R-2: Per-release rolling-window cap (FR-011, FR-012)

**Decision**: Compute the cap by counting `DownloadEvent` rows where `success = true AND visitorId = canonicalVisitorId AND releaseId = X AND downloadedAt >= now() - 24h`. Block if count ≥ 3. Reset countdown is `(oldestEventInWindow.downloadedAt + 24h) - now()`.

**Rationale**:

- `DownloadEvent` is already an append-only audit log with `(visitorId, releaseId, downloadedAt)` indexes; reusing it avoids a second write path.
- Rolling-window semantics naturally fall out of "oldest of the 3" timestamps; no scheduled job needed to "reset" anything.
- `GuestDownloadCount` (a per-(visitor, release) counter) cannot represent rolling windows on its own; we keep it as a fast cache for legacy reads but don't rely on it for cap enforcement.

**Alternatives considered**:

- _Fixed 24h window keyed on first download_: rejected — visitors hitting `00:01` could still get 6 downloads in 24h.
- _Scheduled reset job_: rejected — operationally heavier than a count query.

## R-3: Concurrency lock (FR-021)

**Decision**: In-process `Map<lockKey, expiresAt>` with TTL = 30 s, keyed by `${visitorId}|${releaseId}|${sortedFormatKey}`. `acquire()` checks the current entry; if present and unexpired, returns `false`. `release()` removes the entry. Cleanup occurs lazily on every `acquire()` call.

**Rationale**:

- Simplest possible implementation; zero new dependencies.
- One Next.js process serves the bundle endpoint per instance; serialization is correct within an instance.
- Cross-instance correctness is provided by the existing **bundle cache key**: `tmp/bundles/cache/{releaseId}/{sortedFormatKey}.zip`. Two instances racing for the same key still both succeed; the second writer overwrites the same idempotent content. The "second concurrent attempt errors" guarantee is thus best-effort across instances and reliable within an instance — acceptable per spec.
- TTL = 30 s comfortably exceeds median single-format prep time (<5 s; SC-003).

**Alternatives considered**:

- _Redis-based distributed lock_: rejected — no Redis in the current stack.
- _MongoDB unique index on a `BundleLock` doc with TTL `expiresAt`_: rejected for now — adds a write hop on the hot path; revisit if multi-instance becomes load-bearing.

## R-4: Cookie issuance ordering with SSE

**Decision**: Issue the cookie via `cookies().set(...)` **before** any SSE bytes are written. In Next.js 16 App Router Route Handlers, `Set-Cookie` headers attached via `cookies()` are merged into the `Response` headers regardless of body type, including `text/event-stream`. The existing `getOrIssueGuestVisitorId()` util is called at the very top of the handler, before the `ReadableStream` is constructed.

**Rationale**: Browsers accept `Set-Cookie` on any response, including streaming, as long as the header is present in the initial header block. iOS Safari verified to accept this pattern in feature 003.

**Alternatives considered**:

- _Two-call dance (warm-up GET to set cookie, then bundle GET)_: rejected — extra round trip; harms SC-003.

## R-5: "Limit reached" UX wiring

**Decision**: When the dialog opens for a release, the client makes an additional lightweight `GET /api/releases/{id}/download/free-status` call (new endpoint). The endpoint returns `{ allowed: boolean, remaining: number, resetsAtIso?: string, blockedReason?: 'cap-reached' }`. The free-download step renders the disabled "Download limit reached" UI with a `<TimeRemaining resetsAt={resetsAtIso}>` countdown (recomputed on the client every second from `Date.now()`) and a single CTA (sign-in or premium link, reused from the existing premium path).

**Rationale**:

- Avoids opening the SSE stream just to learn the cap is full.
- Endpoint is cheap (one indexed count query).
- Status endpoint also issues the cookie if absent, satisfying FR-020 before any download attempt.

**Alternatives considered**:

- _Embed status in the existing release-detail server component_: rejected — would force every landing-page render to issue the cookie; status is only relevant when the dialog opens.

## R-6: Identity resolution algorithm

**Decision**: `resolveVisitorIdentity({ cookieValue, fingerprintHash })`:

1. If `cookieValue` valid and a `VisitorIdentity` row matches → use that `visitorId`. Update `lastSeenAt`. Upsert `(visitorId, fingerprintHash)` if changed.
2. Else if `cookieValue` valid but no row → create `VisitorIdentity { visitorId = cookieValue, fingerprintHash }`. Use `cookieValue`.
3. Else (no/invalid cookie) → look up `VisitorIdentity` by `fingerprintHash`. If match → re-issue cookie with the matched `visitorId`. Use that `visitorId`.
4. Else → mint new UUID, set as cookie, insert `VisitorIdentity`.

Per-release cap queries use the canonical `visitorId` resolved here. No "OR" lookups at query time — the OR is resolved at identity-resolution time.

**Rationale**: Centralizing identity resolution keeps the cap query simple (single `visitorId`) and durable across cookie clears.

## R-7: Dependencies & versions confirmed

- `archiver@^7`, `@aws-sdk/lib-storage` — already vendored.
- `next/headers` `cookies()` — used in existing `getOrIssueGuestVisitorId`.
- No new npm dependencies required.

## R-8: Test strategy

- Unit: each new util/service/repo has a `.spec.ts`. Hash output deterministic; lock TTL uses `vi.useFakeTimers()`.
- Integration (Vitest, jsdom): bundle Route Handler tests assert (a) cookie-issued on first call, (b) cap blocks at 4th attempt, (c) reset window math, (d) lock rejects concurrent same-key, (e) reuses cache when possible.
- E2E (Playwright): `e2e/tests/free-download.spec.ts` covers (i) anonymous happy path on Chromium, (ii) anonymous happy path on `webkit` (iOS Safari emulation, asserts `Content-Disposition: attachment` to confirm Files-app save), (iii) cap-reached state with countdown.

All `NEEDS CLARIFICATION` items resolved.
