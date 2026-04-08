# Tasks: Banner & Notification Carousel

**Input**: Design documents from `/specs/006-banner-notification-carousel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Not explicitly requested in spec — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema, constants, and foundational utilities needed before any feature work

- [x] T001 Add `BannerNotification` model to `prisma/schema.prisma` with all 13 fields, unique constraint on slotNumber, and indexes per data-model.md
- [x] T002 Add `SiteSettings` model to `prisma/schema.prisma` with key/value fields for carousel config storage
- [x] T003 Add `bannerNotifications BannerNotification[]` relation (`@relation("bannerNotifications")`) to `User` model in `prisma/schema.prisma`
- [x] T004 Run `pnpm exec prisma db push` and `pnpm exec prisma generate` to sync schema
- [x] T005 Create banner slot constants in `src/lib/constants/banner-slots.ts` — `BANNER_SLOTS` array (5 entries with slotNumber and filename) and `BANNER_CDN_PATH` constant

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Validation, service, and server actions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create Zod validation schemas in `src/lib/validation/banner-notification-schema.ts` — slotNumber (1-5), content (max 500 chars), hex color regex, date range validation, repostedFromId ObjectId format
- [x] T007 Implement custom HTML sanitizer as Zod `.transform()` in `src/lib/validation/banner-notification-schema.ts` — allowlist `<strong>`, `<em>`, `<a>` (href only), strip all other tags/attributes
- [x] T008 Create `src/lib/utils/cloudfront-loader.ts` with `cloudfrontLoader` function for `next/image` — generates CDN URLs `${CDN_DOMAIN}/media/banners/${src}?w=${width}&q=${quality}&f=webp` (verify env var client availability)
- [x] T009 Implement `BannerNotificationService` in `src/lib/services/banner-notification-service.ts` — `getActiveBanners()` with 5-min TTL cache (day-granularity key), `upsertNotification()`, `deleteNotification()`, `searchNotifications(query, take)`, `getRotationInterval()`, `updateRotationInterval()`
- [x] T010 Implement server actions in `src/lib/actions/banner-notification-action.ts` — `createOrUpdateBannerNotificationAction` (FormData upsert via `useActionState`), `deleteBannerNotificationAction` (direct call), `updateRotationIntervalAction` (direct call), all with `requireRole('admin')` auth and path revalidation

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Visitor Views Rotating Banner Carousel (Priority: P1) 🎯 MVP

**Goal**: Public-facing carousel on home page with 5 rotating banners, counter-slide animation, touch swipe, keyboard nav, and auto-rotation

**Independent Test**: Load `http://localhost:3000`. Verify 5 banners auto-rotate with counter-slide animation, swipe works on touch, ArrowLeft/ArrowRight navigate slides.

### Implementation for User Story 1

- [x] T011 [US1] Create `GET /api/notification-banners` route in `src/app/api/notification-banners/route.ts` — returns all 5 banner slots with active notifications for current date + rotationInterval, per api-contracts.md response shape
- [x] T012 [US1] Build `BannerCarousel` client component in `src/app/components/banner-carousel.tsx` — Framer Motion `AnimatePresence` with `mode="popLayout"`, counter-slide variants (banner `x: dir * 100%`, notification `x: dir * -100%`), `drag="x"` swipe, keyboard ArrowLeft/ArrowRight, auto-rotation timer with configurable interval
- [x] T013 [US1] Implement `next/image` with `cloudfrontLoader` in `BannerCarousel` — `src` is bare filename, `fill` layout, `sizes="(min-width: 360px) 100vw"`, `priority` on first banner, `className="object-cover"`
- [x] T014 [US1] Add notification strip rendering in `BannerCarousel` — inline style for `color` (textColor) and `backgroundColor`, `dangerouslySetInnerHTML` for sanitized content, add `target="_blank"` and `rel="noopener noreferrer"` to `<a>` tags at render time
- [x] T015 [US1] Add ~1px white space styling to notification strip in `BannerCarousel` — `py-px` or `border-y border-white` per FR-011 using Tailwind classes
- [x] T016 [US1] Implement auto-rotation timer reset on manual navigation (swipe/keyboard) per FR-012
- [x] T017 [US1] Implement tab visibility handling in `BannerCarousel` — `document.visibilitychange` listener: notification strip animation pauses when hidden, banner index continues advancing, strip re-syncs on tab return per FR-013
- [x] T018 [US1] Add `aria-roledescription="carousel"`, `aria-label`, `role="group"` on slides, and screen-reader live region for current slide announcement in `BannerCarousel`
- [x] T019 [US1] Modify `src/app/page.tsx` — replace existing `<NotificationBanner>` import/usage with `<BannerCarousel>`, fetch banner data from API or server-side service, pass as props

**Checkpoint**: Public carousel is fully functional and testable independently

---

## Phase 4: User Story 2 — Admin Manages Banner-Notification Pairs (Priority: P2)

**Goal**: Admin interface for managing 5 banner slots with notification text, colors, dates, repost search, and rotation interval

**Independent Test**: Log in as admin, navigate to `/admin/notifications`, add notification text with styled HTML to slot 1, set colors and dates, save, verify it appears on home page.

### Implementation for User Story 2

- [x] T020 [US2] Create `GET /api/notification-banners/search` route in `src/app/api/notification-banners/search/route.ts` — admin-only search endpoint with `q` and `take` query params, returns matching past notifications per api-contracts.md
- [x] T021 [US2] Build `BannerSlotCard` client component in `src/app/admin/notifications/banner-slot-card.tsx` — CDN image thumbnail, content textarea, native `<input type="color">` for textColor and backgroundColor, `DatePicker` from `@/app/components/ui/datepicker` for displayFrom/displayUntil, save/delete buttons, form submission via `onSave` prop
- [x] T022 [US2] Build `NotificationSearch` combobox in `src/app/admin/notifications/notification-search.tsx` — `Popover + Command` (cmdk) with `shouldFilter={false}`, 300ms debounced API fetch to `/api/notification-banners/search`, loading/empty states, select populates parent form fields
- [x] T023 [US2] Build `RotationIntervalForm` in `src/app/admin/notifications/rotation-interval-form.tsx` — number input (3-15 seconds), save button calling `updateRotationIntervalAction`
- [x] T024 [US2] Replace `src/app/admin/notifications/page.tsx` — server component fetching all 5 banner slots with notifications, render 5 `BannerSlotCard` components + `RotationIntervalForm`, wire `createOrUpdateBannerNotificationAction` and `deleteBannerNotificationAction` as callbacks

**Checkpoint**: Admin can fully manage all 5 banner-notification pairs and rotation interval

---

## Phase 5: User Story 3 — Conditional Notification Strip Display (Priority: P3)

**Goal**: Notification strip only appears for slides that have active notifications; completely hidden when no slot has one

**Independent Test**: Configure 5 banners where slots 1-2 have no notifications and slots 3-5 do. Load home page, verify strip appears only on slides 3-5 and smoothly hides/shows during transitions.

### Implementation for User Story 3

- [x] T025 [US3] Add conditional strip rendering logic in `src/app/components/banner-carousel.tsx` — strip `motion.div` only renders when current slot has active notification, smooth appear/disappear animation via `AnimatePresence`
- [x] T026 [US3] Handle "no notifications at all" case in `BannerCarousel` — when zero slots have active notifications, hide the entire strip container (no empty space above banners) per FR-016
- [x] T027 [US3] Add smooth height transition for strip show/hide in `src/app/components/banner-carousel.tsx` — animate strip container height from 0 to auto when notification appears/disappears between slides

**Checkpoint**: All user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup deprecated files, verify integration, finalize

- [x] T028 [P] Remove deprecated `src/app/components/notification-banner.tsx` (448 lines)
- [x] T029 [P] Remove deprecated `src/app/components/forms/notification-banner-form.tsx` (2,382 lines)
- [x] T030 [P] Remove deprecated `src/lib/actions/notification-banner-action.ts` (678 lines)
- [x] T031 [P] Remove deprecated `src/lib/services/notification-banner-service.ts` (328 lines)
- [x] T032 [P] Remove deprecated `src/lib/validation/notification-banner-schema.ts` (210 lines)
- [x] T033 [P] Remove deprecated `src/lib/actions/process-notification-image-action.ts` (493 lines)
- [x] T034 [P] Remove deprecated `src/app/admin/notifications/notification-banner-list.tsx` (370 lines)
- [x] T035 [P] Remove deprecated `src/app/admin/notifications/new/page.tsx` (~30 lines)
- [x] T036 [P] Remove deprecated `src/app/admin/notifications/[notificationId]/page.tsx` (~30 lines)
- [x] T037 Update all broken imports across codebase after deprecated file removal
- [x] T038 Run `pnpm run lint` and fix any lint errors
- [x] T039 Run `pnpm run format` to ensure consistent formatting
- [x] T040 Run `pnpm run build` and resolve any build errors
- [x] T041 Run quickstart.md validation — verify public carousel and admin panel per quickstart.md verify steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must exist) — BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (Phase 3) and US2 (Phase 4) can proceed in parallel
  - US3 (Phase 5) depends on US1 (modifies the carousel component)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — no dependencies on other stories; can run in parallel with US1
- **User Story 3 (P3)**: Depends on US1 completion (modifies `banner-carousel.tsx` created in US1)

### Within Each User Story

- API routes before client components that consume them
- Core component structure before animation refinements
- Form components before page integration

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different models in same schema file — but sequential edit recommended)
- T006, T007 run sequentially (same file); T008 can run in parallel with them (different file)
- T011 and T020 can run in parallel (different API route files)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel (different component files, different routes)
- All T028-T036 file deletions can run in parallel

---

## Parallel Example: User Story 1 + User Story 2

```bash
# After Phase 2 is complete, launch in parallel:

# US1 — Public carousel
Task: "Create GET /api/notification-banners route in src/app/api/notification-banners/route.ts"
Task: "Build BannerCarousel component in src/app/components/banner-carousel.tsx"

# US2 — Admin interface (parallel with US1)
Task: "Create GET /api/notification-banners/search route in src/app/api/notification-banners/search/route.ts"
Task: "Build BannerSlotCard in src/app/admin/notifications/banner-slot-card.tsx"
Task: "Build NotificationSearch in src/app/admin/notifications/notification-search.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema + constants)
2. Complete Phase 2: Foundational (validation + service + actions)
3. Complete Phase 3: User Story 1 (public carousel)
4. **STOP and VALIDATE**: Test carousel independently on home page
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo (admin tooling)
4. Add User Story 3 → Test independently → Deploy/Demo (conditional strip polish)
5. Complete Polish phase → Final cleanup and verification
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (public carousel)
   - Developer B: User Story 2 (admin interface)
3. After US1 completes: Developer A moves to User Story 3
4. Both developers collaborate on Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- T008 (`cloudfrontLoader`): Verify `process.env.CDN_DOMAIN` is available client-side or update to `NEXT_PUBLIC_CDN_DOMAIN`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Net code reduction: ~4,100 lines (removing ~4,969 lines of deprecated code, adding ~830 lines)
