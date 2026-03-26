# Implementation Plan: Release Digital Formats Management

**Branch**: `004-release-digital-formats` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-release-digital-formats/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Enable admins to upload and manage digital audio files (MP3, FLAC, WAV, AAC) for releases via an accordion UI in the admin panel, with automatic generation of secure download URLs. Implement freemium download model: users get 5 free unique release downloads, then must purchase for additional access. Technical approach: extend Prisma schema with ReleaseDigitalFormat, UserDownloadQuota, and DownloadEvent models; use AWS S3 presigned URLs for secure file storage and retrieval (mirroring existing release image upload pattern); Server Actions for upload/delete mutations; API route for download authorization + signed URL generation; shadcn/ui Accordion component for format selection UI with checkmark indicators; Zod validation for format-specific file size limits (MP3/AAC 100MB, FLAC 250MB, WAV 500MB); soft delete with 90-day grace period for purchased releases.

## Technical Context

**Language/Version**: TypeScript 5+ (strict mode, no `any` types, explicit function signatures)  
**Primary Dependencies**: Next.js 16 (App Router, Server Components, Server Actions), React 18, Prisma 5 (MongoDB), AWS SDK S3 v3 (@aws-sdk/client-s3, @aws-sdk/s3-request-presigner), Zod (runtime validation), react-hook-form (form state), shadcn/ui (Accordion, Button, Input components), Auth.js (JWT sessions)  
**Storage**: MongoDB via Prisma (ReleaseDigitalFormat, UserDownloadQuota, DownloadEvent metadata); AWS S3 (audio file storage with presigned URLs for upload/download, mirroring existing release image pattern)  
**Testing**: Vitest (unit tests for repositories, services, Server Actions, validation schemas); @testing-library/react (component tests for accordion UI, upload progress, error states); Playwright (E2E tests for admin upload → user download flow, freemium quota enforcement)  
**Target Platform**: Next.js web application (Node.js runtime on Vercel/self-hosted)  
**Project Type**: Web application (admin panel extension + user-facing download delivery)  
**Performance Goals**: <10s upload completion with visual feedback (SC-001), <30s download authorization + file delivery for 100MB files (SC-002), <500ms quota enforcement check, <1min analytics data freshness (SC-007)  
**Constraints**: Format-specific file size validation (MP3/AAC 100MB, FLAC 250MB, WAV 500MB per FR-010/clarifications), cryptographically secure download URLs with minimum 128-bit entropy (SC-005), 24-hour signed URL validity (clarifications), atomic unique-release tracking for freemium quota (FR-005), soft delete with 90-day grace period for purchasers (FR-012/clarifications), 30-day archive retention for replaced files (clarifications)  
**Scale/Scope**: Catalog of ~50-200 releases, moderate format count (4-6 digital formats per release on average), moderate fan traffic (hundreds of concurrent users during release launches), typical album-length files (40-80 minutes at various bitrates)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. TypeScript-First**                  | ✅ Pass | All code in TypeScript 5+ strict mode. Zod schemas for file upload validation (format type, file size, MIME type). Explicit types on repositories (ReleaseDigitalFormatRepository, UserDownloadQuotaRepository, DownloadEventRepository), services (UploadService, DownloadAuthorizationService, QuotaEnforcementService), Server Actions (uploadDigitalFormatAction, deleteDigitalFormatAction), and API routes (download authorization endpoint). No `any` types permitted. Runtime validation with Zod before Prisma writes.                                                                                                                                                                                                                                                                                            |
| **II. Next.js & React Architecture**     | ✅ Pass | Server Components by default: admin release editing page displays accordion with existing formats. `'use client'` only for interactive accordion UI (shadcn/ui Accordion with file upload handlers, progress indicators). Server Actions for mutations: `uploadDigitalFormatAction` (calls S3 presigned URL generation + Prisma create), `deleteDigitalFormatAction` (soft delete logic). API route for download authorization: `/api/releases/[releaseId]/download/[formatType]` with auth check → purchase/quota validation → S3 signed URL generation → DownloadEvent logging. Follows App Router patterns.                                                                                                                                                                                                             |
| **III. Test-Driven Development**         | ✅ Pass | Unit tests (Vitest): `upload-validation.spec.ts` (format-specific size limits), `quota-enforcement.spec.ts` (unique release Set operations, 5-download cap), `soft-delete.spec.ts` (grace period logic, purchaser access checks), `s3-presigned-url.spec.ts` (URL generation with 24hr expiration), repository tests (atomic upsert for quota tracking). Component tests (@testing-library/react): accordion UI with checkmark indicators, upload progress feedback, error message display. E2E tests (Playwright): full admin upload flow → user download flow, freemium quota enforcement (5 free unique releases then lock), purchased release unlimited downloads. Target: 90-95% coverage on all testable code.                                                                                                       |
| **IV. Security & Data Integrity**        | ✅ Pass | Zod validation on all file uploads (MIME type allowlist, format-specific size limits). S3 presigned URLs with 24-hour expiration (fresh generation per download request, not stored). Download authorization checks: `getToken()` from `next-auth/jwt` for API routes (with `withAdmin` decorator for admin-only routes) → check `ReleasePurchase` OR `UserDownloadQuota.uniqueReleaseIds.length < 5` → 401/403 on failure. Server Actions use `requireRole('admin')` decorator. Cryptographically secure download URLs (minimum 128-bit entropy via S3 signed URL algorithm, SC-005). Soft delete preserves data integrity: `deletedAt` timestamp + grace period check prevents accidental permanent deletion. Auth.js JWT sessions for admin mutations. MPL 2.0 license headers on all source files.                     |
| **V. Performance & Scalability**         | ✅ Pass | Lazy S3 client initialization (import on-demand, not global). Presigned upload URLs generated server-side via Server Action, client uploads directly to S3 (reduces server load). Download authorization endpoint generates signed URL on-demand (not upfront storage, reduces DB writes). Atomic quota tracking: MongoDB `$addToSet` operation for `uniqueReleaseIds` prevents race conditions. Efficient unique-release check: `Set.has()` in memory after single document read. Tanstack Query for download status polling (stale-while-revalidate pattern). Image optimization: use Next.js `<Image>` for admin UI thumbnails. Indexes on `ReleaseDigitalFormat.releaseId`, `UserDownloadQuota.userId`, `DownloadEvent.userId` and `DownloadEvent.releaseId` for fast lookups.                                         |
| **VI. Code Quality & Maintainability**   | ✅ Pass | Repository pattern: `ReleaseDigitalFormatRepository` (CRUD + soft delete queries), `UserDownloadQuotaRepository` (atomic unique-release tracking), `DownloadEventRepository` (logging + analytics queries). Service layer: `UploadService` (file validation + S3 coordination), `DownloadAuthorizationService` (purchase + quota checks), `QuotaEnforcementService` (5-download cap logic). Absolute imports (`@/lib/repositories`, `@/lib/services`, `@/lib/validation`). Named exports only. JSDoc comments on complex logic (soft delete grace period calculations, unique release Set operations). DRY: reuse existing S3 presigned URL pattern from release image uploads. Consistent error handling with typed Result objects.                                                                                       |
| **VII. Accessibility & User Experience** | ✅ Pass | shadcn/ui Accordion primitives with built-in ARIA attributes (accordion headers, panels). Keyboard navigation: Tab through format items, Space/Enter to expand, focus management on upload success. Visual indicators: gray checkmark icon in circle (`lucide-react` CheckCircle) for uploaded formats (SC-001, FR-004). Clear upload progress feedback (<10s target, SC-001). Accessible error messages: `role="alert"` for upload failures with specific reasons (file too large, invalid format). Mobile-responsive accordion layout (Tailwind CSS v4 responsive utilities). Screen reader announcements for upload success/failure (visually-hidden status text). Download button disabled state with explanatory text when quota exceeded (FR-005, User Story 3 acceptance). WCAG 2.1 AA compliance (FR-019, SC-008). |

## Project Structure

### Documentation (this feature)

```text
specs/004-release-digital-formats/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── api.md           # Download authorization endpoint spec
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                      # [MODIFY] Add ReleaseDigitalFormat, UserDownloadQuota, DownloadEvent models
└── seed.ts                            # [MODIFY] Add sample digital formats for dev/test releases

src/
├── app/
│   ├── api/
│   │   └── releases/
│   │       └── [releaseId]/
│   │           └── download/
│   │               └── [formatType]/
│   │                   └── route.ts   # [NEW] Download authorization + signed URL generation
│   ├── admin/
│   │   └── releases/
│   │       └── [releaseId]/
│   │           └── page.tsx    # [MODIFY] Integrate DigitalFormatsAccordion component
│   └── components/
│       └── forms/
│           ├── release-form.tsx       # [MODIFY] Add suggestedPrice field to form
│           └── digital-formats-accordion.tsx  # [NEW] Accordion UI with upload targets + checkmarks
│
├── lib/
│   ├── actions/
│   │   ├── upload-digital-format-action.ts   # [NEW] Server Action: S3 presigned URL + Prisma create
│   │   ├── delete-digital-format-action.ts   # [NEW] Server Action: soft delete logic
│   │   └── replace-digital-format-action.ts  # [NEW] Server Action: file replacement + archive
│   │
│   ├── repositories/
│   │   ├── release-digital-format-repository.ts  # [NEW] CRUD + soft delete queries
│   │   ├── user-download-quota-repository.ts     # [NEW] Atomic unique-release tracking
│   │   └── download-event-repository.ts          # [NEW] Logging + analytics queries
│   │
│   ├── services/
│   │   ├── upload-service.ts                 # [NEW] File validation + S3 coordination
│   │   ├── download-authorization-service.ts # [NEW] Purchase + quota checks
│   │   └── quota-enforcement-service.ts      # [NEW] 5-download cap logic
│   │
│   ├── validation/
│   │   ├── digital-format-schema.ts          # [NEW] Zod schemas for upload validation
│   │   └── download-request-schema.ts        # [NEW] Zod schema for download API params
│   │
│   └── utils/
│       ├── s3-client.ts                      # [MODIFY] Add presigned URL methods for audio files
│       └── format-helpers.ts                 # [NEW] MIME type mapping, size limit constants
│
└── types/
    └── digital-format.ts                     # [NEW] TypeScript types for ReleaseDigitalFormat entities

tests/
├── lib/
│   ├── repositories/
│   │   ├── release-digital-format-repository.spec.ts
│   │   ├── user-download-quota-repository.spec.ts
│   │   └── download-event-repository.spec.ts
│   ├── services/
│   │   ├── upload-service.spec.ts
│   │   ├── download-authorization-service.spec.ts
│   │   └── quota-enforcement-service.spec.ts
│   └── validation/
│       ├── digital-format-schema.spec.ts
│       └── upload-validation.spec.ts          # Format-specific size limit tests
│
└── app/
    └── components/
        └── forms/
            └── digital-formats-accordion.spec.tsx  # Component tests: UI, checkmarks, upload flow

e2e/
└── tests/
    ├── admin-upload-digital-formats.spec.ts  # E2E: Admin upload → checkmark indicator
    ├── user-download-purchased.spec.ts       # E2E: Purchase → download flow
    └── freemium-quota-enforcement.spec.ts    # E2E: 5 free downloads → lock
```

**Structure Decision**: Single Next.js web application following established App Router patterns. Admin functionality in auth-gated routes under `(admin-only)`, user download authorization in API routes under `/api/releases/`. Repository pattern for data access, service layer for business logic, Server Actions for mutations, Zod validation at all entry points. Mirrors existing release image upload structure (presigned S3 URLs, metadata in MongoDB via Prisma).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional violations detected. All 7 principles pass:

- TypeScript-First: ✅ Strict mode, Zod validation, explicit types throughout
- Next.js & React Architecture: ✅ Server Components, Server Actions, API routes
- Test-Driven Development: ✅ Vitest unit tests, component tests, Playwright E2E, 90-95% target
- Security & Data Integrity: ✅ Zod validation, S3 presigned URLs, auth checks, soft delete
- Performance & Scalability: ✅ Lazy loading, atomic operations, indexes, efficient queries
- Code Quality & Maintainability: ✅ Repository pattern, service layer, absolute imports, JSDoc
- Accessibility & User Experience: ✅ ARIA, keyboard navigation, WCAG 2.1 AA compliance

No complexity tracking needed.
