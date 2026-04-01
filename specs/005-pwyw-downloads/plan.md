# Implementation Plan: PWYW Downloads — Post-Purchase Format Selection

**Branch**: `005-pwyw-downloads` | **Date**: 2026-04-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-pwyw-downloads/spec.md`

## Summary

After a PWYW purchase is confirmed, replace the static "Download Now" link
in the dialog with the existing `FormatBundleDownload` component — a
multi-select ToggleGroup that lets users pick which digital formats to
download. The server-side bundle route already exists (004) and streams a
ZIP with each format in its own named directory. This feature bridges the
gap between the Stripe purchase flow (003) and the S3-backed digital
format system (004).

## Technical Context

**Language/Version**: TypeScript 6.0+ (strict mode)
**Primary Dependencies**: Next.js 16.1 (App Router), React 19, Stripe 21,
Prisma 6 (MongoDB), Auth.js, AWS SDK S3 v3, shadcn/ui (ToggleGroup,
Dialog), Zod 4, React Hook Form, archiver (ZIP streaming)
**Storage**: MongoDB via Prisma; AWS S3 (presigned URLs for downloads)
**Testing**: Vitest 4 with jest-dom matchers; Playwright for E2E
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js)
**Performance Goals**: ZIP streaming must begin within 2s of user click;
no client-side timeout for large bundles (maxDuration = 300s server-side)
**Constraints**: Bundle download counts as 1 download toward per-release
5-download cap. Max ZIP size bounded by selected formats (WAV formats
up to 500MB per file). Must work on mobile browsers.
**Scale/Scope**: ~5 files modified, ~2 files created. Primarily UI flow
changes + email template update. No new Prisma models.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                       | Status | Notes                                                                                                                             |
| --- | ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| I   | TypeScript-First                | PASS   | All code typed; no `any`; strict mode                                                                                             |
| II  | Next.js & React Architecture    | PASS   | Server Components default; Client Components only for dialog interactivity; Server Actions for mutations; bundle route is GET API |
| III | Test-Driven Development         | PASS   | Tests written for modified components; 90-95% coverage target                                                                     |
| IV  | Security & Data Integrity       | PASS   | Auth required for downloads; Zod validation on formats param; purchase verification before bundle streaming                       |
| V   | Performance & Scalability       | PASS   | ZIP streaming (no buffering); `level: 0` compression for already-compressed audio; maxDuration=300s                               |
| VI  | Code Quality & Maintainability  | PASS   | Reuses existing `FormatBundleDownload` component; no new abstractions; absolute imports                                           |
| VII | Accessibility & User Experience | PASS   | ToggleGroup has aria-labels; semantic HTML; keyboard accessible; mobile-first                                                     |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/005-pwyw-downloads/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no new models)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── bundle-api.md    # Existing bundle endpoint contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── components/
│   │   ├── download-dialog.tsx              # MODIFY: purchase-success → format-select transition
│   │   ├── purchase-success-step.tsx        # MODIFY: replace static link with FormatBundleDownload
│   │   ├── format-bundle-download.tsx       # EXISTING: reuse as-is (multi-select + ZIP download)
│   │   └── format-download-list.tsx         # EXISTING: individual format downloads (no change)
│   └── api/
│       └── releases/[id]/download/
│           ├── bundle/route.ts              # EXISTING: ZIP streaming (no change)
│           └── route.ts                     # DEPRECATE: legacy static URL redirect
├── lib/
│   ├── email/
│   │   └── send-purchase-confirmation.ts    # MODIFY: update download link in email
│   ├── constants/
│   │   └── digital-formats.ts              # EXISTING: FORMAT_LABELS, format config (no change)
│   └── repositories/
│       └── release-digital-format-repository.ts  # EXISTING: format queries (no change)
```

**Structure Decision**: Standard Next.js App Router structure. No new
directories needed. Feature is primarily UI flow changes in existing
components.

## Complexity Tracking

No constitution violations to justify. Feature reuses existing
infrastructure (bundle route, FormatBundleDownload component, download
count tracking) and only modifies the dialog step flow.
