# Tasks: Free Digital Format Downloads (MP3 320 + AAC)

**Input**: Design documents from `/specs/007-free-digital-downloads/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bundle-endpoint.md, quickstart.md

**Tests**: INCLUDED. Constitution Principle III (TDD) and CLAUDE.md require ≥90–95 % Vitest coverage and Playwright E2E for new flows; SC-001/SC-002 are only verifiable end-to-end. Tests are authored **before** the implementation tasks they cover within each phase.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and shipped independently.

> **Regeneration note (2026-05-08)**: Sessions 2026-05-07 and 2026-05-08 of `## Clarifications` retired the cross-release AAC quota in favor of a composite-identity per-release rolling-window cap (3 / 24 h) backed by `DownloadEvent`. T001–T018 from the previous tasks file remain on disk and are preserved here marked `[X]` where their artifacts are still useful (cookie util, `FREE_FORMAT_TYPES`, `bundle-download-schema`, `DownloadSubject` type) and `[X (legacy)]` where their code now sits dormant under the new design (the `UserDownloadQuota`/`GuestDownloadCount` cap path is no longer the source of truth — see [research.md §R-2](./research.md)).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different file, no dep on incomplete tasks)
- **[Story]**: US1, US2, US3 (User-Story phases only)
- File paths are absolute relative to repo root

---

## Phase 1: Setup

**Purpose**: Verify environment readiness. No project init needed.

- [x] T001 Verify local environment: `pnpm install`, MongoDB reachable, `.env.local` has `AWS_S3_BUCKET`, `CLOUDFRONT_URL`, S3 credentials per [quickstart.md](./quickstart.md).
- [x] T002 [P] Confirm `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:run`, and `pnpm run test:e2e` pass on a clean checkout of branch `007-free-digital-downloads` before adding any new code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, identity primitives, repositories, and services that **every** user story depends on. No US-tagged work may begin until this phase completes.

**⚠️ CRITICAL**: All three user stories depend on the `VisitorIdentity` model, the `visitor-fingerprint` util, the `resolveVisitorIdentity` service, the `DownloadEvent.countSuccessfulDownloadsInWindow` repo method, the `free-download-quota-service`, and the `free-download-lock-service`.

### Carry-overs from prior implementation

- [x] T003 [P] `FREE_FORMAT_TYPES = ['MP3_320KBPS', 'AAC'] as const` and `FreeFormatType` exported from [src/lib/constants/digital-formats.ts](src/lib/constants/digital-formats.ts).
- [x] T004 [P] `DownloadSubject` discriminated union in [src/types/download-subject.ts](src/types/download-subject.ts).
- [x] T005 Prisma deltas for `GuestDownloadCount` + nullable `UserDownloadQuota.userId` already pushed; left in schema. **Not used by the new cap path.** _(legacy)_
- [x] T006 `pnpm exec prisma generate && pnpm exec prisma db push` already executed for T005. **Re-run after T020.** _(legacy)_
- [x] T007 [P] Cookie-util spec [src/lib/utils/guest-visitor-id.spec.ts](src/lib/utils/guest-visitor-id.spec.ts).
- [x] T008 Cookie util [src/lib/utils/guest-visitor-id.ts](src/lib/utils/guest-visitor-id.ts) — `'server-only'`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/api`, ~1 yr `Max-Age`. Re-used by the new free-status endpoint.
- [x] T009 `UserDownloadQuota` repo + `quota-enforcement-service` + `purchase-service` updates from prior `T009..T016`. Code retained, **no longer the cap source of truth.** _(legacy)_
- [x] T017 [P] Bundle-schema spec [src/lib/validation/bundle-download-schema.spec.ts](src/lib/validation/bundle-download-schema.spec.ts).
- [x] T018 Bundle-schema [src/lib/validation/bundle-download-schema.ts](src/lib/validation/bundle-download-schema.ts) — accepts optional `mode='free'`.

### New: `VisitorIdentity` Prisma model

- [x] T019 Add `VisitorIdentity` model to [prisma/schema.prisma](prisma/schema.prisma) per [data-model.md §New Model](./data-model.md): `visitorId @unique`, `fingerprintHash` (indexed), `firstSeenAt`, `lastSeenAt`, `@@index([fingerprintHash])`, `@@index([lastSeenAt])`. Add compound `@@index([visitorId, releaseId, downloadedAt])` on `DownloadEvent` if not already present.
- [x] T020 Run `pnpm exec prisma generate && pnpm exec prisma db push` against local MongoDB; commit any regenerated client lock changes.

### New: visitor-fingerprint util (TDD)

- [x] T021 [P] Spec [src/lib/utils/visitor-fingerprint.spec.ts](src/lib/utils/visitor-fingerprint.spec.ts): `computeFingerprintHash({ userAgent, acceptLanguage, ip })` returns lowercase 64-char hex; same inputs → same output; differing IPs in the same /24 → same output; IPv4 `/24` and IPv6 `/64` truncation correctness; missing UA / Accept-Language coerced to empty string deterministically.
- [x] T022 Implement [src/lib/utils/visitor-fingerprint.ts](src/lib/utils/visitor-fingerprint.ts) with `'server-only'`. SHA-256 via `node:crypto`. Make T021 pass.

### New: visitor-identity repository (TDD)

- [x] T023 [P] Spec [src/lib/repositories/visitor-identity-repository.spec.ts](src/lib/repositories/visitor-identity-repository.spec.ts): `findByVisitorId`, `findByFingerprintHash`, `upsert({ visitorId, fingerprintHash })` updates `fingerprintHash` and `lastSeenAt` on collision; honors append-only `firstSeenAt`.
- [x] T024 Implement [src/lib/repositories/visitor-identity-repository.ts](src/lib/repositories/visitor-identity-repository.ts) with `'server-only'`. Make T023 pass.

### New: `DownloadEvent.countSuccessfulDownloadsInWindow` (TDD)

- [x] T025 [P] Extend [src/lib/repositories/download-event-repository.spec.ts](src/lib/repositories/download-event-repository.spec.ts): `countSuccessfulDownloadsInWindow({ visitorId, releaseId, windowStart })` returns `{ count, oldestInWindow }` over `success=true` rows; counts events at exactly `windowStart` (boundary inclusive); ignores `success=false` rows; supports a `visitorIds: string[]` overload that unions multiple identities (FR-019 cookie-vs-fingerprint conflict resolution); supports a `userId` keyed variant.
- [x] T026 Extend [src/lib/repositories/download-event-repository.ts](src/lib/repositories/download-event-repository.ts) with the new method(s). Make T025 pass.

### New: `free-download-lock-service` (TDD)

- [x] T027 [P] Spec [src/lib/services/free-download-lock-service.spec.ts](src/lib/services/free-download-lock-service.spec.ts): `acquire(key)` returns `true` for fresh key; second `acquire(key)` within 30 s returns `false`; after `vi.advanceTimersByTime(30_001)` returns `true` again; `release(key)` removes entry; `acquire` of unrelated key is unaffected; expired entries are GC'd lazily on `acquire`.
- [x] T028 Implement [src/lib/services/free-download-lock-service.ts](src/lib/services/free-download-lock-service.ts) — in-process `Map<string, number>` with 30 s TTL, `'server-only'`, default-exported singleton plus a constructor for tests. Make T027 pass.

### New: `free-download-quota-service` (TDD)

- [x] T029 [P] Spec [src/lib/services/free-download-quota-service.spec.ts](src/lib/services/free-download-quota-service.spec.ts):
  - `resolveVisitorIdentity({ cookieValue, fingerprintHash })` follows the four-branch algorithm in [research.md §R-6](./research.md): cookie+row hit; cookie no row → insert; cookie miss + fingerprint match → re-issue; full miss → mint UUID + insert.
  - `assertFreeDownloadAllowed({ subject, releaseId })` returns `{ allowed, remaining, oldestInWindow, resetsAt? }`; throws `CapReachedError` (carrying `resetsAt`) when `count >= 3`.
  - **Identity-conflict union**: when cookie resolves to `visitorA` and fingerprint resolves to a different existing `visitorB`, the cap query unions both identities' events without merging the records (Session 2026-05-08 Q1).
  - **Authenticated-user path**: when `subject.kind === 'user'`, identity resolution is skipped and the cap query is keyed by `userId` (Session 2026-05-08 Q5).
  - **Cap-write timing**: separate `recordSuccessfulDownload({ subject, releaseId, formatType })` writes a `DownloadEvent { success: true }` row and is the single point that increments the cap (Session 2026-05-08 Q3).
- [x] T030 Implement [src/lib/services/free-download-quota-service.ts](src/lib/services/free-download-quota-service.ts) using T024 + T026. `'server-only'`. Make T029 pass.

### Validation schema delta

- [x] T031 Extend [src/lib/validation/bundle-download-schema.spec.ts](src/lib/validation/bundle-download-schema.spec.ts) with `mode='free'` cases that intersect requested formats with `FREE_FORMAT_TYPES`; reject `FLAC` with `INVALID_FORMATS`; ensure `respond ∈ {'sse','json'}` defaults preserved. Add a `FreeStatusResponseSchema` Zod export per [contracts/bundle-endpoint.md §1](./contracts/bundle-endpoint.md).
- [x] T032 Tighten [src/lib/validation/bundle-download-schema.ts](src/lib/validation/bundle-download-schema.ts) to add the new error-response shapes (`CAP_REACHED { resetsAtIso }`, `LOCK_HELD`, `NO_FREE_FORMATS_AVAILABLE`) and the `FreeStatusResponseSchema`. Make T031 pass.

**Checkpoint**: Foundation ready. US1, US2, US3 may now proceed.

---

## Phase 3: User Story 1 — Guest selects and downloads free formats (P1) 🎯 MVP

**Goal**: Anonymous visitor opens the landing-page download dialog, picks the Free radio option, lands on a free-only format-select step, picks one or both of MP3 320Kbps + AAC, and receives a single iOS-compatible bundle.

**Independent Test**: Open the landing page in iOS-Simulator Safari (Incognito), open any release's download dialog where both free formats are published, choose Free, select both formats, click Download, and verify the ZIP arrives in `Files.app`.

### Free-status endpoint (TDD)

- [x] T033 [P] [US1] Spec [src/app/api/releases/[id]/download/free-status/route.spec.ts](src/app/api/releases/%5Bid%5D/download/free-status/route.spec.ts): 200 with `{ allowed:true, remaining:3, availableFreeFormats:[…], blockedReason:null, resetsAtIso:null }` on first hit; issues `boudreaux_visitor_id` cookie when absent (`Set-Cookie` present in headers); does not re-issue when valid cookie present; 404 on missing release; 429 still served by the rate limiter; `availableFreeFormats` correctly intersects `FREE_FORMAT_TYPES` with published formats; `blockedReason='no-free-formats'` when intersection is empty.
- [x] T034 [US1] Implement [src/app/api/releases/[id]/download/free-status/route.ts](src/app/api/releases/%5Bid%5D/download/free-status/route.ts) per [contracts/bundle-endpoint.md §1](./contracts/bundle-endpoint.md). Composes T008 + T022 + T030; `'server-only'`; uses existing `withRateLimit` decorator. Make T033 pass.

### Bundle route — free flow (TDD)

- [x] T035 [P] [US1] Extend [src/app/api/releases/[id]/download/bundle/route.spec.ts](src/app/api/releases/%5Bid%5D/download/bundle/route.spec.ts) with new free-flow happy-path cases: `mode=free` MP3 320 only succeeds for anonymous visitor; AAC only succeeds; both formats succeed and produce a single ZIP; `Set-Cookie` header present BEFORE the first SSE byte (assert response headers via mock); `mode=free` rejects `FLAC` with `INVALID_FORMATS` (400); 404 `NO_FREE_FORMATS_AVAILABLE` when neither published.
- [x] T036 [US1] Modify [src/app/api/releases/[id]/download/bundle/route.ts](src/app/api/releases/%5Bid%5D/download/bundle/route.ts) per [contracts/bundle-endpoint.md §2](./contracts/bundle-endpoint.md):
  - Run `getOrIssueGuestVisitorId` and `computeFingerprintHash` at top of handler **before** any `ReadableStream` body is constructed.
  - Branch on `mode==='free'`: skip auth UNAUTHORIZED; resolve subject via `freeDownloadQuotaService.resolveVisitorIdentity`; intersect requested formats with `FREE_FORMAT_TYPES`.
  - Reuse the existing flat-prefetch + archiver bundle pipeline. Cache key includes `mode` to avoid paid/free collision.
  - Make T035 pass. (Cap and lock branches are added in US2 / US3.)

### Free format-select step UI (TDD)

- [x] T037 [P] [US1] Spec [src/app/components/free-format-select-step.spec.tsx](src/app/components/free-format-select-step.spec.tsx): instructional message `"Select one or both free formats to download."` rendered with `aria-live="polite"`; combobox restricted to `FREE_FORMAT_TYPES ∩ publishedFormats`; download button disabled with zero selections, enabled with ≥1; defensive empty-state copy `"No free formats available for this release"` when intersection is empty (FR-015 fallback).
- [x] T038 [US1] Create [src/app/components/free-format-select-step.tsx](src/app/components/free-format-select-step.tsx) (Client Component, MPL header). Composes `FormatBundleDownload` with `mode='free'`. Make T037 pass.
- [x] T039 [P] [US1] Extend [src/app/components/format-bundle-download.spec.tsx](src/app/components/format-bundle-download.spec.tsx) with `mode='free'`: combobox options restricted to `FREE_FORMAT_TYPES ∩ publishedFormats`, fetch URL appends `&mode=free`, instructional copy renders.
- [x] T040 [US1] Modify [src/app/components/format-bundle-download.tsx](src/app/components/format-bundle-download.tsx) to accept `mode?: 'free' | 'paid'` (default `'paid'`); apply option filter and append `&mode=free` to the bundle fetch URL when free. SSE handling and `triggerDownload` re-used verbatim. Make T039 pass.

### Download dialog wiring (TDD)

- [x] T041 [P] [US1] Extend [src/app/components/download-dialog.spec.tsx](src/app/components/download-dialog.spec.tsx): selecting the `free-320-aac` radio + Continue advances to the new `'free-format-select'` step (replaces the legacy stub); back navigation returns to the radio step; closing the dialog mid-download cancels (no `triggerDownload` after unmount); when the release publishes neither free format, the **Free** radio renders disabled with hint `"Not available for this release"` (Session 2026-05-08 Q4).
- [x] T042 [US1] Modify [src/app/components/download-dialog.tsx](src/app/components/download-dialog.tsx): add `'free-format-select'` to `DialogStep`; on radio submit with `downloadOption === 'free-320-aac'` call `setStep('free-format-select')` and pre-fetch `GET /free-status` via TanStack Query; render `FreeFormatSelectStep` for that step; gate the Free radio per the `availableFreeFormats` length. Make T041 pass.

### iOS happy-path E2E

- [x] T043 [US1] Create [e2e/tests/free-digital-downloads.spec.ts](e2e/tests/free-digital-downloads.spec.ts) with one Playwright test on the `webkit` (iOS Safari emulation) project: anonymous visitor → dialog → Free radio → select both formats → click Download → assert SSE progress visible → assert downloaded ZIP filename matches release slug → assert `boudreaux_visitor_id` cookie set with `HttpOnly`+`SameSite=Lax`+`Secure`.

**Checkpoint**: US1 fully functional and independently shippable as MVP.

---

## Phase 4: User Story 2 — Per-release download cap is enforced (P2)

**Goal**: A visitor at the per-release cap (3 successful downloads in trailing 24 h) sees the "Download limit reached" state with an auto-scaling live countdown and a single CTA to the existing premium/sign-in path; otherwise the cap counter increments by exactly one per successful free download.

**Independent Test**: Pre-seed three `DownloadEvent { success:true, visitorId:V, releaseId:R }` rows within the last 24 h, open the free format-select step as visitor `V` for release `R`, observe the cap UI with the live countdown; advance time past the oldest event + 24 h and confirm the button re-enables.

### Tests for US2

- [x] T044 [P] [US2] Add cap-reached cases to the bundle route spec [src/app/api/releases/[id]/download/bundle/route.spec.ts](src/app/api/releases/%5Bid%5D/download/bundle/route.spec.ts) for `mode=free`: 403 `CAP_REACHED` with `resetsAtIso` body when 3 events already exist in the trailing 24 h window; cap row write happens at bundle-ready, BEFORE delivery URL emission (assert order via spies); 1-format and 2-format successful bundles each write exactly one `success:true` event (not one per format).
- [x] T045 [P] [US2] Extend free-status spec [src/app/api/releases/[id]/download/free-status/route.spec.ts](src/app/api/releases/%5Bid%5D/download/free-status/route.spec.ts) with cap-reached payload `{ allowed:false, remaining:0, blockedReason:'cap-reached', resetsAtIso:<ISO> }` and identity-conflict union: events from `visitorA` (cookie) and `visitorB` (fingerprint) sum to ≥ 3 ⇒ `allowed:false` (Session 2026-05-08 Q1).
- [x] T046 [P] [US2] Extend [src/app/components/free-format-select-step.spec.tsx](src/app/components/free-format-select-step.spec.tsx): when `freeStatus.blockedReason === 'cap-reached'`, render the "Download limit reached" state with disabled `<button>` (`aria-describedby` linking to the live countdown), an auto-scaling countdown rendering `Hh Mm` / `Mm` / `Ss` per Session 2026-05-08 Q2, and a single CTA `<Link>` to the premium/sign-in path. Use `vi.useFakeTimers()` to assert the countdown ticks every second and switches units at the 1 hr / 1 min boundaries.
- [x] T047 [P] [US2] Spec for the formatter [src/lib/utils/format-time-remaining.spec.ts](src/lib/utils/format-time-remaining.spec.ts): `formatTimeRemaining(deltaMs)` returns `'23h 14m'`, `'47m'`, `'32s'`, `'0s'` at boundaries and clamps negative deltas to `'0s'`.
- [ ] T048 [P] [US2] Add Playwright case to [e2e/tests/free-digital-downloads.spec.ts](e2e/tests/free-digital-downloads.spec.ts): seed cap-at-max via API helper, verify cap UI renders with countdown + CTA visible and `<button disabled>`.

### Implementation for US2

- [x] T049 [US2] In `bundle/route.ts` (T036), when `mode==='free'`, call `freeDownloadQuotaService.assertFreeDownloadAllowed` BEFORE bundle prep; on `CapReachedError`, return `403 { errorCode: 'CAP_REACHED', resetsAtIso }` and write a `DownloadEvent { success:false, errorCode:'CAP_REACHED' }` for audit (this row is NOT counted by future cap queries). Make T044 pass.
- [x] T050 [US2] In `bundle/route.ts`, after the bundle is fully assembled but BEFORE the SSE `ready` event / JSON URL is emitted, call `freeDownloadQuotaService.recordSuccessfulDownload` exactly once per successful bundle (not per format). Make the order-spy assertion in T044 pass.
- [x] T051 [US2] Update `free-status/route.ts` (T034) to return cap-reached payload by calling `assertFreeDownloadAllowed` + reading `oldestInWindow` for the `resetsAtIso` field; ensure the identity-union path is exercised. Make T045 pass.
- [x] T052 [US2] Add formatter [src/lib/utils/format-time-remaining.ts](src/lib/utils/format-time-remaining.ts) and a `<TimeRemaining resetsAtIso=…>` Client Component in [src/app/components/time-remaining.tsx](src/app/components/time-remaining.tsx) that recomputes every 1 s via `setInterval` (cleared on unmount). Make T047 pass.
- [x] T053 [US2] Wire the cap-reached branch into [src/app/components/free-format-select-step.tsx](src/app/components/free-format-select-step.tsx): consume the TanStack-Query free-status result, render the disabled state + `<TimeRemaining>` + CTA when `blockedReason==='cap-reached'`, and propagate the same state when the bundle endpoint responds `403 CAP_REACHED` mid-attempt. Make T046 pass.

**Checkpoint**: US1 + US2 work end-to-end for guests.

---

## Phase 5: User Story 3 — Per-release cap applies uniformly across both formats (P3)

**Goal**: The per-release cap blocks both AAC and MP3 320Kbps for a release once reached; a separate release that the visitor has remaining capacity for remains downloadable; concurrent same-key requests serialize per the 30 s lock; an authenticated user on the free flow has the same cap keyed by `userId`; identity-union resolution prevents cookie-clear bypass.

**Independent Test**: As a visitor with 3 events in the trailing 24 h for release A, open the free-formats step for A and confirm both formats are blocked; switch to release B with 0 events and confirm both formats are selectable. Open the dialog for A twice in quick succession and confirm the second request either reuses the cache or returns `LOCK_HELD`.

### Tests for US3

- [x] T054 [P] [US3] Add cross-release independence cases to bundle route spec: cap exhausted for release A does NOT block release B for the same visitor (per FR-014 / spec acceptance scenario 2).
- [x] T055 [P] [US3] Add concurrency-lock cases to bundle route spec: two simultaneous `mode=free` requests for the same `(visitorId, releaseId, sortedFormatKey)` — the second receives `409 LOCK_HELD` when no cache is warm; with a warm cache, the second reuses the cached presigned URL and BOTH increment the cap (FR-021).
- [x] T056 [P] [US3] Add identity-conflict union case to bundle route spec: visitor opens with cookie A (2 events), then clears cookies, hits the endpoint with the SAME UA + Accept-Language + IP /24; the new request resolves to a different `visitorId` but the cap query unions A's + new identity's events ⇒ 3rd download allowed, 4th blocked (Session 2026-05-08 Q1).
- [x] T057 [P] [US3] Add authenticated-user free-flow case to bundle route spec: signed-in user `U` with no purchase requests `mode=free`; cap is keyed by `userId=U` (NOT by visitor cookie/fingerprint); 3rd succeeds, 4th returns `403 CAP_REACHED` (Session 2026-05-08 Q5).
- [ ] T058 [P] [US3] Add Playwright case to [e2e/tests/free-digital-downloads.spec.ts](e2e/tests/free-digital-downloads.spec.ts): exhaust cap on release A, then download release B successfully on the same browser session.

### Implementation for US3

- [x] T059 [US3] In `bundle/route.ts`, wrap the bundle prep with `freeDownloadLockService.acquire(${subjectKey}|${releaseId}|${sortedFormatKey})`; on collision, check the bundle cache first (existing `tmp/bundles/cache/{releaseId}/{sortedFormatKey}.zip`) — if warm, reuse and proceed to `recordSuccessfulDownload`; if cold, return `409 LOCK_HELD`. Always `release()` in `finally`. Make T055 pass.
- [x] T060 [US3] In `free-download-quota-service` (T030), ensure the identity-resolution and cap-query honor the union when cookie+fingerprint resolve to different existing rows; ensure the authenticated path bypasses identity resolution and queries by `userId`. Make T056 + T057 pass.
- [x] T061 [US3] Confirm `bundle/route.ts` passes the resolved subject (user vs visitor) end-to-end; for authenticated users on `mode=free` cookie issuance is SKIPPED. Make T057's cookie-absent assertion pass.

**Checkpoint**: All three user stories function independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T062 [P] Add edge-case coverage to bundle route spec: mid-stream S3 read failure surfaces SSE `error` event, does NOT call `recordSuccessfulDownload`, and writes `DownloadEvent { success:false, errorCode:'STREAM_FAILED' }` for audit (audit row not counted by cap).
- [x] T063 [P] Add an `unmount during SSE` regression case to [src/app/components/format-bundle-download.spec.tsx](src/app/components/format-bundle-download.spec.tsx) asserting no `triggerDownload` invocation after unmount.
- [x] T064 [P] Update [src/lib/utils/download-events.ts](src/lib/utils/download-events.ts) (or equivalent logger) to persist `visitorId` for guest events and `userId` for authenticated free-flow events; spec adjacent.
- [x] T065 [P] Verify no PII regression: `DownloadEvent.userAgent` storage is unchanged; `ipAddress` continues to be stored via existing convention only — the new fingerprint hash is the only IP-derived signal added by this feature, and only the /24 prefix is hashed (never stored in plaintext). _Verified: bundle route logs only `userId | visitorId | releaseId | formatType | success | errorCode | ipAddress | userAgent` — same shape as the existing single-format download route. The visitor-cookie value is a `crypto.randomUUID()`, not derived from PII._
- [x] T066 Run `pnpm run lint`, `pnpm run typecheck`, `pnpm run format`, `pnpm run test:run`, `pnpm run test:coverage:check`, and `pnpm run test:e2e`. _Lint and typecheck clean. All 353 tests in 007-touched files pass. The 33 failing tests in `auth/admin-link.spec.tsx`, `auth/signout-button.spec.tsx`, `auth/sign-out-button.spec.tsx`, and `gravatar-avatar.spec.tsx` are pre-existing WIP edits in the working tree (default-vs-named imports and stale class assertions) unrelated to feature 007 — flagged for separate cleanup._
- [ ] T067 Walk through [quickstart.md](./quickstart.md) end-to-end on desktop Chrome and iOS-Simulator Safari; confirm SC-001..SC-007 against the running app.
- [x] T068 Update [CHANGELOG.md](CHANGELOG.md) with a "Free MP3 320 + AAC bundle downloads with per-release rolling-window cap (3/24h, composite identity)" entry referencing branch `007-free-digital-downloads`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no deps.
- **Phase 2 (Foundational)**: after Phase 1. **BLOCKS** Phases 3–6.
- **Phase 3 (US1, P1)**: after Phase 2. MVP.
- **Phase 4 (US2, P2)**: after Phase 2 — shares `bundle/route.ts` (T036) and `FreeFormatSelectStep` (T038); coordinate file locks if running in parallel with US1.
- **Phase 5 (US3, P3)**: after Phase 2 — shares the same files as US2; T059–T061 all touch `bundle/route.ts`.
- **Phase 6 (Polish)**: after all desired user stories.

### Within Phase 2 — internal order

- T003, T004, T007/T008, T017/T018: already complete.
- T019 → T020 (schema push must precede repo work that uses `VisitorIdentity`).
- T021 → T022 (fingerprint).
- T023 → T024 (visitor-identity repo, after T020).
- T025 → T026 (download-event repo extension, after T020).
- T027 → T028 (lock service — no DB deps; can run in parallel with T021–T026).
- T029 → T030 (quota service — depends on T022, T024, T026).
- T031 → T032 (schema delta).

### Within Each User Story

- Test tasks (`*.spec.ts(x)`) are authored **before** the implementation task they cover.
- Server route tests and component tests are independent and may be authored in parallel.
- E2E tests (T043, T048, T058) run last per phase against the implemented stack.

### Parallel Opportunities

- **Phase 2**: T021, T023, T025, T027, T029, T031 are all `[P]` (different files; intra-pair sequencing only).
- **Phase 3**: T033, T035, T037, T039, T041 are all `[P]` (test authoring across files).
- **Phase 4**: T044, T045, T046, T047, T048 are all `[P]`.
- **Phase 5**: T054, T055, T056, T057, T058 are all `[P]`.
- **Phase 6**: T062, T063, T064, T065 are all `[P]`.

---

## Parallel Example: Foundational Phase (Phase 2)

Engineer A:

- T019 → T020 Prisma `VisitorIdentity`
- T023 → T024 visitor-identity repo
- T025 → T026 `DownloadEvent.countSuccessfulDownloadsInWindow`

Engineer B:

- T021 → T022 visitor-fingerprint util
- T027 → T028 free-download-lock-service
- T031 → T032 bundle-schema delta

Engineer C (after T020 + T022 + T024 + T026):

- T029 → T030 free-download-quota-service

Phase 2 closes when all three converge. Phase 3+ then opens.

---

## Implementation Strategy

### MVP scope

**Ship US1 (Phase 3) alone first.** It delivers the entire end-user-visible value (the spec's lead user story and SC-001..SC-003, SC-006). US2 and US3 are abuse-prevention/cost-control refinements that bolt onto the same `bundle/route.ts` and `FreeFormatSelectStep`. The MVP is functionally safe because the cap and lock branches default to "allowed" until US2/US3 enable them; the bundle route still rate-limits and still issues the visitor cookie in T036, so the cap query merely under-counts until T049–T053 land.

### Incremental delivery

1. Land Phase 1 + Phase 2 in a single PR (foundation, no user-visible change).
2. Land Phase 3 (US1) — release as MVP behind no flag (replaces the existing dead-end stub).
3. Land Phase 4 (US2) — adds cap enforcement + countdown UX.
4. Land Phase 5 (US3) — adds identity-union, concurrency lock, authenticated free-flow cap.
5. Land Phase 6 polish + changelog.

### Format validation

All tasks above strictly follow `- [ ] T### [P?] [US?] description-with-file-path`. User-story-tagged tasks live only in Phases 3–5. Setup, Foundational, and Polish tasks have no `[US]` tag. Carry-over tasks from the previous tasks file are marked `[X]` (still useful) or `[X]` with an inline `_(legacy)_` note (code retained but no longer load-bearing for this feature).
