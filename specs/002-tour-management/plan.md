# Implementation Plan: Tour Date Management System

**Branch**: `develop/feature/tours` | **Date**: March 7, 2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-tour-management/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a comprehensive tour date management system that allows administrators to create, edit, and manage tour information including dates, venues, headliners, pricing, and promotional images. The system will display tours chronologically on a public-facing page with search capabilities for finding tours by artist name. The feature leverages existing Artist and Group models, adds new Tour and Venue models, implements admin CRUD interfaces following established patterns, provides multi-image upload with AWS S3 storage, and ensures proper validation, authentication, and responsive design throughout.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) with Next.js 16.1.6+
**Primary Dependencies**: React 18+, Prisma 6.x (MongoDB adapter), Auth.js (NextAuth), AWS SDK (S3), Tailwind CSS v4, shadcn/ui, Zod, React Hook Form, Tanstack Query
**Storage**: MongoDB (via Prisma ORM) for data persistence, AWS S3 for image/file storage
**Testing**: Vitest with jest-dom for unit/component testing, Playwright for E2E testing
**Target Platform**: Web application (responsive design for desktop, tablet, mobile)
**Project Type**: Next.js web application with App Router, Server Components, and Server Actions
**Performance Goals**: Page load <3s for 200 tours, image upload <10s for 10MB files, search response <500ms
**Constraints**: 90-95%+ test coverage, MPL 2.0 license compliance, accessibility (WCAG 2.1), mobile-first responsive design
**Scale/Scope**: Support 200+ tours, 10 images per tour, multiple concurrent admin users, public access for thousands of visitors

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Principle I: TypeScript-First Development

- ✅ All new code uses TypeScript with strict mode enabled
- ✅ No `any` types; explicit types for all functions, parameters, and return values
- ✅ Zod schemas for runtime validation of tour data and user input
- ✅ Type-safe Prisma models for Tour, Venue, and related entities

### Principle II: Next.js & React Architecture

- ✅ Use Server Components for tour data fetching and display
- ✅ Add `'use client'` only for interactive components (search, forms, image upload)
- ✅ Server Actions for all tour CRUD mutations
- ✅ Functional components with React Hooks throughout
- ✅ Tanstack Query for client-side tour data caching and synchronization

### Principle III: Test-Driven Development (NON-NEGOTIABLE)

- ✅ Write tests first for all tour management business logic
- ✅ Achieve 90-95%+ coverage on testable files
- ✅ Unit tests for services, utilities, and validation
- ✅ Component tests for forms, search, and tour displays
- ✅ E2E tests for critical flows (create tour, upload images, search)
- ✅ Place tests adjacent to source with `.spec.ts` extension

### Principle IV: Security & Data Integrity

- ✅ Auth.js authentication required for all admin operations
- ✅ Zod validation for all tour input data
- ✅ Input sanitization to prevent XSS attacks
- ✅ Proper authorization checks on admin routes
- ✅ Secure file upload validation (type, size limits)
- ✅ Environment variables for AWS S3 credentials
- ✅ MPL 2.0 license headers in all source files

### Principle V: Performance & Scalability

- ✅ Code splitting and lazy loading for admin components
- ✅ Next.js `<Image>` component for tour artwork optimization
- ✅ Memoization (useMemo, useCallback) for expensive operations
- ✅ Efficient database queries with proper indexing
- ✅ Caching strategy for tour listings
- ✅ Skeleton loaders during data fetching
- ✅ Pagination or virtual scrolling if tour list grows large

### Principle VI: Code Quality & Maintainability

- ✅ Clear separation: models (Prisma), services (business logic), components (UI)
- ✅ DRY principle applied throughout
- ✅ Absolute imports (@/lib, @/components)
- ✅ JSDoc comments for complex functions
- ✅ Consistent naming conventions (PascalCase components, camelCase functions)
- ✅ ESLint and Prettier enforcement
- ✅ Follows existing project structure patterns (admin/tours similar to admin/releases)

### Principle VII: Accessibility & User Experience

- ✅ Semantic HTML throughout (forms, buttons, navigation)
- ✅ ARIA labels for all interactive elements
- ✅ Keyboard navigation support
- ✅ Alt text for all tour images
- ✅ Form labels associated with inputs
- ✅ React Hook Form + Zod for accessible, validated forms
- ✅ Responsive design (mobile-first with Tailwind)
- ✅ Clear error messages and loading states
- ✅ shadcn/ui components for consistency

**GATE STATUS**: ✅ PASSED - All constitutional principles addressed in design

## Project Structure

### Documentation (this feature)

```text
specs/develop/feature/tours/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── tour-api.openapi.yaml
│   └── tour-types.ts
├── checklists/
│   └── requirements.md  # Already created
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Next.js Web Application with App Router

src/app/
├── tours/                      # Public tours page
│   ├── page.tsx               # Tour listing with search
│   ├── [tourId]/              # Individual tour detail page
│   │   └── page.tsx
│   └── components/            # Tour-specific components
│       ├── tour-card.tsx
│       ├── tour-search.tsx
│       └── tour-list.tsx
├── admin/
│   └── tours/                 # Admin tour management
│       ├── page.tsx           # Tour list/dashboard
│       ├── new/               # Create new tour
│       │   └── page.tsx
│       └── [tourId]/          # Edit existing tour
│           ├── page.tsx
│           └── images/        # Tour image management
│               └── page.tsx
├── api/
│   └── tours/                 # API routes (if needed beyond Server Actions)
│       ├── route.ts           # GET tours list
│       └── [tourId]/
│           └── route.ts       # GET single tour
├── actions/
│   └── tours.ts               # Server Actions for mutations
└── components/
    └── forms/
        └── fields/
            ├── tour-form.tsx
            ├── venue-selector.tsx
            ├── artist-multi-select.tsx
            └── tour-image-upload.tsx

src/lib/
├── prisma/
│   ├── client.ts              # Prisma client instance
│   └── tours.ts               # Tour repository/queries
├── services/
│   ├── tour-service.ts        # Business logic
│   ├── venue-service.ts
│   └── image-service.ts       # S3 upload handling
├── validations/
│   ├── tour-schema.ts         # Zod schemas
│   └── venue-schema.ts
└── utils/
    ├── artist-display-name.ts # Name fallback logic
    └── date-utils.ts          # Tour date formatting

prisma/
└── schema.prisma              # Add Tour, Venue, TourImage models

public/
└── tours/                     # Fallback if S3 unavailable (dev)

tests/
├── unit/
│   ├── services/
│   │   ├── tour-service.spec.ts
│   │   └── image-service.spec.ts
│   └── utils/
│       └── artist-display-name.spec.ts
├── integration/
│   └── api/
│       └── tours.spec.ts
└── e2e/
    └── tours/
        ├── admin-tour-management.spec.ts
        ├── public-tour-display.spec.ts
        └── tour-search.spec.ts
```

**Structure Decision**: Following established Next.js App Router patterns with admin section parallel to existing admin/releases, admin/artists, etc. Separating public-facing tours page from admin management. Using Server Actions for mutations, Prisma repositories for data access, and services layer for business logic. Image storage via AWS S3 following existing file upload patterns in the project.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: ✅ NO VIOLATIONS

All constitutional principles are satisfied by the proposed design. No complexity justification required.
