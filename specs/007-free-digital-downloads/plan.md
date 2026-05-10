# Implementation Plan: Free Digital Format Downloads (MP3 320 + AAC)

**Branch**: `007-free-digital-downloads` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-free-digital-downloads/spec.md`

## Summary

Replace the dead-end "Free" radio choice in the landing-page download dialog with a working anonymous flow that delivers MP3 320 Kbps and/or AAC as a single ZIP via the existing bundle pipeline. Identity for unauthenticated visitors is a composite of (a) a long-lived first-party cookie ID, (b) a server-side fingerprint hash (UA + Accept-Language + IP /24), and (c) a per-IP rate limit on the bundle endpoint. A per-release cap of **3 successful free downloads per visitor per rolling 24-hour window** is enforced by querying `DownloadEvent` rows. Concurrent free preparations for the same (visitor, release) are serialized with an in-process 30 s lock; second concurrent attempts reuse the freshly cached bundle or receive a "preparing" error without incrementing the cap. The dialog renders a "Download limit reached" state with a precise reset countdown plus a single CTA into the existing premium/sign-in path.

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 24
**Primary Dependencies**: Next.js 16 (App Router, Turbopack dev), React 19, Auth.js v5, Prisma 6 (MongoDB), AWS SDK v3 (S3), `archiver`, React Hook Form 7, Zod 4, TanStack Query 5, shadcn/ui (Radix), Tailwind v4, lucide-react
**Storage**: MongoDB via Prisma (`DownloadEvent`, `GuestDownloadCount`, `UserDownloadQuota` already exist); S3 for media + bundle cache (`tmp/bundles/cache/{releaseId}/{sortedFormatKey}.zip`)
**Testing**: Vitest 4 (globals — never import `describe`/`it`/`expect`/`vi`), `@testing-library/react`, Playwright (E2E) including iOS Safari emulation
**Target Platform**: Web (desktop browsers + iOS Safari + Android Chrome). Cookies must use `Secure`, `HttpOnly`, `SameSite=Lax`.
**Project Type**: Web (Next.js App Router monolith)
**Performance Goals**: <5 s median time-to-download-start for 1-format selection, <10 s for 2-format selection (SC-003); cache hit returns presigned URL in <500 ms
**Constraints**: Must not require sign-in or email capture (FR-010); must not bypass paid-flow auth/rate-limit safeguards (FR-018); cookie issuance MUST precede SSE stream body bytes (Set-Cookie ordering).
**Scale/Scope**: Public landing page traffic; cap of 3/release/24h means a single visitor produces at most ~3 `DownloadEvent` rows per release per day. Visitor identity records are append-only.

## Constitution Check

Gates derived from `.specify/memory/constitution.md` (v1.1.1). Status before Phase 0:

| #   | Principle                      | Status | Evidence                                                                                                                                                                                           |
| --- | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | TypeScript-First               | PASS   | All new code TS strict; Zod for runtime validation of cookie payloads, request bodies, fingerprint inputs.                                                                                         |
| II  | Next.js & React Architecture   | PASS   | New endpoints are Route Handlers (GET); no new Server Actions required; existing dialog stays a Client Component; new utils are `'server-only'`.                                                   |
| III | TDD (NON-NEGOTIABLE)           | PASS   | All new modules ship with `.spec.ts` siblings; route handler tests assert cap enforcement, identity resolution, lock semantics, cookie issuance ordering.                                          |
| IV  | Security & Data Integrity      | PASS   | Cookies `Secure`+`HttpOnly`+`SameSite=Lax`; fingerprint inputs hashed (no raw UA stored); IP truncated to /24 before hashing; rate-limit decorator retained on bundle route; no PII added to logs. |
| V   | Performance & Scalability      | PASS   | Reuse existing bundle cache + flat-prefetch pipeline; cap query is a count over indexed `(visitorId, releaseId, downloadedAt)`; lock is in-memory `Map` with TTL (no extra hop).                   |
| VI  | Code Quality & Maintainability | PASS   | Repository pattern reused; new fingerprint + identity modules are pure functions where possible; absolute imports; JSDoc on all exports.                                                           |
| VII | Accessibility & UX             | PASS   | "Limit reached" state uses semantic `<button disabled>` + `aria-describedby` for the countdown; CTA is a real `<Link>`; mobile-first; Jost font.                                                   |

**Post-design re-check (Phase 1):** PASS. No new violations introduced. No `Complexity Tracking` entries required.

## Project Structure

### Documentation (this feature)

```text
specs/007-free-digital-downloads/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── bundle-endpoint.md  # Free-flow contract delta over existing bundle endpoint
├── spec.md
└── tasks.md             # Re-generated by /speckit.tasks against this plan
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   └── releases/[id]/download/bundle/
│   │       ├── route.ts          # MODIFY: anonymous identity + 24h-rolling cap + 30s lock + DownloadEvent recording
│   │       └── route.spec.ts     # MODIFY: tests for anon flow, cap, lock, cookie ordering
│   └── components/
│       ├── download-dialog.tsx        # MODIFY: "limit reached" branch + premium CTA in free-download step
│       └── download-dialog.spec.tsx   # MODIFY: cover disabled/limit/CTA branches
├── lib/
│   ├── constants/
│   │   └── digital-formats.ts                    # EXISTS (T003): FREE_FORMAT_TYPES
│   ├── repositories/
│   │   ├── download-event-repository.ts          # MODIFY: add countSuccessfulDownloadsInWindow()
│   │   ├── download-event-repository.spec.ts
│   │   ├── guest-download-count-repository.ts    # KEEP (legacy fast counter; written alongside DownloadEvent)
│   │   ├── visitor-identity-repository.ts        # NEW: cookie ↔ fingerprint dual-key lookup + upsert
│   │   └── visitor-identity-repository.spec.ts
│   ├── services/
│   │   ├── free-download-quota-service.ts        # NEW: assertFreeDownloadAllowed({visitorId, releaseId, ids[]})
│   │   ├── free-download-quota-service.spec.ts
│   │   ├── free-download-lock-service.ts         # NEW: in-process 30s lock keyed by (visitorId, releaseId)
│   │   └── free-download-lock-service.spec.ts
│   └── utils/
│       ├── guest-visitor-id.ts                   # EXISTS
│       ├── visitor-fingerprint.ts                # NEW: SHA-256(UA + Accept-Language + IP /24)
│       └── visitor-fingerprint.spec.ts
└── prisma/
    └── schema.prisma                             # MODIFY: add VisitorIdentity model

e2e/
└── tests/
    └── free-download.spec.ts                     # NEW: iOS Safari + desktop happy / cap / lock paths
```

**Structure Decision**: Continue with the existing single-monolith Next.js App Router layout. No new top-level directories. New work lives under `src/lib/services/` (business logic), `src/lib/repositories/` (data access), and `src/lib/utils/` (pure utilities), and modifies one Route Handler + one dialog component. Existing scaffolding from Phase 2 (T001–T018) is retained; the cross-release AAC quota path (`UserDownloadQuota`) is no longer consumed by this feature but is left in place for future use.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
