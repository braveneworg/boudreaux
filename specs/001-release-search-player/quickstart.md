# Quickstart: Release Search & Media Player

**Phase**: 1 — Design & Contracts
**Date**: 2026-02-21
**Branch**: `001-release-search-player`

---

## Prerequisites

- Node.js 18+
- MongoDB running locally (via Docker: `docker compose up -d`)
- `.env` configured with `DATABASE_URL` and other required env vars
- `npm install` completed
- Seed data loaded: `npx prisma db seed`

---

## Implementation Order

Follow this sequence to build incrementally with testable checkpoints.

### Step 1: Service Layer (no UI)

**Files to create/modify:**

- `src/lib/services/release-service.ts` — add 3 new methods
- `src/lib/types/media-models.ts` — add `PublishedReleaseListing`, `PublishedReleaseDetail`, `ReleaseCarouselItem` types

**What to do:**

1. Add `PublishedReleaseListing`, `PublishedReleaseDetail`, and `ReleaseCarouselItem` Prisma payload types to `media-models.ts`
2. Add `getPublishedReleases()` to `ReleaseService` — fetches all published releases with images, artists (with groups), and releaseUrls. Use `withCache` with 10-min TTL.
3. Add `getReleaseWithTracks(id)` to `ReleaseService` — fetches single published release with full track data
4. Add `getArtistOtherReleases(artistId, excludeReleaseId)` to `ReleaseService` — fetches other published releases by an artist
5. Write tests for all 3 methods in the existing `release-service.spec.ts`

**Verification:** `npm run test -- release-service` — all tests pass

---

### Step 2: Releases Listing Page (Server Component)

**Files to create:**

- `src/app/releases/page.tsx` — Server Component
- `src/app/releases/page.spec.tsx` — Tests

**What to do:**

1. Create the page as a Server Component that calls `ReleaseService.getPublishedReleases()`
2. Use the `PageContainer > ContentContainer` layout pattern
3. Add `BreadcrumbMenu` with `[{ anchorText: 'Home', url: '/' }, { anchorText: 'Releases', url: '/releases', isActive: true }]`
4. Add a `Heading` component
5. Render a placeholder grid (hardcoded cards) to verify layout
6. Export `metadata` for SEO

**Verification:** Navigate to `http://localhost:3000/releases` — breadcrumbs and heading render

---

### Step 3: Release Card Components

**Files to create:**

- `src/app/components/release-card.tsx` + spec
- `src/app/components/release-card-grid.tsx` + spec

**What to do:**

1. Create `ReleaseCard` — displays cover art (with fallback chain), artist name, release title, Bandcamp link, and "Play" button
2. Use `next/image` for cover art with `loading="lazy"` and `Skeleton` placeholder
3. Use `Music2` icon from `lucide-react` for the "Play" button
4. Create `ReleaseCardGrid` — responsive CSS Grid: 1 col on mobile, 2 on sm, 3 on md, 4 on lg
5. Wire into listing page, replacing placeholder grid

**Verification:** `http://localhost:3000/releases` — real release cards render with cover art and links

---

### Step 4: Search Combobox

**Files to create:**

- `src/app/components/release-search-combobox.tsx` + spec

**What to do:**

1. Create `ReleaseSearchCombobox` as a `'use client'` component
2. Use `Popover` + `Command` from shadcn/ui
3. Build searchable value string per release (title + artist names + group names)
4. Custom `CommandItem` rendering: thumbnail + artist + title
5. `onSelect` navigates to `/releases/{releaseId}` via `router.push`
6. 300ms debounce on input using inline `setTimeout` pattern
7. Wire into listing page above the card grid

**Verification:** Type in combobox → results filter → select navigates to player page (404 is OK at this step)

---

### Step 5: Release Media Player Page (Server Component + Client Wrapper)

**Files to create:**

- `src/app/releases/[releaseId]/page.tsx` + spec
- `src/app/releases/[releaseId]/not-found.tsx`
- `src/app/components/release-player.tsx` + spec

**What to do:**

1. Create the dynamic route Server Component
2. Call `getReleaseWithTracks(params.releaseId)` → `notFound()` if failed
3. Extract primary artist ID from `artistReleases[0]`
4. Call `getArtistOtherReleases(primaryArtistId, releaseId)`
5. Create `ReleasePlayer` client component that composes: `MediaPlayer.InteractiveCoverArt`, `MediaPlayer.Controls`, `MediaPlayer.TrackListDrawer`, `MediaPlayer.InfoTickerTape`
6. Handle state: `isPlaying`, `currentTrackIndex`, track navigation callbacks
7. Create `not-found.tsx` with "Release not found" + link back to `/releases`
8. Add breadcrumbs: Home > Releases > {title}

**Verification:** Navigate to `/releases/{validId}` — player renders, tracks play. Navigate to `/releases/invalid` — 404 page renders.

---

### Step 6: Artist Releases Carousel

**Files to create:**

- `src/app/components/artist-releases-carousel.tsx` + spec

**What to do:**

1. Create `ArtistReleasesCarousel` using the existing `Carousel` component (embla)
2. Each item shows cover art (with fallback) and links to `/releases/{releaseId}`
3. Support desktop arrow navigation and mobile swipe
4. Conditionally render: only when `otherReleases.length > 0`
5. Wire into the media player page above the player

**Verification:** Player page shows carousel of other releases. Clicking navigates.

---

### Step 7: Release Description

**Files to create:**

- `src/app/components/release-description.tsx` + spec

**What to do:**

1. Create `ReleaseDescription` — renders plain text with `whitespace-pre-line` for line breaks
2. Conditionally render: only when `description` is non-null and non-empty
3. Wire into media player page below the player

**Verification:** Player page shows description below player (or nothing if no description)

---

### Step 8: Polish & Edge Cases

**What to do:**

1. Cover art placeholder for releases with no images
2. Cards without Bandcamp URL: unlink cover art/title, keep Play button
3. No-tracks state on player page: show cover art + message, hide controls
4. Long release titles: truncate in breadcrumbs with ellipsis on mobile
5. Error state on listing page: retry button
6. Accessibility audit: ARIA labels, keyboard navigation, focus management
7. Responsive testing: 320px, 640px, 768px, 1024px, 1280px, 1920px

---

## Key Patterns to Follow

### Layout pattern (from existing pages)

```tsx
// Server Component
import { PageContainer, ContentContainer } from '@/app/components/ui/containers';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Heading } from '@/app/components/ui/heading';

const ReleasesPage = async () => {
  const result = await ReleaseService.getPublishedReleases();
  // ...
  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbs} />
        <Heading>Releases</Heading>
        {/* content */}
      </ContentContainer>
    </PageContainer>
  );
};
```

### Service method pattern (from existing services)

```typescript
static async getPublishedReleases(): Promise<ServiceResponse<PublishedReleaseListing[]>> {
  return withCache('published-releases', async () => {
    try {
      const releases = await prisma.release.findMany({ /* ... */ });
      return { success: true, data: releases };
    } catch (error) {
      console.error('Failed to fetch published releases:', error);
      return { success: false, error: 'Failed to fetch published releases' };
    }
  }, 600_000);
}
```

### Client component pattern (from FeaturedArtistsPlayer)

```tsx
'use client';

const ReleasePlayer = ({ release, tracks }: ReleasePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  // ... callbacks with useCallback
  return (
    <MediaPlayer>
      <MediaPlayer.InteractiveCoverArt /* ... */ />
      <MediaPlayer.Controls /* ... */ />
      <MediaPlayer.TrackListDrawer /* ... */ />
      <MediaPlayer.InfoTickerTape /* ... */ />
    </MediaPlayer>
  );
};
```

---

## Useful Commands

| Command                   | Purpose                   |
| ------------------------- | ------------------------- |
| `npm run dev`             | Start dev server          |
| `npm run test -- release` | Run release-related tests |
| `npm run test:coverage`   | Generate coverage report  |
| `npm run lint`            | Check code quality        |
| `npm run lint:fix`        | Auto-fix lint issues      |
| `npm run format`          | Format code with Prettier |
