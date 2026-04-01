# Tasks: PWYW Downloads — Post-Purchase Format Selection

**Input**: Design documents from `/specs/005-pwyw-downloads/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, contracts/bundle-api.md

**Tests**: Included — Constitution Principle III (TDD) is non-negotiable.

**Organization**: Tasks grouped by user story (US1 P1, US2 P2, US3 P3) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing project with all dependencies already installed from features 003 and 004.

- [x] T001 Verify branch `005-pwyw-downloads` is checked out and up to date with `main`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational work needed. All infrastructure exists from 003 (Stripe PWYW purchase, download tracking) and 004 (digital formats, bundle route, FormatBundleDownload component). No new Prisma models, no new dependencies, no new API routes.

**Checkpoint**: Foundation ready — proceed directly to user stories.

---

## Phase 3: User Story 1 — Post-Purchase Format Selection (Priority: P1) 🎯 MVP

**Goal**: After a PWYW purchase is confirmed, the `PurchaseSuccessStep` displays the `FormatBundleDownload` component (multi-select ToggleGroup) instead of the static legacy download link, allowing users to select formats and download a ZIP bundle.

**Independent Test**: Complete a PWYW purchase in the download dialog → verify the format picker appears with all available formats → select formats → click download → confirm ZIP contains correct directory structure.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T002 [P] [US1] Write tests for updated PurchaseSuccessStep rendering FormatBundleDownload in `src/app/components/purchase-success-step.spec.tsx` — test that when `availableFormats` is non-empty, FormatBundleDownload is rendered instead of the legacy download link; test fallback message when `availableFormats` is empty; test download count display
- [x] T003 [P] [US1] Write tests for updated DownloadDialog passing `availableFormats` and `downloadCount` props to PurchaseSuccessStep in `src/app/components/download-dialog.spec.tsx` — test that the `purchase-success` step receives the correct props from DownloadDialog state

### Implementation for User Story 1

- [x] T004 [US1] Update PurchaseSuccessStep interface and component to accept `availableFormats`, `releaseTitle`, `downloadCount` props and render FormatBundleDownload in `src/app/components/purchase-success-step.tsx` — replace the `<Link href="/api/releases/${releaseId}/download">` with `<FormatBundleDownload>` when `availableFormats.length > 0`; show fallback message when no formats available; keep confirmation messaging and download count info
- [x] T005 [US1] Update DownloadDialog to pass `availableFormats` and `downloadCount` to PurchaseSuccessStep in `src/app/components/download-dialog.tsx` — modify the `step === 'purchase-success'` render block to pass `availableFormats={availableFormats}`, `downloadCount={downloadCount}`, and `releaseTitle={releaseTitle}` props
- [x] T006 [US1] Verify T002 and T003 tests pass after implementation

**Checkpoint**: Post-purchase format selection is fully functional. New purchasers see the format picker and can download a ZIP bundle.

---

## Phase 4: User Story 2 — Returning Purchaser Format Selection (Priority: P2)

**Goal**: Guest returning purchasers (via `returning-download` step) see the `FormatBundleDownload` component instead of the legacy download link when `availableFormats.length > 0` and they are not at the download cap.

**Independent Test**: Sign out → open download dialog → select "Digital Download" → enter email of previous purchaser → verify "Welcome Back!" message with format picker (not legacy download link).

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [US2] Write tests for `returning-download` step rendering FormatBundleDownload instead of legacy download link in `src/app/components/download-dialog.spec.tsx` — test that when guest is not at cap and `availableFormats.length > 0`, FormatBundleDownload is shown; test that when `availableFormats` is empty, legacy link behavior is preserved; test that `guestAtCap` still shows the download limit message

### Implementation for User Story 2

- [x] T008 [US2] Update `returning-download` step in `src/app/components/download-dialog.tsx` — replace the `<Link href="/api/releases/${releaseId}/download">` block (lines 481-486) with `<FormatBundleDownload>` when `availableFormats.length > 0` and `!guestAtCap`; keep the download limit messaging for `guestAtCap`; add fallback to legacy link when no formats available
- [x] T009 [US2] Verify T007 tests pass after implementation

**Checkpoint**: Both new and returning purchasers (auth'd and guest) see the format picker consistently.

---

## Phase 5: User Story 3 — Legacy Download Route Deprecation (Priority: P3)

**Goal**: Replace the legacy `/api/releases/[id]/download` route with a 301 redirect to the release page. Update the purchase confirmation email to link to the release page instead of the legacy route.

**Independent Test**: Hit `/api/releases/[id]/download` directly → verify 301 redirect to `/releases/[id]`. Send a purchase confirmation email → verify the download link points to `/releases/[id]`.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [P] [US3] Write tests for legacy download route 301 redirect in `src/app/api/releases/[id]/download/route.spec.ts` — test that GET returns 301 with `Location: /releases/{id}`; test that the route no longer performs auth/purchase checks
- [x] T011 [P] [US3] Write tests for updated email download link in `src/lib/email/send-purchase-confirmation.spec.ts` — test that `downloadUrl` is constructed as `${baseUrl}/releases/${releaseId}` (not `/api/releases/${releaseId}/download`)

### Implementation for User Story 3

- [x] T012 [P] [US3] Replace the legacy download route with a 301 redirect in `src/app/api/releases/[id]/download/route.ts` — replace the entire GET handler with a simple 301 redirect from `/api/releases/[id]/download` to `/releases/[id]`; remove all auth, purchase, and download logic (it's handled by the bundle route now)
- [x] T013 [P] [US3] Update the download URL in purchase confirmation email in `src/lib/email/send-purchase-confirmation.ts` — change `downloadUrl` from `${baseUrl}/api/releases/${input.releaseId}/download` to `${baseUrl}/releases/${input.releaseId}` (line 48)
- [x] T014 [US3] Verify T010 and T011 tests pass after implementation

**Checkpoint**: All legacy download route references are deprecated. Email links point to the release page.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories.

- [x] T015 Run full test suite with `pnpm run test:run` and verify all tests pass
- [x] T016 Run coverage check with `pnpm run test:coverage` and verify 90-95%+ on modified files
- [x] T017 [P] Run linting with `pnpm run lint` and fix any violations
- [x] T018 [P] Run formatting with `pnpm run format` and fix any violations
- [x] T019 Run quickstart.md manual validation scenarios (post-purchase, returning purchaser, guest returning purchaser)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verify branch
- **Foundational (Phase 2)**: N/A — all infrastructure exists
- **US1 (Phase 3)**: Can start immediately — core feature
- **US2 (Phase 4)**: Can start after Phase 3 (shares `download-dialog.tsx`)
- **US3 (Phase 5)**: Can start in parallel with Phase 4 (different files)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories. Modifies `purchase-success-step.tsx` and `download-dialog.tsx` (purchase-success block).
- **US2 (P2)**: Depends on US1 completion (shared `download-dialog.tsx` file). Modifies `download-dialog.tsx` (returning-download block).
- **US3 (P3)**: Independent of US1/US2 (different files: `route.ts`, `send-purchase-confirmation.ts`). Can run in parallel with US2.

### Within Each User Story

- Tests MUST be written FIRST and FAIL before implementation (TDD)
- Implementation modifies existing components (no new files)
- Verify tests pass after implementation

### Parallel Opportunities

- **T002 + T003**: Both test tasks for US1 can run in parallel (different test files)
- **T010 + T011**: Both test tasks for US3 can run in parallel (different test files)
- **T012 + T013**: Both implementation tasks for US3 can run in parallel (different source files)
- **US2 + US3**: Can run in parallel (after US1 completes)
- **T017 + T018**: Lint and format can run in parallel

---

## Parallel Example: User Story 3

```bash
# Launch both test tasks in parallel (different files):
Task T010: "Write tests for legacy route redirect in src/app/api/releases/[id]/download/route.spec.ts"
Task T011: "Write tests for email link update in src/lib/email/send-purchase-confirmation.spec.ts"

# Launch both implementation tasks in parallel (different files):
Task T012: "Replace legacy route with 301 redirect in src/app/api/releases/[id]/download/route.ts"
Task T013: "Update email download URL in src/lib/email/send-purchase-confirmation.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Verify branch
2. Complete Phase 3: User Story 1 (post-purchase format selection)
3. **STOP and VALIDATE**: Test US1 independently — complete a purchase and verify format picker
4. Deploy/demo if ready — core value is delivered

### Incremental Delivery

1. US1 → Post-purchase format selection works → Deploy (MVP!)
2. US2 → Guest returning purchasers see format picker → Deploy
3. US3 → Legacy route deprecated, email links updated → Deploy
4. Each story adds value without breaking previous stories

### Sequential Strategy (Single Developer)

1. T001 → T002–T003 (parallel) → T004 → T005 → T006
2. T007 → T008 → T009
3. T010–T011 (parallel) → T012–T013 (parallel) → T014
4. T015 → T016 → T017–T018 (parallel) → T019

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD is non-negotiable per Constitution Principle III — write tests first
- No new Prisma models, no new dependencies, no new API routes
- Reuses existing `FormatBundleDownload` component and bundle API route from 004
- `download-dialog.tsx` is modified by both US1 and US2 — execute sequentially
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
