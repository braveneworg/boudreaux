# Tasks: Tour Date Management System

**Input**: Design documents from `/specs/develop/feature/tours/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Branch**: `develop/feature/tours`
**Tech Stack**: Next.js 16.1.6+, TypeScript 5.x, React 18+, Prisma 6.x, MongoDB, AWS S3, Tailwind v4, shadcn/ui

**Tests**: All test tasks included per TDD principle (Principle III - Non-negotiable)

**Organization**: Tasks grouped by user story to enable independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- File paths use `src/` at repository root per Next.js App Router structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Review existing codebase patterns in src/app/admin/releases/, src/app/admin/artists/ for consistency
- [ ] T002 [P] Add MPL 2.0 license headers to all new source files per HEADER.txt
- [ ] T003 [P] Create directory structure: src/app/tours/, src/app/admin/tours/, src/lib/repositories/tours/, src/lib/services/tours/, src/lib/validations/tours/
- [ ] T004 [P] Install/verify dependencies: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner (check package.json)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Add Tour, Venue, TourHeadliner, TourImage models to prisma/schema.prisma per data-model.md
- [ ] T006 Add tourHeadliners relationship to Artist model in prisma/schema.prisma
- [ ] T007 Generate Prisma client after schema updates: `pnpm exec prisma generate`
- [ ] T008 Sync database schema with Prisma (MongoDB): `pnpm exec prisma db push` (Note: MongoDB does not support migrations, use db push instead)
- [ ] T009 [P] Create shared TypeScript types file at src/lib/types/tours.ts from contracts/tour-types.ts
- [ ] T010 [P] Create artist display name utility function in src/lib/utils/artist-display-name.ts with fallback logic (displayName → group.displayName → firstName + surname → "Unknown Artist")
- [ ] T011 [P] Create date formatting utilities in src/lib/utils/date-utils.ts for tour date display
- [ ] T012 Test artist display name utility in src/lib/utils/artist-display-name.spec.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Admin Creates Tour Dates (Priority: P1) 🎯 MVP

**Goal**: Admins can create, read, update, and delete tour entries with all required fields through admin interface

**Independent Test**: Log in as admin, navigate to /admin/tours, create a new tour with title, venue, dates, times, and headliners, verify it saves and appears in tour list. Edit the tour and verify changes persist. Delete tour and verify removal.

### Tests for User Story 1 (TDD - Write tests FIRST, ensure they FAIL) ⚠️

- [ ] T013 [P] [US1] Create Zod validation schema tests in src/lib/validations/tours/tour-schema.spec.ts (test required fields, max lengths, date validations)
- [ ] T014 [P] [US1] Create venue validation schema tests in src/lib/validations/tours/venue-schema.spec.ts
- [ ] T015 [P] [US1] Create tour repository unit tests in src/lib/repositories/tours/tour-repository.spec.ts (test CRUD operations, mocked Prisma)
- [ ] T016 [P] [US1] Create venue repository unit tests in src/lib/repositories/tours/venue-repository.spec.ts
- [ ] T017 [P] [US1] Create tour service unit tests in src/lib/services/tours/tour-service.spec.ts (test business logic, validation)
- [ ] T018 [P] [US1] Create venue service unit tests in src/lib/services/tours/venue-service.spec.ts
- [ ] T019 [P] [US1] Create E2E test for tour creation flow in e2e/tests/tours/admin-tour-create.spec.ts
- [ ] T020 [P] [US1] Create E2E test for tour edit flow in e2e/tests/tours/admin-tour-edit.spec.ts
- [ ] T021 [P] [US1] Create E2E test for tour delete flow in e2e/tests/tours/admin-tour-delete.spec.ts

### Implementation for User Story 1

- [ ] T022 [P] [US1] Create tour Zod validation schema in src/lib/validations/tours/tour-schema.ts (title, dates, times, venue, headliners validation)
- [ ] T023 [P] [US1] Create venue Zod validation schema in src/lib/validations/tours/venue-schema.ts
- [ ] T024 [US1] Implement tour repository in src/lib/repositories/tours/tour-repository.ts (findAll, findById, create, update, delete with Prisma)
- [ ] T025 [P] [US1] Implement venue repository in src/lib/repositories/tours/venue-repository.ts
- [ ] T026 [US1] Implement tour service in src/lib/services/tours/tour-service.ts (business logic, validation, calls repository)
- [ ] T027 [P] [US1] Implement venue service in src/lib/services/tours/venue-service.ts
- [ ] T028 [US1] Create tour Server Actions in src/app/actions/tours.ts (createTour, updateTour, deleteTour, getTours, getTourById)
- [ ] T029 [P] [US1] Create venue Server Actions in src/app/actions/venues.ts (createVenue, getVenues)
- [ ] T030 [US1] Create admin tours list page at src/app/admin/tours/page.tsx (Server Component, fetch tours, display table)
- [ ] T031 [US1] Create tour form component in src/app/admin/tours/components/tour-form.tsx (React Hook Form + Zod, 'use client', all tour fields)
- [ ] T032 [P] [US1] Create venue selector component in src/app/admin/tours/components/venue-selector.tsx (shadcn Select dropdown with venues list, includes "+ Create New Venue" option that opens inline dialog form for quick venue creation)
- [ ] T033 [P] [US1] Create artist multi-select component in src/app/admin/tours/components/artist-multi-select.tsx (headliners selection with order)
- [ ] T034 [US1] Create new tour page at src/app/admin/tours/new/page.tsx (render TourForm in create mode)
- [ ] T035 [US1] Create edit tour page at src/app/admin/tours/[tourId]/edit/page.tsx (fetch tour data, render TourForm in edit mode)
- [ ] T036 [US1] Add auth protection to admin tour routes using Auth.js middleware
- [ ] T037 [US1] Run unit tests for US1 components and verify all pass: `pnpm run test -- tours`
- [x] T038 [US1] Run E2E tests for US1 and verify all pass: `pnpm run test:e2e -- admin-tour`
- [ ] T039 [US1] Manual testing: Create, edit, delete tours through admin UI, verify database persistence

**Checkpoint**: Admin tour CRUD fully functional - can create, edit, view, delete tours independently

---

## Phase 4: User Story 2 - Admin Uploads Tour Artwork (Priority: P2)

**Goal**: Admins can upload, preview, and manage multiple images for each tour using AWS S3 storage

**Independent Test**: Create or edit a tour, upload one or more images (JPEG, PNG), verify images appear in preview. Delete an image and verify removal. Create tour with 10 images (max limit). Verify images persist after save.

### Tests for User Story 2 (TDD - Write tests FIRST, ensure they FAIL) ⚠️

- [ ] T040 [P] [US2] Create image upload service unit tests in src/lib/services/tours/image-upload-service.spec.ts (test S3 presigned URL generation, upload validation, cleanup)
- [ ] T041 [P] [US2] Create image repository unit tests in src/lib/repositories/tours/image-repository.spec.ts (test findByTourId, create, delete, reorder)
- [ ] T042 [P] [US2] Create image upload component tests in src/app/admin/tours/components/tour-image-upload.spec.tsx (test file selection, upload flow, error handling)
- [ ] T043 [P] [US2] Create E2E test for image upload flow in e2e/tests/tours/admin-tour-image-upload.spec.ts

### Implementation for User Story 2

- [ ] T044 [P] [US2] Create image upload Zod validation schema in src/lib/validations/tours/image-schema.ts (file type, size, max images validation)
- [ ] T045 [US2] Implement image repository in src/lib/repositories/tours/image-repository.ts (findByTourId, create, delete, updateDisplayOrder)
- [ ] T046 [US2] Implement S3 image upload service in src/lib/services/tours/image-upload-service.ts (presigned URLs, upload, delete from S3)
- [ ] T047 [US2] Create image upload Server Actions in src/app/actions/tour-images.ts (generateUploadUrl, confirmUpload, deleteImage, reorderImages)
- [ ] T048 [US2] Create image upload component in src/app/admin/tours/components/tour-image-upload.tsx ('use client', file input, preview, drag-drop, progress)
- [ ] T049 [US2] Create image gallery component in src/app/admin/tours/components/tour-image-gallery.tsx (display uploaded images, delete, reorder)
- [ ] T050 [US2] Integrate tour-image-upload component into tour-form.tsx (add image upload section)
- [ ] T051 [US2] Add cascade delete for images in tour repository delete method (cleanup orphaned S3 files)
- [ ] T052 [US2] Add environment variable validation for AWS credentials in image-upload-service.ts
- [ ] T053 [US2] Run unit tests for US2 and verify all pass: `pnpm run test -- image`
- [ ] T054 [US2] Run E2E test for US2 and verify passes: `pnpm run test:e2e -- admin-tour-image`
- [ ] T055 [US2] Manual testing: Upload various image types/sizes, verify S3 storage, test max limit, verify cleanup on delete

**Checkpoint**: Image upload fully functional - can upload, view, delete images for tours independently

---

## Phase 5: User Story 3 - Public Views Tours by Date (Priority: P3)

**Goal**: Public visitors can view all tours sorted chronologically (most recent first) with complete details including images and artist names with fallback logic

**Independent Test**: Navigate to /tours as unauthenticated user, verify tours display sorted by most recent date first. Click on a tour to view full details including description, notes, all images, and computed artist display names.

### Tests for User Story 3 (TDD - Write tests FIRST, ensure they FAIL) ⚠️

- [ ] T056 [P] [US3] Create tour list component tests in src/app/tours/components/tour-list.spec.tsx (test rendering, sorting, empty state)
- [ ] T057 [P] [US3] Create tour card component tests in src/app/tours/components/tour-card.spec.tsx (test display, artist names, images)
- [ ] T058 [P] [US3] Create E2E test for public tours display in e2e/tests/tours/public-tours-display.spec.ts (test sorting, navigation, responsive design)
- [ ] T059 [P] [US3] Create artist display name utility tests in src/lib/utils/artist-display-name.spec.ts (test all fallback scenarios)

### Implementation for User Story 3

- [ ] T060 [P] [US3] Create tour list component in src/app/tours/components/tour-list.tsx (Server Component, receives tours prop, renders cards)
- [ ] T061 [P] [US3] Create tour card component in src/app/tours/components/tour-card.tsx (displays tour summary with image, venue, dates, headliners)
- [ ] T062 [P] [US3] Create tour detail component in src/app/tours/components/tour-detail.tsx (full tour information, all images, description, notes)
- [ ] T063 [US3] Create public tours page at src/app/tours/page.tsx (Server Component, fetch tours sorted by startDate desc, render TourList)
- [ ] T064 [US3] Create individual tour page at src/app/tours/[tourId]/page.tsx (Server Component, fetch tour by ID, render TourDetail)
- [ ] T065 [US3] Update tour repository findAll to sort by startDate descending by default in src/lib/repositories/tours/tour-repository.ts
- [ ] T066 [US3] Apply artist display name utility to tour headliners in tour service getTourById and listTours methods
- [ ] T067 [US3] Add responsive styling with Tailwind CSS to tour-card and tour-list components (mobile-first)
- [ ] T068 [US3] Add skeleton loaders for tours page in src/app/tours/loading.tsx
- [ ] T069 [US3] Run unit tests for US3 components and verify all pass: `pnpm run test -- tours/components`
- [ ] T070 [US3] Run E2E test for US3 and verify passes: `pnpm run test:e2e -- public-tours`
- [ ] T071 [US3] Manual testing: View tours page on desktop/tablet/mobile, verify sorting, click through to details, verify all data displays correctly

**Checkpoint**: Public tour display fully functional - visitors can browse and view tour details independently

---

## Phase 6: User Story 4 - Public Searches for Tours (Priority: P4)

**Goal**: Public visitors can search for tours by artist name with real-time filtering while maintaining chronological sort

**Independent Test**: Navigate to /tours, enter an artist name in search field, verify only matching tours display. Clear search and verify all tours return. Search for partial name and verify matches work.

### Tests for User Story 4 (TDD - Write tests FIRST, ensure they FAIL) ⚠️

- [ ] T072 [P] [US4] Create tour search component tests in src/app/tours/components/tour-search.spec.tsx (test input, filtering, debounce, clear)
- [ ] T073 [P] [US4] Create E2E test for tour search flow in e2e/tests/tours/public-tours-search.spec.ts (test search, results, clear, no results)

### Implementation for User Story 4

- [ ] T074 [US4] Create tour search component in src/app/tours/components/tour-search.tsx ('use client', controlled input, debounced filter, clear button)
- [ ] T075 [US4] Add client-side search state management to tours page using useState/useMemo (filter tours by artist name)
- [ ] T076 [US4] Update tours page to hybrid: Server Component wrapper with Client Component for search (src/app/tours/page.tsx uses 'use client' section or separate client wrapper)
- [ ] T077 [US4] Create client tours page wrapper in src/app/tours/components/tours-page-client.tsx ('use client', receives tours, implements search filtering)
- [ ] T078 [US4] Implement case-insensitive partial match search logic in tours-page-client.tsx (filter tours where any headliner displayName includes search term)
- [ ] T079 [US4] Add "No tours found" empty state component in src/app/tours/components/tours-empty-state.tsx
- [ ] T080 [US4] Add ARIA labels and keyboard navigation to search component for accessibility
- [ ] T081 [US4] Run unit tests for US4 and verify all pass: `pnpm run test -- tour-search`
- [x] T082 [US4] Run E2E test for US4 and verify passes: `pnpm run test:e2e -- public-tours-search`
- [ ] T083 [US4] Manual testing: Search for various artist names, partial names, verify filtering, test case-insensitivity, verify empty state

**Checkpoint**: Search functionality fully operational - visitors can filter tours by artist name independently

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final quality checks

- [ ] T084 [P] Add JSDoc comments to complex business logic functions in services and repositories
- [ ] T085 [P] Run ESLint and fix all warnings: `pnpm run lint`
- [ ] T086 [P] Run Prettier to format all code: `pnpm run format`
- [ ] T087 [P] Verify MPL 2.0 license headers are present in all new source files
- [ ] T088 Add error boundaries for tour components in src/app/tours/error.tsx and src/app/admin/tours/error.tsx
- [ ] T089 [P] Add loading states and skeleton screens for all async operations
- [ ] T089.5 [P] Implement tour listing caching strategy using Next.js revalidation (revalidateTag or time-based revalidation) with stale-while-revalidate pattern for /tours page
- [ ] T090 [P] Optimize tour list query with proper Prisma includes/selects to reduce overfetching
- [ ] T091 [P] Add database indexes per data-model.md indexing strategy (verify in Prisma schema)
- [ ] T092 [P] Implement tour image lazy loading with Next.js Image component optimization
- [ ] T093 [P] Add proper alt text handling for accessibility in all tour image displays
- [ ] T094 Verify WCAG 2.1 compliance for all tour pages (keyboard navigation, color contrast, ARIA labels)
- [ ] T095 Review and refactor duplicated code between admin and public tour components
- [ ] T096 Performance testing: Verify tours page loads in <3s with 200 tours
- [ ] T097 Performance testing: Verify image uploads complete in <10s for 10MB files
- [ ] T098 Performance testing: Verify search response <500ms
- [ ] T099 Run full test suite and verify 90-95%+ coverage: `pnpm run test:coverage`
- [x] T100 Run all E2E tests and verify all pass: `pnpm run test:e2e`
- [ ] T101 Follow quickstart.md validation steps to verify complete feature functionality
- [ ] T102 [P] Update README.md with tour management feature documentation
- [ ] T103 Security review: Verify all admin routes protected, input sanitization, S3 presigned URL expiry
- [ ] T104 Create seed data script for tours in prisma/seed.ts (sample tours for development/testing)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - Core CRUD, no dependencies on other stories
- **User Story 2 (Phase 4)**: Depends on User Story 1 (needs tours to exist for image upload) - Can start after US1 T039 checkpoint
- **User Story 3 (Phase 5)**: Depends on User Story 1 (needs tours to display) - Can start after US1 T039 checkpoint, **independent of US2**
- **User Story 4 (Phase 6)**: Depends on User Story 3 (needs public display to add search) - Can start after US3 T071 checkpoint
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies Graph

```
Phase 1: Setup
    ↓
Phase 2: Foundational (BLOCKS ALL STORIES)
    ↓
    ├──→ Phase 3: User Story 1 (P1) - Admin CRUD [INDEPENDENT]
            ↓
            ├──→ Phase 4: User Story 2 (P2) - Image Upload [depends on US1]
            └──→ Phase 5: User Story 3 (P3) - Public Display [depends on US1, INDEPENDENT of US2]
                    ↓
                    └──→ Phase 6: User Story 4 (P4) - Search [depends on US3]
```

### Within Each User Story

1. **Tests FIRST** (TDD - non-negotiable): Write all tests, verify they FAIL
2. **Models/Schemas**: Validation schemas, TypeScript types
3. **Data Access**: Repository layer with Prisma
4. **Business Logic**: Service layer
5. **API Layer**: Server Actions
6. **UI Components**: React components
7. **Pages**: Next.js pages/routes
8. **Verify Tests PASS**: Run tests, verify all pass
9. **Manual Testing**: QA the story
10. **Checkpoint**: Story complete and independently deployable

### Parallel Opportunities Within Phases

**Phase 2 (Foundational)**: T009, T010, T011 can run parallel (different files)

**Phase 3 (User Story 1) - Tests**: T013-T021 all parallel (different test files)

**Phase 3 (User Story 1) - Implementation**:

- T022, T023 parallel (different validation files)
- T024, T025 parallel after validation complete (different repositories)
- T026, T027 parallel after repositories complete (different services)
- T028, T029 parallel after services complete (different action files)
- T032, T033 parallel (different component files)

**Phase 4 (User Story 2) - Tests**: T040-T043 all parallel (different test files)

**Phase 4 (User Story 2) - Implementation**: T044, T045, T046 can start in parallel (validation, repository, service are independent files)

**Phase 5 (User Story 3) - Tests**: T056-T059 all parallel (different test files)

**Phase 5 (User Story 3) - Implementation**: T060, T061, T062 all parallel (different component files)

**Phase 6 (User Story 4) - Tests**: T072, T073 parallel (different test files)

**Phase 7 (Polish)**: Many tasks parallel (T084-T087, T089-T093, T102)

### Critical Path (Sequential Dependencies)

1. T005 → T006 → T007 → T008 (Prisma schema → migration)
2. T022 → T024 → T026 → T028 → T030 (validation → repository → service → actions → page)
3. T044 → T045 → T046 → T047 → T048 (image validation → repo → service → actions → component)
4. T060 → T063 (tour list component → tours page)
5. T074 → T077 (search component → integrate into page)

---

## Parallel Execution Examples

### User Story 1 - Parallel Test Creation

```bash
# After Foundational phase complete, launch all US1 tests together:
- T013: tour-schema.spec.ts
- T014: venue-schema.spec.ts
- T015: tour-repository.spec.ts
- T016: venue-repository.spec.ts
- T017: tour-service.spec.ts
- T018: venue-service.spec.ts
- T019: admin-tour-create.spec.ts (E2E)
- T020: admin-tour-edit.spec.ts (E2E)
- T021: admin-tour-delete.spec.ts (E2E)
```

### User Story 1 - Parallel Component Development

```bash
# After services complete, launch component tasks in parallel:
- T032: venue-selector.tsx
- T033: artist-multi-select.tsx
```

### Multiple User Stories in Parallel (if team capacity)

```bash
# After US1 T039 checkpoint (US1 complete):
Team Member A: Start Phase 4 (User Story 2 - Images)
Team Member B: Start Phase 5 (User Story 3 - Public Display)
# US2 and US3 both depend on US1, but are independent of each other
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete **Phase 1**: Setup (T001-T004)
2. Complete **Phase 2**: Foundational (T005-T012) - **CRITICAL BLOCKER**
3. Complete **Phase 3**: User Story 1 (T013-T039)
4. **STOP and VALIDATE**:
   - Run `pnpm run test -- tours` (unit tests)
   - Run `pnpm run test:e2e -- admin-tour` (E2E tests)
   - Manual QA: Create/edit/delete tours via admin UI
5. **MVP Ready**: Admin can fully manage tours (no images, no public display yet)

### Incremental Delivery

1. **Foundation** (Phase 1 + 2) → Database schema ready, utilities available
2. **+User Story 1** (Phase 3) → Admin CRUD functional → **Deploy/Demo MVP!**
3. **+User Story 2** (Phase 4) → Image upload functional → **Deploy/Demo Enhanced Admin!**
4. **+User Story 3** (Phase 5) → Public can view tours → **Deploy/Demo Public Feature!**
5. **+User Story 4** (Phase 6) → Search functional → **Deploy/Demo Complete Feature!**
6. **Polish** (Phase 7) → Production-ready quality

Each increment is independently testable and deployable.

### Parallel Team Strategy

With 2-3 developers:

1. **Everyone together**: Complete Phase 1 + Phase 2 (T001-T012)
2. **Checkpoint**: Foundation complete, branch/merge
3. **Parallel work after US1**:
   - **Developer A**: Phase 4 (User Story 2 - Images)
   - **Developer B**: Phase 5 (User Story 3 - Public Display)
   - US2 and US3 are independent implementations
4. **Developer from US2 or US3**: Start Phase 6 (User Story 4) after US3 completes
5. **Everyone**: Phase 7 (Polish) together

---

## Test Coverage Goals

Per Principle III (TDD - Non-negotiable):

- **Overall coverage**: 90-95%+ on all testable files
- **Repository layer**: 95%+ (T015, T016, T041, etc.)
- **Service layer**: 90%+ (T017, T018, T040, etc.)
- **Validation schemas**: 100% (T013, T014, T044, etc.)
- **Utility functions**: 95%+ (T012, T059, etc.)
- **Components**: 85%+ (T042, T056, T057, T072, etc.)
- **E2E critical flows**: 100% coverage of happy paths (T019-T021, T043, T058, T073, etc.)

Run coverage check: `pnpm run test:coverage`

Exclude from coverage:

- Configuration files
- Type definitions (tour-types.ts)
- Prisma schema files
- Next.js config files

---

## Notes

- **[P] marker** = Tasks operate on different files with no inter-task dependencies, safe for parallel execution
- **[Story] label** = Maps task to specific user story for traceability and independent delivery
- **TDD approach** = All test tasks MUST be completed before implementation tasks in that story
- **Verify tests FAIL** = Before implementing, run tests to ensure they fail (proves tests are testing something)
- **Checkpoint validation** = At each story completion checkpoint, independently test that story works without other stories
- **File paths** = Exact paths provided for every task to eliminate ambiguity
- **MPL 2.0 license** = Add header from HEADER.txt to all new .ts, .tsx, .js files
- **Commit strategy** = Commit after each task or logical group (e.g., all tests for a story, then implementation)
- **Branch strategy** = Work on feature branch `develop/feature/tours`, merge to main after validation

---

## Constitution Compliance Checklist

Verify throughout implementation:

- ✅ **Principle I**: TypeScript strict mode, no `any` types, explicit types everywhere
- ✅ **Principle II**: Server Components default, `'use client'` only for interactive, Server Actions for mutations
- ✅ **Principle III**: TDD with 90-95%+ coverage (tests written first, all pass)
- ✅ **Principle IV**: Auth.js protection on admin routes, Zod validation, input sanitization, secure S3
- ✅ **Principle V**: Code splitting, Next.js Image, memoization, efficient queries, caching
- ✅ **Principle VI**: Clear separation (models/services/components), DRY, absolute imports, ESLint/Prettier
- ✅ **Principle VII**: Semantic HTML, ARIA labels, keyboard nav, alt text, responsive design, shadcn/ui

Reference: `.specify/memory/constitution.md`
