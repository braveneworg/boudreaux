# Tasks: Release Digital Formats Management

**Feature**: `004-release-digital-formats`
**Branch**: `004-release-digital-formats`
**Input**: Design documents from `/specs/004-release-digital-formats/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

---

## Format: `- [ ] [ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- All tasks include exact file paths for implementation

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and environment configuration

- [x] T001 Update environment variables in .env.example with AWS_S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
- [x] T002 [P] Add AWS SDK S3 dependencies to package.json (@aws-sdk/client-s3, @aws-sdk/s3-request-presigner)
- [x] T003 [P] Create digital format constants file at src/lib/constants/digital-formats.ts with FORMAT_SIZE_LIMITS, FORMAT_MIME_TYPES, MAX_FREE_DOWNLOAD_QUOTA, SOFT_DELETE_GRACE_PERIOD_DAYS, PRESIGNED_URL_EXPIRATION

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Update Prisma schema in prisma/schema.prisma: add ReleaseDigitalFormat model (id, releaseId, formatType, s3Key, fileName, fileSize BigInt, mimeType, checksum, deletedAt, uploadedAt, unique constraint [releaseId, formatType], indexes)
- [x] T005 Update Prisma schema in prisma/schema.prisma: add UserDownloadQuota model (id, userId @unique, uniqueReleaseIds String[] @db.Array(ObjectId), indexes)
- [x] T006 Update Prisma schema in prisma/schema.prisma: add DownloadEvent model (id, userId nullable, releaseId, formatType, success Boolean, errorCode, ipAddress, userAgent, downloadedAt, indexes)
- [x] T007 Update Prisma schema in prisma/schema.prisma: modify Release model to add suggestedPrice Int? (price in cents) and digitalFormats back-relation
- [x] T008 Update Prisma schema in prisma/schema.prisma: modify User model to add userDownloadQuotas and downloadEvents back-relations
- [x] T009 Run prisma generate to update Prisma Client types
- [x] T010 Run prisma db push to apply schema changes to MongoDB
- [x] T011 Update seed script in prisma/seed.ts to add sample ReleaseDigitalFormat records for development testing
- [x] T012 [P] Create TypeScript types file at src/types/digital-format.ts with DigitalFormatType, UploadState, DownloadAuthorizationResponse interfaces
- [x] T013 [P] Extend S3 client utilities in src/lib/utils/s3-client.ts to add generatePresignedUploadUrl and generatePresignedDownloadUrl methods for audio files

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Admin Uploads Digital Format (Priority: P1) 🎯 MVP

**Goal**: Enable admins to upload digital audio files (MP3, FLAC, WAV, AAC) via accordion UI with automatic secure URL generation and checkmark indicators

**Independent Test**: Admin logs in, navigates to release edit page, expands accordion format item, uploads valid audio file, sees checkmark indicator appear within 10 seconds

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Create unit test file at src/lib/validation/digital-format-schema.spec.ts to test format-specific size limit validation (MP3/AAC 100MB, FLAC 250MB, WAV 500MB) with Zod schema
- [x] T015 [P] [US1] Create unit test file at src/lib/repositories/release-digital-format-repository.spec.ts to test CRUD operations, soft delete queries, unique constraint enforcement
- [x] T016 [P] [US1] Create unit test file at src/lib/services/upload-service.spec.ts to test file validation logic, S3 presigned URL generation, metadata creation
- [x] T017 [P] [US1] Create component test file at src/app/components/forms/digital-formats-accordion.spec.tsx to test accordion UI rendering, file input interaction, checkmark indicator visibility
- [x] T018 [P] [US1] Create E2E test file at e2e/tests/admin-upload-digital-formats.spec.ts to test full admin upload flow: login → navigate to release → expand accordion → upload file → verify checkmark

### Implementation for User Story 1

- [x] T019 [P] [US1] Create Zod validation schema at src/lib/validation/digital-format-schema.ts with discriminated union for format-specific size and MIME type validation
- [x] T020 [P] [US1] Create ReleaseDigitalFormatRepository at src/lib/repositories/release-digital-format-repository.ts with methods: create, findByReleaseAndFormat, findAllByRelease, softDelete, updateS3Key
- [x] T021 [US1] Create UploadService at src/lib/services/upload-service.ts with validateFileInfo, generatePresignedUploadUrl, and createFormatMetadata methods
- [x] T022 [US1] Create uploadDigitalFormatAction Server Action at src/lib/actions/upload-digital-format-action.ts with Zod validation, UploadService coordination, Prisma create
- [x] T023 [US1] Create confirmDigitalFormatUploadAction Server Action at src/lib/actions/confirm-upload-action.ts to verify S3 object exists and create ReleaseDigitalFormat record
- [x] T024 [US1] Create DigitalFormatsAccordion component at src/app/components/forms/digital-formats-accordion.tsx with shadcn/ui Accordion, file upload handlers, checkmark indicators (CheckCircle icon), upload progress state
- [x] T025 [US1] Modify release edit page at src/app/admin/releases/[releaseId]/page.tsx to integrate DigitalFormatsAccordion component
- [x] T026 [US1] Add upload error handling and user feedback messages to DigitalFormatsAccordion component with role="alert" for accessibility

**Checkpoint**: Admin can now successfully upload digital formats with visual confirmation

---

## Phase 4: User Story 2 - User Downloads Purchased Release (Priority: P2)

**Goal**: Enable users who have purchased a release to access unique download URLs for each available digital format with secure authorization and download event tracking

**Independent Test**: Create purchase record for user and release, navigate to release page as that user, click download link, verify file downloads successfully and event is logged

### Tests for User Story 2

- [x] T027 [P] [US2] Create unit test file at src/lib/repositories/download-event-repository.spec.ts to test logging methods, analytics queries
- [x] T028 [P] [US2] Create unit test file at src/lib/services/download-authorization-service.spec.ts to test purchase verification, presigned URL generation, grace period logic
- [x] T029 [P] [US2] Create E2E test file at e2e/tests/user-download-purchased.spec.ts to test full download flow: create purchase → login as user → navigate to release → click download → verify file received

### Implementation for User Story 2

- [x] T030 [P] [US2] Create DownloadEventRepository at src/lib/repositories/download-event-repository.ts with methods: logDownloadEvent, getAnalyticsByRelease, getAnalyticsByUser
- [x] T031 [US2] Create DownloadAuthorizationService at src/lib/services/download-authorization-service.ts with checkPurchaseStatus, checkSoftDelete, generateDownloadUrl methods
- [x] T032 [US2] Create download authorization API route at src/app/api/releases/[releaseId]/download/[formatType]/route.ts with 8-step auth logic: authenticate → format exists → purchase check → quota check → soft delete grace period → generate URL → log event → return JSON, with explicit error handling (410 Gone for expired URLs, 404 for invalid format/release combinations, 401 Unauthorized, 403 Quota Exceeded)
- [x] T033 [US2] Add download button component to release page (exact path depends on existing structure) with onClick handler calling download authorization endpoint
- [x] T034 [US2] Add client-side download logic: fetch signed URL from authorization endpoint, trigger browser download via anchor tag with href set to signed URL

**Checkpoint**: Purchased release downloads are now fully functional with authorization and logging

---

## Phase 5: User Story 3 - Freemium Quota Enforcement (Priority: P2)

**Goal**: Enforce 5 free unique release download limit for non-purchasing users with atomic quota tracking and clear user messaging

**Independent Test**: Create new user account, download 5 different releases without purchasing, attempt 6th download, verify blocked with contact support message

### Tests for User Story 3

- [x] T035 [P] [US3] Create unit test file at src/lib/repositories/user-download-quota-repository.spec.ts to test atomic unique release tracking with $addToSet, quota enforcement logic
- [x] T036 [P] [US3] Create unit test file at src/lib/services/quota-enforcement-service.spec.ts to test 5-download cap, unique release Set operations, quota exceeded detection
- [ ] T037 [P] [US3] Create E2E test file at e2e/tests/freemium-quota-enforcement.spec.ts to test quota flow: login → download 5 unique releases → attempt 6th → verify blocked with message

### Implementation for User Story 3

- [x] T038 [P] [US3] Create UserDownloadQuotaRepository at src/lib/repositories/user-download-quota-repository.ts with methods: findOrCreateByUserId, addUniqueRelease (using $addToSet), checkQuotaExceeded
- [x] T039 [US3] Create QuotaEnforcementService at src/lib/services/quota-enforcement-service.ts with checkFreeDownloadQuota, incrementQuota methods using Set for O(1) unique checks
- [x] T040 [US3] Integrate QuotaEnforcementService into download authorization API route at src/app/api/releases/[releaseId]/download/[formatType]/route.ts (add quota check step between purchase check and URL generation)
- [x] T041 [US3] Add quota exceeded error handling to download authorization endpoint: return 403 with QUOTA_EXCEEDED error code and contactSupportUrl
- [x] T042 [US3] Update download button UI to display disabled state with explanatory message when quota exceeded (fetch quota status before rendering button)

**Checkpoint**: Freemium download limit is now enforced with clear user feedback

---

## Phase 6: User Story 4 - Admin Sets Suggested Price (Priority: P3)

**Goal**: Allow admins to set optional suggested PWYW price for releases to guide purchase decisions

**Independent Test**: Edit release in admin panel, enter suggested price value, save, verify it appears in purchase interface

### Tests for User Story 4

- [x] T043 [P] [US4] Create unit test file at src/lib/validation/release-form-schema.spec.ts to test suggestedPrice Decimal validation (optional, positive number, max 2 decimal places)
- [x] T044 [P] [US4] Create component test file at src/app/components/forms/release-form.spec.tsx to test suggested price input field rendering, validation messages

### Implementation for User Story 4

- [x] T045 [P] [US4] Update Zod schema for release form validation to include suggestedPrice field (optional Decimal, positive, 2 decimal places max)
- [x] T046 [US4] Modify release form component at src/app/components/forms/release-form.tsx to add suggested price input field with proper labels and validation error display
- [x] T047 [US4] Update release create/update Server Actions to handle suggestedPrice field (persist to Release.suggestedPrice)
- [x] T048 [US4] Verify suggested price displays in existing PWYW purchase interface (exact location depends on feature 003 implementation)

**Checkpoint**: Suggested pricing is now configurable by admins

---

## Phase 7: User Story 5 - Admin Views Download Analytics (Priority: P3)

**Goal**: Provide admins with download analytics showing total counts, format breakdowns, and user engagement per release

**Independent Test**: Generate several download events for a release, navigate to analytics view, verify accurate counts and format breakdowns displayed

### Tests for User Story 5

- [x] T049 [P] [US5] Create unit test file at src/app/api/releases/[releaseId]/download-analytics/route.spec.ts to test analytics aggregation logic, date range filtering, format breakdown calculations
- [ ] T050 [P] [US5] Create component test file at src/app/components/download-analytics-dashboard.spec.tsx to test data visualization, date range picker, format breakdown table

### Implementation for User Story 5

- [x] T051 [P] [US5] Create download analytics API route at src/app/api/releases/[releaseId]/download-analytics/route.ts with admin auth check, DownloadEventRepository aggregation queries, date range filtering
- [x] T052 [US5] Add analytics query methods to DownloadEventRepository: getDownloadCountsByFormat, getUniqueUserCount, getTotalDownloads with date range parameters
- [x] T053 [US5] Create analytics dashboard component at src/app/components/download-analytics-dashboard.tsx displaying total downloads, unique users, format breakdown table, date range picker
- [ ] T054 [US5] Integrate analytics dashboard into admin release view (exact location depends on existing admin UI structure)

**Checkpoint**: Download analytics are now available to admins

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T055 [P] Create deleteDigitalFormatAction Server Action at src/lib/actions/delete-digital-format-action.ts with soft delete logic (set deletedAt timestamp)
- [ ] T056 [P] Create replaceDigitalFormatAction Server Action at src/lib/actions/replace-digital-format-action.ts with file replacement and 30-day archive logic
- [ ] T057 [P] Add soft delete UI to DigitalFormatsAccordion component: delete button per format with confirmation dialog
- [ ] T058 [P] Add JSDoc comments to all repositories, services, and Server Actions documenting parameters, return types, and complex logic
- [ ] T059 [P] Add error logging to all Server Actions and API routes using existing logging infrastructure
- [ ] T060 [P] Verify WCAG 2.1 AA accessibility: test keyboard navigation in accordion, screen reader announcements for upload success/failure, focus management
- [ ] T061 [P] Add rate limiting to download authorization endpoint (100 requests per minute per user) using existing rate limiting infrastructure
- [ ] T062 [P] Update documentation: add quickstart.md usage instructions to main README.md
- [ ] T063 [P] Add MPL 2.0 license headers to all new source files per HEADER.txt template and Constitution IV compliance (repositories, services, actions, components, API routes, validation schemas, types)
- [ ] T064 [P] Create user support mechanism for download issues: add contact support link/button to download error states with clear guidance (email, support form, or chat widget per FR-018)
- [ ] T065 Run full test suite: pnpm run test:run (verify 90-95% coverage target met)
- [ ] T066 Run E2E test suite: pnpm run test:e2e (verify all user stories pass end-to-end)
- [ ] T067 Run linting and formatting: pnpm run lint && pnpm run format
- [ ] T068 Validate with quickstart.md checklist: verify all manual testing steps pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - MVP starting point
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) - Can proceed after US1 for logical flow, but technically independent
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) AND User Story 2 (Phase 4) - Requires download authorization endpoint from US2
- **User Story 4 (Phase 6)**: Depends on Foundational (Phase 2) - Independent of other user stories
- **User Story 5 (Phase 7)**: Depends on Foundational (Phase 2) AND User Story 2 (Phase 4) - Requires DownloadEvent logging from US2
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - **No dependencies on other stories**
- **User Story 2 (P2)**: Can start after Foundational - Integrates with US1 (reads ReleaseDigitalFormat records) but independently testable
- **User Story 3 (P2)**: **Depends on User Story 2** - Extends download authorization endpoint with quota checks
- **User Story 4 (P3)**: Can start after Foundational - **No dependencies on other stories**
- **User Story 5 (P3)**: **Depends on User Story 2** - Requires DownloadEvent records created by download authorization

### Critical Path for MVP (User Story 1 only)

```
Setup (T001-T003) → Foundational (T004-T013) → US1 Tests (T014-T018) → US1 Implementation (T019-T026)
```

**Estimated MVP Time**: 2-3 days for experienced developer (assuming 8 tasks/day average)

### Recommended Implementation Order (All User Stories)

**Week 1**: Setup + Foundational + User Story 1 (P1)

- Day 1: T001-T013 (Setup + Foundational database schema)
- Day 2-3: T014-T026 (US1 Tests + Implementation)

**Week 2**: User Story 2 (P2) + User Story 3 (P2)

- Day 4-5: T027-T034 (US2 Tests + Implementation - download authorization)
- Day 6-7: T035-T042 (US3 Tests + Implementation - quota enforcement)

**Week 3**: User Story 4 (P3) + User Story 5 (P3) + Polish

- Day 8: T043-T048 (US4 Tests + Implementation - suggested price)
- Day 9-10: T049-T054 (US5 Tests + Implementation - analytics)
- Day 11: T055-T066 (Polish + Validation)

**Total Estimated Time**: 11 days (2.2 weeks) for full feature completion

### Parallel Opportunities

#### Within Setup (Phase 1)

```bash
# Run in parallel (different files):
T002 (package.json) || T003 (constants file)
```

#### Within Foundational (Phase 2)

```bash
# Run in parallel after schema updates (T004-T008):
T012 (types) || T013 (S3 client)
```

#### Within User Story 1

```bash
# All tests can run in parallel (after setup):
T014 (validation tests) || T015 (repository tests) || T016 (service tests) || T017 (component tests) || T018 (E2E tests)

# Implementation parallelization:
T019 (Zod schema) || T020 (repository)  # Different concerns
T021 (service) depends on T019, T020    # Needs both
```

#### Within User Story 2

```bash
# Tests in parallel:
T027 (repository tests) || T028 (service tests) || T029 (E2E tests)

# Implementation parallelization:
T030 (DownloadEventRepository) || T031 (DownloadAuthorizationService) can overlap if different developers
```

#### Within User Story 3

```bash
# Tests in parallel:
T035 (repository tests) || T036 (service tests) || T037 (E2E tests)

# Implementation parallelization:
T038 (repository) || T039 (service) can overlap
```

#### Within User Story 4

```bash
# Tests in parallel:
T043 (validation tests) || T044 (component tests)

# Implementation parallelization:
T045 (schema) || T046 (form component) can overlap
```

#### Within User Story 5

```bash
# Tests in parallel:
T049 (API route tests) || T050 (component tests)

# Implementation parallelization:
T051 (API route) || T052 (repository methods) || T053 (dashboard component) can overlap with careful coordination
```

#### Within Polish (Phase 8)

```bash
# Most polish tasks can run in parallel:
T055 (delete action) || T056 (replace action) || T057 (UI) || T058 (JSDoc) || T059 (logging) || T060 (accessibility) || T061 (rate limiting) || T062 (docs)
```

---

## Task Effort Estimates

### Setup Phase (1 day)

- T001: 15 min (environment variables)
- T002: 10 min (npm install)
- T003: 30 min (constants file with comments)

### Foundational Phase (1 day)

- T004-T008: 2 hours (Prisma schema updates - careful modeling)
- T009-T010: 15 min (Prisma generate + push)
- T011: 1 hour (seed data with realistic samples)
- T012: 1 hour (TypeScript interfaces)
- T013: 2 hours (S3 client methods)

### User Story 1 (2-3 days)

- T014-T018: 4 hours (test writing - TDD approach)
- T019: 1.5 hours (Zod discriminated union schema)
- T020: 2 hours (repository with CRUD + soft delete)
- T021: 2 hours (upload service with S3 coordination)
- T022: 1.5 hours (upload Server Action)
- T023: 1 hour (confirm upload Server Action)
- T024: 3 hours (accordion component with state management)
- T025: 30 min (integration into release edit page)
- T026: 1 hour (error handling + accessibility)

### User Story 2 (2 days)

- T027-T029: 3 hours (test writing)
- T030: 1.5 hours (DownloadEventRepository)
- T031: 2.5 hours (DownloadAuthorizationService - complex logic)
- T032: 3 hours (download authorization API route - 7 steps)
- T033-T034: 2 hours (download button + client-side logic)

### User Story 3 (1.5 days)

- T035-T037: 2.5 hours (test writing)
- T038: 2 hours (UserDownloadQuotaRepository with $addToSet)
- T039: 2 hours (QuotaEnforcementService with Set logic)
- T040: 1.5 hours (integration into authorization endpoint)
- T041: 30 min (error response handling)
- T042: 1.5 hours (quota exceeded UI state)

### User Story 4 (1 day)

- T043-T044: 1.5 hours (test writing)
- T045: 30 min (Zod schema update)
- T046: 1.5 hours (form input field)
- T047: 1 hour (Server Action update)
- T048: 1 hour (verification in purchase UI)

### User Story 5 (1.5 days)

- T049-T050: 2 hours (test writing)
- T051: 2 hours (analytics API route)
- T052: 1.5 hours (analytics repository queries)
- T053: 3 hours (analytics dashboard component with charts)
- T054: 1 hour (integration into admin UI)

### Polish Phase (1 day)

- T055-T057: 3 hours (delete/replace actions + UI)
- T058-T062: 3 hours (documentation + logging + accessibility + rate limiting)
- T063-T066: 1 hour (test runs + validation)

---

## Implementation Strategy

### MVP First (User Story 1 only)

For quickest time-to-value, implement **User Story 1 only** as MVP:

1. Complete Setup (Phase 1) - 1 day
2. Complete Foundational (Phase 2) - 1 day
3. Complete User Story 1 (Phase 3) - 2-3 days

**Total MVP Time**: 4-5 days
**Deliverable**: Admins can upload digital formats via accordion UI with checkmark indicators

### Incremental Delivery

After MVP, deliver in priority order:

1. **Sprint 1 (Week 1)**: User Story 1 ✅ MVP
2. **Sprint 2 (Week 2)**: User Story 2 + User Story 3 (complete purchase-to-download flow)
3. **Sprint 3 (Week 3)**: User Story 4 + User Story 5 + Polish (nice-to-have features)

This approach allows early user feedback on core functionality while deferring analytics and suggested pricing.

### Team Parallelization

If 2+ developers available:

- **Developer A**: Focus on backend (repositories, services, Server Actions, API routes)
- **Developer B**: Focus on frontend (components, forms, UI state management)
- **Sync point**: After foundational phase, coordinate on API contracts

With 2 developers, total time can be reduced to **6-8 days** (1.5-2 weeks).

---

## Validation Checklist

Before marking feature as complete, verify:

- [ ] All 68 tasks marked complete
- [ ] Test coverage ≥90% (run `pnpm run test:coverage`)
- [ ] All E2E tests pass (run `pnpm run test:e2e`)
- [ ] No ESLint or TypeScript errors (run `pnpm run lint`)
- [ ] Code formatted (run `pnpm run format`)
- [ ] All success criteria from spec.md met:
  - [ ] SC-001: Upload completes with checkmark in <10s
  - [ ] SC-002: Download completes in <30s for 100MB files
  - [ ] SC-003: 5 free download limit enforced with zero bypasses
  - [ ] SC-004: 95% upload success rate
  - [ ] SC-005: Download URLs are cryptographically secure (128-bit entropy)
  - [ ] SC-006: Clear error messages for 100% of upload failures
  - [ ] SC-007: Analytics accurate within 1 minute
  - [ ] SC-008: WCAG 2.1 AA compliance (keyboard nav, screen reader)
  - [ ] SC-009: Concurrent format management without conflicts
  - [ ] SC-010: Support request mechanism accessible
- [ ] All quickstart.md manual tests pass
- [ ] Constitution check still passing (all 7 principles)
- [ ] Documentation updated (README.md references new feature)
