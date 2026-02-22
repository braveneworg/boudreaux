# Research: Release Search & Media Player

**Phase**: 0 — Outline & Research
**Date**: 2026-02-21
**Status**: Complete

---

## R-001: ReleaseService — New Methods Required

### Decision

Add three new static methods to `ReleaseService` rather than modifying existing methods.

### Rationale

The existing `getReleases()` method serves admin CRUD needs with its current include set. Creating separate read-only methods for public pages:

- Avoids breaking existing admin functionality
- Follows the project's service-layer pattern (single responsibility per method)
- Allows optimised includes per use case (listing needs thumbnails; player needs full tracks)

### Methods to add

1. **`getPublishedReleases()`** — Returns all published releases with expanded includes:
   - Filter: `publishedAt: { not: null }, deletedOn: null`
   - Order: `releasedOn: 'desc'`
   - Include: `images` (take 1), `artistReleases → artist { id, firstName, surname, displayName, groups → group { id, displayName } }`, `releaseUrls → url { id, platform, url }`
   - Cache: `withCache('published-releases', fn, 600_000)` (10-min TTL, matching `FeaturedArtistsService` pattern)

2. **`getReleaseWithTracks(id: string)`** — Returns a single published release with full track data for the media player:
   - Filter: `id, publishedAt: { not: null }, deletedOn: null`
   - Include: `images`, `artistReleases → artist`, `releaseTracks → track` (ordered by `position`), `releaseUrls → url`
   - No cache (low-volume single-record lookup)

3. **`getArtistOtherReleases(artistId: string, excludeReleaseId: string)`** — Returns other published releases by an artist:
   - Filter: `artistReleases: { some: { artistId } }, id: { not: excludeReleaseId }, publishedAt: { not: null }, deletedOn: null`
   - Order: `releasedOn: 'desc'`
   - Include: `images` (take 1)
   - The `artistId` index on `ArtistRelease` supports this query efficiently

### Alternatives considered

- **Modify existing `getReleases()`**: Rejected — would bloat the admin method with unnecessary joins and break separation of concerns
- **New `PublishedReleaseService`**: Rejected — overkill for 3 methods; co-locating in `ReleaseService` is cleaner
- **API route approach**: The listing page is a Server Component that can call services directly. No new API route needed.

---

## R-002: Group Information Access Path

### Decision

Access group display names through `ArtistRelease → Artist → groups (ArtistGroup[]) → Group`.

### Rationale

There is no direct `Release → Group` relation in the Prisma schema. The two available paths are:

1. **`Release.artistReleases → ArtistRelease.artist → Artist.groups → ArtistGroup.group`** — This is the correct generic path. Every release's artists have group memberships accessed through the `ArtistGroup` join table.
2. **`FeaturedArtist → group`** — Only for featured artists on the landing page; not applicable to general releases.

The expanded include block on `getPublishedReleases()` will traverse:

```
artistReleases: {
  include: {
    artist: {
      select: {
        id: true, firstName: true, surname: true, displayName: true,
        groups: { include: { group: { select: { id: true, displayName: true } } } }
      }
    }
  }
}
```

### Alternatives considered

- **Store group directly on Release model**: Rejected — schema change out of scope, and the join-table approach is correct data modelling
- **Flatten group name into a denormalized search field**: Rejected — premature optimization for < 500 releases

---

## R-003: MediaPlayer Adaptation for Single Release

### Decision

Create a `ReleasePlayer` client component that composes `MediaPlayer` sub-components for a single release, modelled after `FeaturedArtistsPlayer` but simpler.

### Rationale

The existing `FeaturedArtistsPlayer` manages state for switching between multiple featured artists (carousel selection, auto-play on artist switch). The release media player page shows a single release — there's no need for the artist-switching state machine.

The `ReleasePlayer` component will:

- Accept a single release (with tracks, images, artist info) as props
- Manage playback state: `isPlaying`, `currentTrackIndex`, `playerControls`
- Compose `MediaPlayer` sub-components: `CoverArtView` (or `InteractiveCoverArt`), `Controls`, `TrackListDrawer`, `InfoTickerTape`
- Expose callbacks: `handleTrackSelect`, `handleTrackEnded`, `handlePreviousTrack`, `handleNextTrack`
- NOT use `FeaturedArtistCarousel` or `Search` sub-components (those are for the landing page)

The "other releases by artist" carousel is a **separate** component (`ArtistReleasesCarousel`) rendered outside/above the player, not inside it.

### Alternatives considered

- **Reuse `FeaturedArtistsPlayer` directly**: Rejected — its state management assumes multiple artists switching; too much dead code and wrong abstraction
- **Extend `MediaPlayer` with a "single release" mode**: Rejected — adds complexity to an already large (1300-line) compound component; composition is preferred over configuration

---

## R-004: 404 Handling for Invalid Release IDs

### Decision

Use Next.js `notFound()` from `next/navigation` in the release media player Server Component, with a route-level `not-found.tsx`.

### Rationale

There are zero existing uses of `notFound()` in the codebase. The current pattern is service-level error responses (`{ success: false, error: 'Release not found' }`) translated to JSON 404s in API routes. For Server Components, `notFound()` is the idiomatic Next.js approach.

Implementation:

1. In `/releases/[releaseId]/page.tsx`: call `getReleaseWithTracks(releaseId)` → if `!result.success`, call `notFound()`
2. Create `/releases/[releaseId]/not-found.tsx` with a "Release not found" message and a link back to `/releases`

This establishes a pattern that future pages can follow.

### Alternatives considered

- **Redirect to `/releases`**: Rejected — user loses context; a 404 page with a link is more transparent
- **Render an inline error**: Rejected — less SEO-friendly; `notFound()` returns proper 404 status code

---

## R-005: Search Implementation — Client-Side with cmdk

### Decision

Use the existing shadcn/ui `Command` component (wrapping `cmdk`) inside a `Popover` to implement the combobox dropdown search. Filtering is client-side over server-fetched data.

### Rationale

The existing `combobox.tsx` in `src/app/components/forms/fields/` provides a working Popover + Command pattern. The release search combobox extends this with:

- Custom item rendering (cover art thumbnail + artist name + release title)
- Navigation on select (`router.push(`/releases/${releaseId}`)`)
- 300ms debounce via inline `setTimeout` pattern (matching existing `release-select.tsx`, `group-select.tsx`, etc.)
- Always-visible search input (not hidden behind a button toggle like the admin form combobox)

The `cmdk` library handles:

- Fuzzy text matching via `Command`'s built-in `filter` prop
- Keyboard navigation (up/down arrows, Enter to select, Escape to close)
- Accessibility (ARIA roles, screen reader announcements)

Client-side filtering is suitable because the catalog is < 500 releases and all data is already fetched for the card grid.

### Search field mapping

The search needs to match against multiple fields. The `Command` `filter` prop can be customized, or each `CommandItem` can have a `value` string that concatenates all searchable fields:

```typescript
const searchValue = [
  release.title,
  release.releaseDisplayName,
  ...artists.map((a) => `${a.firstName} ${a.surname} ${a.displayName}`),
  ...groups.map((g) => g.displayName),
]
  .filter(Boolean)
  .join(' ');
```

The `cmdk` built-in filter does substring matching on the `value` prop of each `CommandItem`.

### Alternatives considered

- **Server-side search endpoint**: Rejected for initial implementation — overkill for < 500 releases; adds latency and complexity
- **Custom filter logic**: Rejected — `cmdk`'s built-in filtering handles substring matching well; no need to reinvent
- **Algolia/Elasticsearch**: Rejected — far too heavy for the catalog size

---

## R-006: Debounce Pattern

### Decision

Use the existing inline `setTimeout` / `useEffect` cleanup pattern with 300ms delay.

### Rationale

Six existing form field components use the identical pattern:

```typescript
useEffect(() => {
  const timeoutId = setTimeout(() => {
    /* filter logic */
  }, 300);
  return () => clearTimeout(timeoutId);
}, [searchValue]);
```

This is consistent, well-understood by the team, and sufficient for client-side filtering. Extracting a `useDebounce` hook would be a separate concern outside this feature's scope.

### Alternatives considered

- **Extract `useDebounce` hook**: Valid but out of scope (tech debt, not feature work)
- **Third-party debounce library**: Rejected — unnecessary dependency for a simple pattern
- **No debounce**: Rejected — could cause jank on lower-end mobile devices with client-side filtering over hundreds of items

---

## R-007: Music Notes Icon

### Decision

Use `Music2` from `lucide-react` for the "Play {release title}" button.

### Rationale

The spec says "music notes" (plural). Available options:

- `Music` — single note (already used in `media-uploader.tsx` and `bulk-track-uploader.tsx`)
- `Music2` — double notes (aligns with "music notes" plural phrasing)
- `Music3` / `Music4` — more ornate; less standard for a play action

`Music2` is distinct from existing `Music` usage (which represents upload/file contexts) and visually communicates "music playback" more effectively.

### Alternatives considered

- `Music` (single note): Valid but already associated with upload contexts in this project
- `AudioLines` (waveform): More associated with equalizers/visualizers than music identification
- `Headphones`: Too literal, less standard for a play action

---

## R-008: Cover Art Fallback Chain

### Decision

Implement the following cover art fallback chain, matching the established project pattern:

1. `release.coverArt` (direct URL field on Release model)
2. `release.images[0].src` (first image from images relation, sorted by `sortOrder`)
3. Styled text placeholder (card with release title + artist name rendered as text)

### Rationale

The `FeaturedArtistsPlayer` uses a `getCoverArt()` helper that follows this exact chain. The Release model has both a `coverArt: String?` field and an `images: Image[]` relation. For listing cards, `getPublishedReleases` fetches `images` (take 1) as the fallback.

The styled placeholder is needed because not all releases may have uploaded cover art.

### Alternatives considered

- **Generic placeholder image**: Rejected — a styled text card is more informative and avoids loading another asset
- **Artist images as fallback**: Possible but adds complexity and may be confusing (artist photo ≠ release cover)

---

## R-009: Artist Display Name Fallback Chain

### Decision

Implement the following display name fallback chain:

1. `artist.displayName` (explicit display name override)
2. `artist.firstName + ' ' + artist.surname` (constructed full name)
3. First group's `displayName` (via `artist.groups[0].group.displayName`)
4. `'Unknown Artist'` (last resort fallback)

### Rationale

This matches the existing `getDisplayName()` utility in `FeaturedArtistsPlayer`:

```typescript
const getDisplayName = (fa: FeaturedArtist): string => {
  return (
    fa.artist?.displayName ||
    [fa.artist?.firstName, fa.artist?.surname].filter(Boolean).join(' ') ||
    fa.group?.displayName ||
    ''
  );
};
```

Adapting for `ArtistRelease` data shape (which has `artist` but not `group` directly — group is nested under `artist.groups`).

### Alternatives considered

- **Always require `displayName`**: Rejected — legacy data may not have it populated
- **Show all artists**: For listing cards, show the primary (first) artist. For the media player page, show all artists in the info ticker.
