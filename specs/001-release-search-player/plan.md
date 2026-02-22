# Implementation Plan: Release Search & Media Player

**Branch**: `001-release-search-player` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-release-search-player/spec.md`

## Summary

Build a public-facing releases listing page (`/releases`) with a combobox dropdown search and a release media player page (`/releases/{releaseId}`). The listing page displays all published releases as a responsive card grid with cover art, artist names, and release titles. A combobox dropdown lets fans search by artist name, release title, or group name — selecting a result navigates to the release's media player page. The media player page reuses the existing `MediaPlayer` compound component with the same visual composition as the landing page's `FeaturedArtistsPlayer`, adding a "more by this artist" carousel and a plain-text description section. Both pages include breadcrumb navigation and follow mobile-first responsive design.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (strict mode enabled)
**Framework**: Next.js 16.1.6+ (App Router, React 19.2.4)
**Primary Dependencies**: `cmdk` (Command/combobox), `embla-carousel-react` (Carousel), `video.js` (audio playback via MediaPlayer), `lucide-react` (icons), `next/image` (optimized images), `@tanstack/react-query` (client-side data fetching)
**Storage**: MongoDB via Prisma ORM (`@prisma/client` 6.16.3+)
**Styling**: Tailwind CSS v4 with shadcn/ui component library, `cn()` utility for conditional classes
**Testing**: Vitest 4.0.13+ (unit/component tests with `@testing-library/react`, jest-dom matchers), Playwright (E2E)
**Target Platform**: Web — mobile-first responsive (320px–1920px viewports)
**Project Type**: Web application (single Next.js project)
**Performance Goals**: Page load < 3s on mobile 3G/4G, search results < 500ms after typing stops, Lighthouse accessibility 90+
**Constraints**: Client-side search filtering (catalog < 500 releases), no new dependencies, `server-only` for server-side code, MPL 2.0 license headers in all source files
**Scale/Scope**: < 500 releases, 2 new pages, ~8–10 new components/files, reuse of existing MediaPlayer compound component

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                      | Status  | Notes                                                                                                                                                                                                                                 |
| --- | ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | TypeScript-First               | ✅ PASS | All new code in TypeScript strict mode. Prisma payload types for data. No `any`.                                                                                                                                                      |
| II  | Next.js & React Architecture   | ✅ PASS | Server Components for data fetching (listing + player pages). `'use client'` only for interactive components (search combobox, player wrapper). Server Actions not needed (read-only feature). API route already exists for releases. |
| III | Test-Driven Development        | ✅ PASS | All new components and services get `.spec.ts` test files. Target 90%+ coverage.                                                                                                                                                      |
| IV  | Security & Data Integrity      | ✅ PASS | Public pages (no auth needed). Zod validation on API params. Sanitized search input. `rel="noopener noreferrer"` on external links. MPL 2.0 headers.                                                                                  |
| V   | Performance & Scalability      | ✅ PASS | Lazy loading with skeletons for images. `withCache` for new service method. `useMemo`/`useCallback` in interactive components. Next.js `Image` for optimization.                                                                      |
| VI  | Code Quality & Maintainability | ✅ PASS | Absolute imports (`@/`). JSDoc on all functions/components. DRY: reuse existing MediaPlayer, BreadcrumbMenu, Carousel, Command. Service layer for business logic.                                                                     |
| VII | Accessibility & UX             | ✅ PASS | Semantic HTML, ARIA labels, keyboard navigation on combobox and carousel. Alt text on all images. Breadcrumbs with aria-current. Mobile-first responsive.                                                                             |

**Gate result: ALL PASS — no violations. Proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/001-release-search-player/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # API contract for releases endpoints
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── releases/                          # NEW: Public releases route
│   │   ├── page.tsx                       # Releases listing page (Server Component)
│   │   ├── page.spec.tsx                  # Tests for listing page
│   │   └── [releaseId]/
│   │       ├── page.tsx                   # Release media player page (Server Component)
│   │       ├── page.spec.tsx              # Tests for player page
│   │       ├── not-found.tsx              # NEW: 404 page for invalid release IDs
│   │       └── not-found.spec.tsx         # Tests for not-found page
│   └── components/
│       ├── release-card.tsx               # NEW: Release card component
│       ├── release-card.spec.tsx          # Tests
│       ├── release-card-grid.tsx          # NEW: Responsive grid of release cards
│       ├── release-card-grid.spec.tsx     # Tests
│       ├── release-search-combobox.tsx    # NEW: Combobox dropdown search ('use client')
│       ├── release-search-combobox.spec.tsx # Tests
│       ├── release-player.tsx             # NEW: Release player wrapper ('use client')
│       ├── release-player.spec.tsx        # Tests
│       ├── release-description.tsx        # NEW: Plain text description section
│       ├── release-description.spec.tsx   # Tests
│       ├── artist-releases-carousel.tsx   # NEW: "More by this artist" carousel
│       └── artist-releases-carousel.spec.tsx # Tests
├── lib/
│   ├── services/
│   │   ├── release-service.ts             # MODIFY: Add getPublishedReleases, getReleaseWithTracks, getArtistOtherReleases
│   │   └── release-service.spec.ts        # NEW: Tests for release service methods
│   ├── types/
│   │   └── media-models.ts                # MODIFY: Add PublishedRelease type if needed
│   └── utils/
│       ├── release-helpers.ts             # NEW: Utility functions (getArtistDisplayName, getReleaseCoverArt, getBandcampUrl, buildReleaseSearchValue)
│       └── release-helpers.spec.ts        # NEW: Tests for release helper utilities
```

**Structure Decision**: Public releases pages follow the existing pattern of placing public routes as direct children of `src/app/` (matching `about/`, `contact/`, `legal/`). New components are placed in `src/app/components/` alongside existing components. Business logic remains in `src/lib/services/release-service.ts`.

## Constitution Re-Check (Post-Design)

_Re-evaluated after Phase 1 design completion._

| #   | Principle                      | Status  | Post-Design Notes                                                                                                                                                        |
| --- | ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I   | TypeScript-First               | ✅ PASS | `PublishedReleaseListing`, `PublishedReleaseDetail`, `ReleaseCarouselItem` Prisma payload types defined. All component props typed. No `any`.                            |
| II  | Next.js & React Architecture   | ✅ PASS | Server Components for both pages. `'use client'` only for `ReleaseSearchCombobox` and `ReleasePlayer`. Service layer for data access. No new API routes needed.          |
| III | Test-Driven Development        | ✅ PASS | 11 spec files planned (1 service + 1 utility + 6 component + 2 page + 1 not-found). Implementation steps include test-first approach.                                    |
| IV  | Security & Data Integrity      | ✅ PASS | Public pages (no auth). Bandcamp links use `rel="noopener noreferrer"`. Search input handled by cmdk (no raw HTML injection). ObjectId validated by Prisma. MPL headers. |
| V   | Performance & Scalability      | ✅ PASS | `withCache` on listing query (10-min TTL). `next/image` for cover art. Lazy loading with skeletons (FR-019). `useCallback`/`useMemo` in client components.               |
| VI  | Code Quality & Maintainability | ✅ PASS | Absolute imports. JSDoc on all exports. DRY: reuses MediaPlayer, BreadcrumbMenu, Carousel, Command, Skeleton. Single-responsibility service methods.                     |
| VII | Accessibility & UX             | ✅ PASS | cmdk provides ARIA roles + keyboard nav. `alt` text on all images (with fallback). Semantic HTML. Breadcrumbs with `aria-current`. Mobile-first responsive grid.         |

**Post-design gate: ALL PASS — no violations. Proceed to Phase 2 (task breakdown).**

## Complexity Tracking

> No constitution violations. Table not needed.
