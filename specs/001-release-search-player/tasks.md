# Tasks: Release Search & Media Player

**Input**: Design documents from `/specs/001-release-search-player/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included per project constitution (Principle III: Test-Driven Development — 90%+ coverage target).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story (US1, US2, US3, US4) — omitted for Setup/Foundational/Polish phases
- Include exact file paths in descriptions

## Path Conventions

- Single Next.js project: `src/` at repository root
- Services: `src/lib/services/`
- Types: `src/lib/types/`
- Components: `src/app/components/`
- Pages: `src/app/releases/`

---

## Phase 1: Setup

**Purpose**: Types and shared service infrastructure needed by all user stories

- [x] T001 [P] Add `PublishedReleaseListing`, `PublishedReleaseDetail`, and `ReleaseCarouselItem` Prisma payload types in `src/lib/types/media-models.ts`
- [x] T005 Write tests for `getPublishedReleases`, `getReleaseWithTracks`, and `getArtistOtherReleases` in `src/lib/services/release-service.spec.ts` — tests should FAIL (methods not yet implemented)
- [x] T002 [P] Add `getPublishedReleases()` static method with `withCache` (10-min TTL) to `src/lib/services/release-service.ts` — fetches published releases with images, artistReleases (with artist + groups), and releaseUrls per data-model.md query shape
- [x] T003 [P] Add `getReleaseWithTracks(id: string)` static method to `src/lib/services/release-service.ts` — fetches single published release with full track data, returns `{ success: false }` when not found
- [x] T004 [P] Add `getArtistOtherReleases(artistId: string, excludeReleaseId: string)` static method to `src/lib/services/release-service.ts` — fetches other published releases by artist with images

**Checkpoint**: `npm run test -- release-service` — all new service method tests pass. No UI yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared utility functions and helper components that multiple user stories depend on

**CRITICAL**: The helper utilities created here are used across US1–US4. Complete before starting user stories.

- [x] T010 Write tests for `getArtistDisplayName`, `getReleaseCoverArt`, `getBandcampUrl`, and `buildReleaseSearchValue` in `src/lib/utils/release-helpers.spec.ts` — tests should FAIL (functions not yet implemented)
- [x] T006 Create `getArtistDisplayName` utility function in `src/lib/utils/release-helpers.ts` — implements display name fallback chain: `artist.displayName` → `firstName + ' ' + surname` → `groups[0].group.displayName` → `'Unknown Artist'`. Include JSDoc and MPL header.
- [x] T007 Create `getReleaseCoverArt` utility function in `src/lib/utils/release-helpers.ts` — implements cover art fallback chain: `release.coverArt` (non-empty) → `release.images[0]?.src` → `null`. Returns `{ src: string; alt: string } | null`. Include JSDoc.
- [x] T008 Create `getBandcampUrl` utility function in `src/lib/utils/release-helpers.ts` — extracts Bandcamp URL from `release.releaseUrls` where `url.platform === 'BANDCAMP'`. Returns `string | null`.
- [x] T009 Create `buildReleaseSearchValue` utility function in `src/lib/utils/release-helpers.ts` — concatenates searchable fields (title, artist names, group names) for cmdk `value` prop. Returns lowercase string.

**Checkpoint**: Foundation ready — all helper utilities tested. User story implementation can begin.

---

## Phase 3: User Story 1 — Browse & Search Releases (Priority: P1) 🎯 MVP

**Goal**: Public releases listing page at `/releases` with a responsive card grid and combobox dropdown search. Fans can browse all published releases, search by artist/title/group, navigate to Bandcamp or the in-app player.

**Independent Test**: Navigate to `/releases` → verify card grid renders with cover art, artist names, titles. Type in search → verify filtered dropdown results. Click card → Bandcamp opens in new tab. Click "Play" → navigates to `/releases/{releaseId}`.

### Tests for User Story 1

- [x] T011 [P] [US1] Write tests for `ReleaseCard` component in `src/app/components/release-card.spec.tsx` — cover art rendering with fallback, artist name display with fallback chain, Bandcamp link (new tab, `rel="noopener noreferrer"`), unlinked card when no Bandcamp URL, "Play" button with Music2 icon navigates to `/releases/{releaseId}`, lazy loading with Skeleton placeholder, styled placeholder when no cover art
- [x] T012 [P] [US1] Write tests for `ReleaseCardGrid` component in `src/app/components/release-card-grid.spec.tsx` — renders grid of ReleaseCards, passes releases as props, empty state when no releases, responsive grid classes (1 col mobile, 2 sm, 3 md, 4 lg)
- [x] T013 [P] [US1] Write tests for `ReleaseSearchCombobox` component in `src/app/components/release-search-combobox.spec.tsx` — renders search input, filters results as user types, displays cover art thumbnail + artist + title per dropdown item, navigates to `/releases/{releaseId}` on select, shows "No releases found" empty state, 300ms debounce on input, handles special characters safely
- [x] T014 [P] [US1] Write tests for releases listing page in `src/app/releases/page.spec.tsx` — calls `getPublishedReleases`, renders BreadcrumbMenu with Home > Releases, renders Heading, renders ReleaseSearchCombobox, renders ReleaseCardGrid with data, handles error state with retry

### Implementation for User Story 1

- [x] T015 [P] [US1] Create `ReleaseCard` component in `src/app/components/release-card.tsx` — displays cover art (next/image with lazy loading + Skeleton), artist name (via `getArtistDisplayName`), release title, Bandcamp link (`target="_blank"`, `rel="noopener noreferrer"`), styled placeholder when no cover art, "Play {title}" button with `Music2` icon linking to `/releases/{releaseId}`. Include MPL header and JSDoc.
- [x] T016 [P] [US1] Create `ReleaseCardGrid` component in `src/app/components/release-card-grid.tsx` — responsive CSS Grid: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6`. Maps releases to `ReleaseCard`. Include MPL header and JSDoc.
- [x] T017 [US1] Create `ReleaseSearchCombobox` client component in `src/app/components/release-search-combobox.tsx` — `'use client'` directive, uses `Popover` + `Command` + `CommandInput` + `CommandList` + `CommandEmpty` + `CommandGroup` + `CommandItem` from shadcn/ui. Builds search value per release via `buildReleaseSearchValue`. Custom `CommandItem` rendering: cover art thumbnail (40×40), artist name, release title. `onSelect` calls `router.push('/releases/${releaseId}')`. 300ms debounce via inline `setTimeout`/`useEffect` pattern. Include MPL header and JSDoc.
- [x] T018 [US1] Create releases listing page Server Component in `src/app/releases/page.tsx` — calls `ReleaseService.getPublishedReleases()`, renders `PageContainer` > `ContentContainer` > `BreadcrumbMenu` (Home > Releases) > `Heading` > `ReleaseSearchCombobox` > `ReleaseCardGrid`. Exports `metadata` for SEO. Handles error state. Uses `'server-only'` import. Include MPL header and JSDoc.
- [x] T019 [US1] Verify all US1 tests pass and fix any type errors or lint warnings in `src/app/releases/page.tsx`, `src/app/components/release-card.tsx`, `src/app/components/release-card-grid.tsx`, `src/app/components/release-search-combobox.tsx`

**Checkpoint**: `/releases` page is fully functional — card grid renders, search filters, Bandcamp links work, "Play" buttons navigate. US1 independently testable.

---

## Phase 4: User Story 2 — Listen to a Release (Priority: P2)

**Goal**: Release media player page at `/releases/{releaseId}` with interactive cover art, audio playback controls, track list drawer, info ticker, and a carousel of other releases by the primary artist. 404 page for invalid IDs.

**Independent Test**: Navigate to `/releases/{validId}` → verify player renders with cover art, tracks play, track list drawer works, info ticker scrolls. Carousel shows other releases by primary artist (or is hidden if none). Navigate to `/releases/invalid` → verify 404 page.

### Tests for User Story 2

- [x] T020 [P] [US2] Write tests for `ReleasePlayer` client component in `src/app/components/release-player.spec.tsx` — renders MediaPlayer sub-components (InteractiveCoverArt, Controls, TrackListDrawer, InfoTickerTape), handles play/pause state, track selection, track ended → auto-advance, previous/next track navigation, no-tracks state shows message and hides controls
- [x] T021 [P] [US2] Write tests for `ArtistReleasesCarousel` component in `src/app/components/artist-releases-carousel.spec.tsx` — renders carousel with release cover art items, each item links to `/releases/{releaseId}`, hidden when `otherReleases` is empty, handles cover art fallback, handles 20+ carousel items gracefully (per edge case EC-006)
- [x] T022 [P] [US2] Write tests for release media player page in `src/app/releases/[releaseId]/page.spec.tsx` — calls `getReleaseWithTracks`, calls `getArtistOtherReleases` with primary artist ID, renders BreadcrumbMenu with Home > Releases > {title}, renders ArtistReleasesCarousel (conditionally), renders ReleasePlayer, calls `notFound()` when release not found
- [x] T023 [P] [US2] Write tests for not-found page in `src/app/releases/[releaseId]/not-found.spec.tsx` — renders "Release not found" message, renders link back to `/releases`

### Implementation for User Story 2

- [x] T024 [P] [US2] Create `ArtistReleasesCarousel` component in `src/app/components/artist-releases-carousel.tsx` — uses existing `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` from shadcn/ui. Each item: cover art (next/image with fallback), links to `/releases/{releaseId}`. Conditionally rendered when `releases.length > 0`. Desktop arrows + mobile swipe. Include MPL header and JSDoc.
- [x] T025 [US2] Create `ReleasePlayer` client component in `src/app/components/release-player.tsx` — `'use client'` directive. Composes `MediaPlayer.InteractiveCoverArt`, `MediaPlayer.Controls`, `MediaPlayer.TrackListDrawer`, `MediaPlayer.InfoTickerTape`. State: `isPlaying`, `currentTrackIndex`. Callbacks with `useCallback`: `handleTrackSelect`, `handleTrackEnded` (auto-advance), `handlePreviousTrack`, `handleNextTrack`. No-tracks state: show cover art + "No playable tracks available" message, hide controls. Include MPL header and JSDoc.
- [x] T026 [US2] Create not-found page in `src/app/releases/[releaseId]/not-found.tsx` — displays "Release not found" heading, descriptive message, and a Link back to `/releases`. Include MPL header.
- [x] T027 [US2] Create release media player page Server Component in `src/app/releases/[releaseId]/page.tsx` — calls `getReleaseWithTracks(params.releaseId)` → `notFound()` if failed. Extracts `primaryArtistId` from `artistReleases[0]?.artist.id`. Calls `getArtistOtherReleases(primaryArtistId, releaseId)`. Renders `PageContainer` > `ContentContainer` > `BreadcrumbMenu` (Home > Releases > {title}) > `ArtistReleasesCarousel` (conditional) > `ReleasePlayer`. Exports `metadata` with dynamic title. Uses `'server-only'` import. Include MPL header and JSDoc.
- [x] T028 [US2] Verify all US2 tests pass and fix any type errors or lint warnings in `src/app/releases/[releaseId]/page.tsx`, `src/app/releases/[releaseId]/not-found.tsx`, `src/app/components/release-player.tsx`, `src/app/components/artist-releases-carousel.tsx`

**Checkpoint**: `/releases/{releaseId}` page is fully functional — player renders, tracks play, carousel shows other releases, 404 works. US2 independently testable.

---

## Phase 5: User Story 3 — Read About a Release (Priority: P3)

**Goal**: Plain text description section below the media player on the release page. Hidden when no description exists.

**Independent Test**: Navigate to a release with a description → verify blurb renders below the player with proper line breaks. Navigate to a release without a description → verify the section is not rendered.

### Tests for User Story 3

- [x] T029 [P] [US3] Write tests for `ReleaseDescription` component in `src/app/components/release-description.spec.tsx` — renders description text with `whitespace-pre-line`, renders newlines as line breaks, hidden when description is null, hidden when description is empty string, handles long text without horizontal overflow, handles long unbroken strings gracefully

### Implementation for User Story 3

- [x] T030 [US3] Create `ReleaseDescription` component in `src/app/components/release-description.tsx` — renders plain text with `whitespace-pre-line` for line breaks, `break-words` for overflow protection. Conditionally rendered: returns `null` if `description` is null/empty. Include MPL header and JSDoc.
- [x] T031 [US3] Integrate `ReleaseDescription` into release media player page `src/app/releases/[releaseId]/page.tsx` — render below `ReleasePlayer`, pass `release.description` as prop
- [x] T032 [US3] Verify all US3 tests pass and fix any type errors or lint warnings in `src/app/components/release-description.tsx` and `src/app/releases/[releaseId]/page.tsx`

**Checkpoint**: Release page now shows description below the player (or nothing if absent). US3 independently testable.

---

## Phase 6: User Story 4 — Navigate with Breadcrumbs (Priority: P4)

**Goal**: Breadcrumb navigation at the top of both pages using the existing `BreadcrumbMenu` component.

**Independent Test**: Navigate to `/releases` → breadcrumb shows "Home > Releases". Navigate to `/releases/{releaseId}` → breadcrumb shows "Home > Releases > {Release Title}". Click breadcrumb links → navigation works. Mobile: long titles truncated.

> **Note**: Breadcrumbs are already wired into both pages during US1 (T018) and US2 (T027). This phase validates correctness and adds mobile truncation polish.

### Tests for User Story 4

- [x] T033 [P] [US4] Write breadcrumb integration tests in `src/app/releases/page.spec.tsx` — verify BreadcrumbMenu receives correct items: `[{ anchorText: 'Home', url: '/' }, { anchorText: 'Releases', url: '/releases', isActive: true }]`
- [x] T034 [P] [US4] Write breadcrumb integration tests in `src/app/releases/[releaseId]/page.spec.tsx` — verify BreadcrumbMenu receives correct items: `[{ anchorText: 'Home', url: '/' }, { anchorText: 'Releases', url: '/releases' }, { anchorText: '{title}', url: '/releases/{id}', isActive: true }]`, verify long titles are truncated with `max-w` + `truncate` classes

### Implementation for User Story 4

- [x] T035 [US4] Add mobile breadcrumb truncation for long release titles in `src/app/releases/[releaseId]/page.tsx` — apply `max-w-[200px] truncate` class on the active breadcrumb item for viewports < sm
- [x] T036 [US4] Verify all US4 tests pass and fix any type errors or lint warnings

**Checkpoint**: Breadcrumbs render correctly on both pages with proper navigation and mobile truncation. US4 independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, accessibility, responsive testing, and final quality checks

- [x] T037 [P] Add cover art styled placeholder component logic in `src/app/components/release-card.tsx` — when `getReleaseCoverArt` returns `null`, render a styled card with the release title and artist name as text (e.g., `bg-zinc-800 text-white` with centered text)
- [x] T038 [P] Add error state with retry to releases listing page in `src/app/releases/page.tsx` — when `getPublishedReleases` returns `{ success: false }`, render a user-friendly error message with a "Try again" button
- [x] T039 [P] Add no-tracks empty state to `ReleasePlayer` in `src/app/components/release-player.tsx` — when release has zero tracks or all tracks lack audio URLs, display "No playable tracks available" message and hide audio controls
- [x] T040 [P] Verify accessibility: ARIA labels on combobox (`aria-label="Search releases"`), carousel (`aria-label="Other releases by {artistName}"`), breadcrumbs (`aria-current="page"`), Play buttons (`aria-label="Play {title}"`), and all images have alt text. Run Lighthouse accessibility audit on both pages — target 90+ score (SC-006)
- [x] T041 [P] Responsive testing and performance: verify layout at 320px, 640px, 768px, 1024px, 1280px, 1920px — card grid columns adjust, combobox is full-width on mobile, player controls are touch-friendly, no horizontal overflow. Run Lighthouse performance audit on `/releases` page — target load < 3s on mobile 3G/4G (SC-003) and search results < 500ms (SC-008)
- [x] T042 Run `npm run lint` and `npm run format` across all new/modified files and fix any issues
- [x] T043 Run `npm run test:run` to verify all tests pass with no failures
- [x] T044 Run quickstart.md validation — walk through each step and verify checkpoints

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on T001 (types) — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 completion
- **Phase 4 (US2)**: Depends on Phase 2 completion — can run in parallel with US1 (different files)
- **Phase 5 (US3)**: Depends on Phase 4 (US2) — adds to the media player page
- **Phase 6 (US4)**: Depends on Phase 3 (US1) and Phase 4 (US2) — validates breadcrumbs on both pages
- **Phase 7 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Browse & Search)**: Independent after Phase 2 — creates listing page, cards, search
- **US2 (Listen)**: Independent after Phase 2 — creates player page, player component, carousel, 404
- **US3 (Description)**: Depends on US2 — adds a section to the player page created in US2
- **US4 (Breadcrumbs)**: Depends on US1 + US2 — validates breadcrumbs already wired in both pages

### Within Each User Story

1. Tests FIRST → verify they FAIL
2. Component implementations (parallel where marked [P])
3. Page integration (depends on components)
4. Verification pass (type errors, lint)

### Parallel Opportunities

**Phase 1**: T001–T004 are all [P] — different types/methods
**Phase 2**: T006–T009 are sequential (same file) — T010 after all
**Phase 3 (US1)**: T011–T014 tests are all [P]. T015, T016 implementations are [P]. T017 depends on T015/T016.
**Phase 4 (US2)**: T020–T023 tests are all [P]. T024 is [P] with T025 (different files).
**US1 + US2**: Can run in parallel after Phase 2 (different pages and components)
**Phase 7**: T037–T041 are all [P] — different files or independent checks

---

## Parallel Example: User Story 1

```text
# Step 1: Write all US1 tests in parallel (should FAIL):
Task T011: "Write tests for ReleaseCard in src/app/components/release-card.spec.tsx"
Task T012: "Write tests for ReleaseCardGrid in src/app/components/release-card-grid.spec.tsx"
Task T013: "Write tests for ReleaseSearchCombobox in src/app/components/release-search-combobox.spec.tsx"
Task T014: "Write tests for releases listing page in src/app/releases/page.spec.tsx"

# Step 2: Build components in parallel:
Task T015: "Create ReleaseCard in src/app/components/release-card.tsx"
Task T016: "Create ReleaseCardGrid in src/app/components/release-card-grid.tsx"

# Step 3: Sequential (depends on T015, T016):
Task T017: "Create ReleaseSearchCombobox in src/app/components/release-search-combobox.tsx"
Task T018: "Create releases listing page in src/app/releases/page.tsx"

# Step 4: Verify:
Task T019: "Verify all US1 tests pass"
```

## Parallel Example: User Story 2

```text
# Step 1: Write all US2 tests in parallel (should FAIL):
Task T020: "Write tests for ReleasePlayer in src/app/components/release-player.spec.tsx"
Task T021: "Write tests for ArtistReleasesCarousel in src/app/components/artist-releases-carousel.spec.tsx"
Task T022: "Write tests for release player page in src/app/releases/[releaseId]/page.spec.tsx"
Task T023: "Write tests for not-found page in src/app/releases/[releaseId]/not-found.spec.tsx"

# Step 2: Build components in parallel:
Task T024: "Create ArtistReleasesCarousel in src/app/components/artist-releases-carousel.tsx"
Task T025: "Create ReleasePlayer in src/app/components/release-player.tsx"

# Step 3: Sequential:
Task T026: "Create not-found.tsx in src/app/releases/[releaseId]/not-found.tsx"
Task T027: "Create release media player page in src/app/releases/[releaseId]/page.tsx"

# Step 4: Verify:
Task T028: "Verify all US2 tests pass"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + service methods)
2. Complete Phase 2: Foundational (utility helpers)
3. Complete Phase 3: User Story 1 (listing page + cards + search)
4. **STOP and VALIDATE**: Navigate to `/releases`, verify grid + search + links
5. Deploy/demo — fans can browse and discover releases

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Add US1 → Test independently → Deploy (MVP — fans can browse releases)
3. Add US2 → Test independently → Deploy (fans can listen to releases)
4. Add US3 → Test independently → Deploy (fans can read about releases)
5. Add US4 → Test independently → Deploy (improved navigation)
6. Phase 7: Polish → Final validation → Deploy

### Parallel Team Strategy

With two developers:

1. Team completes Phase 1 + Phase 2 together
2. Once Phase 2 is done:
   - Developer A: User Story 1 (Browse & Search)
   - Developer B: User Story 2 (Listen to Release)
3. After US2: Developer B continues with US3 (Description) and US4 (Breadcrumbs)
4. Team collaborates on Phase 7 (Polish)

---

## Notes

- All new source files require the MPL 2.0 license header from `HEADER.txt`
- Use absolute imports (`@/lib/...`, `@/app/components/...`) — no relative traversals
- All components use arrow functions with named exports (per project conventions)
- `'use client'` only on interactive components: `ReleaseSearchCombobox`, `ReleasePlayer`
- Server-only files use `import 'server-only'`
- Cover art fallback: `coverArt` → `images[0].src` → styled text placeholder (R-008)
- Artist name fallback: `displayName` → `firstName + surname` → `group displayName` → "Unknown Artist" (R-009)
- Search uses `cmdk` built-in filtering via `CommandItem` `value` prop (R-005)
- Debounce: 300ms inline `setTimeout`/`useEffect` pattern (R-006)
- Music icon: `Music2` from `lucide-react` (R-007)
- 404: `notFound()` from `next/navigation` + route-level `not-found.tsx` (R-004)
- No new dependencies required — all libraries already in the project
