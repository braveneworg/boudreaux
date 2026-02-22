# API Contracts: Release Search & Media Player

**Phase**: 1 — Design & Contracts
**Date**: 2026-02-21
**Protocol**: REST (Next.js App Router Server Components + Service Layer)

---

## Architecture Note

This feature does **not** use API routes for data fetching. Both pages are Server Components that call `ReleaseService` directly. The contracts below document the **service method signatures** and their data shapes, which serve the same purpose as API endpoint contracts.

The existing `GET /api/releases` route is **not modified** — it serves admin needs and remains unchanged.

---

## Service Contracts

### SC-001: Get Published Releases (Listing Page)

**Service**: `ReleaseService.getPublishedReleases()`
**Called from**: `src/app/releases/page.tsx` (Server Component)
**Cache**: `withCache('published-releases', fn, 600_000)` (10-min TTL)

#### Signature

```typescript
static async getPublishedReleases(): Promise<ServiceResponse<PublishedReleaseListing[]>>
```

#### Response — Success

```typescript
{
  success: true,
  data: [
    {
      id: "507f1f77bcf86cd799439011",
      title: "Midnight Serenade",
      coverArt: "https://cdn.example.com/covers/midnight.jpg",
      description: "A late-night jazz session...",
      releasedOn: "2025-06-15T00:00:00.000Z",
      publishedAt: "2025-06-10T12:00:00.000Z",
      // ...other Release scalar fields
      images: [
        { id: "...", src: "https://cdn.example.com/img1.jpg", altText: "Album cover", sortOrder: 0 }
      ],
      artistReleases: [
        {
          id: "...",
          artistId: "507f1f77bcf86cd799439022",
          releaseId: "507f1f77bcf86cd799439011",
          artist: {
            id: "507f1f77bcf86cd799439022",
            firstName: "Thelonious",
            surname: "Monk",
            displayName: null,
            groups: [
              {
                id: "...",
                artistId: "...",
                groupId: "...",
                group: { id: "...", displayName: "Monk Quartet" }
              }
            ]
          }
        }
      ],
      releaseUrls: [
        {
          id: "...",
          releaseId: "507f1f77bcf86cd799439011",
          urlId: "...",
          url: { id: "...", platform: "BANDCAMP", url: "https://label.bandcamp.com/album/midnight" }
        }
      ]
    }
    // ...more releases, ordered by releasedOn DESC
  ]
}
```

#### Response — Error

```typescript
{
  success: false,
  error: "Failed to fetch published releases"
}
```

#### Filtering (Client-Side)

The full `data` array is passed to the `ReleaseSearchCombobox` client component. Filtering is done in-browser:

```typescript
// Searchable value per release (concatenated for cmdk `value` prop)
[
  release.title,
  ...release.artistReleases.map((ar) =>
    [ar.artist.firstName, ar.artist.surname, ar.artist.displayName].filter(Boolean).join(' ')
  ),
  ...release.artistReleases.flatMap((ar) => ar.artist.groups.map((g) => g.group.displayName)),
]
  .filter(Boolean)
  .join(' ');
```

---

### SC-002: Get Release with Tracks (Media Player Page)

**Service**: `ReleaseService.getReleaseWithTracks(id: string)`
**Called from**: `src/app/releases/[releaseId]/page.tsx` (Server Component)
**Cache**: None (single-record lookup)

#### Signature

```typescript
static async getReleaseWithTracks(id: string): Promise<ServiceResponse<PublishedReleaseDetail>>
```

#### Parameters

| Name | Type   | Required | Validation     | Description         |
| ---- | ------ | -------- | -------------- | ------------------- |
| id   | string | Yes      | Valid ObjectId | Release document ID |

#### Response — Success

```typescript
{
  success: true,
  data: {
    id: "507f1f77bcf86cd799439011",
    title: "Midnight Serenade",
    coverArt: "https://cdn.example.com/covers/midnight.jpg",
    description: "A late-night jazz session featuring...",
    releasedOn: "2025-06-15T00:00:00.000Z",
    publishedAt: "2025-06-10T12:00:00.000Z",
    // ...other Release scalar fields
    images: [
      { id: "...", src: "https://cdn.example.com/img1.jpg", altText: "Album cover", sortOrder: 0 },
      { id: "...", src: "https://cdn.example.com/img2.jpg", altText: "Back cover", sortOrder: 1 }
    ],
    artistReleases: [
      {
        id: "...",
        artistId: "507f1f77bcf86cd799439022",
        releaseId: "507f1f77bcf86cd799439011",
        artist: {
          id: "507f1f77bcf86cd799439022",
          firstName: "Thelonious",
          surname: "Monk",
          displayName: null
        }
      }
    ],
    releaseTracks: [
      {
        id: "...",
        releaseId: "507f1f77bcf86cd799439011",
        trackId: "507f1f77bcf86cd799439033",
        position: 1,
        coverArt: null,
        track: {
          id: "507f1f77bcf86cd799439033",
          title: "Round Midnight",
          duration: 312,
          audioUrl: "https://cdn.example.com/audio/round-midnight.mp3",
          position: 1,
          coverArt: null,
          // ...other Track fields
        }
      },
      {
        id: "...",
        releaseId: "507f1f77bcf86cd799439011",
        trackId: "507f1f77bcf86cd799439044",
        position: 2,
        coverArt: null,
        track: {
          id: "507f1f77bcf86cd799439044",
          title: "Blue Monk",
          duration: 267,
          audioUrl: "https://cdn.example.com/audio/blue-monk.mp3",
          position: 2,
          coverArt: null,
        }
      }
    ],
    releaseUrls: [
      {
        id: "...",
        releaseId: "507f1f77bcf86cd799439011",
        urlId: "...",
        url: { id: "...", platform: "BANDCAMP", url: "https://label.bandcamp.com/album/midnight" }
      }
    ]
  }
}
```

#### Response — Not Found

```typescript
{
  success: false,
  error: "Release not found"
}
```

When `success: false`, the Server Component calls `notFound()` → renders `not-found.tsx`.

---

### SC-003: Get Other Releases by Artist (Carousel)

**Service**: `ReleaseService.getArtistOtherReleases(artistId: string, excludeReleaseId: string)`
**Called from**: `src/app/releases/[releaseId]/page.tsx` (Server Component)
**Cache**: None (dependent on current release context)

#### Signature

```typescript
static async getArtistOtherReleases(
  artistId: string,
  excludeReleaseId: string
): Promise<ServiceResponse<ReleaseCarouselItem[]>>
```

#### Parameters

| Name             | Type   | Required | Validation     | Description                   |
| ---------------- | ------ | -------- | -------------- | ----------------------------- |
| artistId         | string | Yes      | Valid ObjectId | Primary artist's document ID  |
| excludeReleaseId | string | Yes      | Valid ObjectId | Current release ID to exclude |

#### Response — Success

```typescript
{
  success: true,
  data: [
    {
      id: "507f1f77bcf86cd799439055",
      title: "Blue Notes",
      coverArt: "https://cdn.example.com/covers/blue-notes.jpg",
      releasedOn: "2024-11-20T00:00:00.000Z",
      publishedAt: "2024-11-15T00:00:00.000Z",
      // ...other Release scalar fields
      images: [
        { id: "...", src: "https://cdn.example.com/img3.jpg", altText: "Album cover", sortOrder: 0 }
      ]
    }
    // ...more releases, ordered by releasedOn DESC
  ]
}
```

#### Response — Empty (no other releases)

```typescript
{
  success: true,
  data: []
}
```

When `data` is empty, the carousel component is not rendered (FR-010).

---

## Data Flow Diagrams

### Releases Listing Page (`/releases`)

```text
Browser GET /releases
    │
    ▼
[Server Component: releases/page.tsx]
    │
    ├── ReleaseService.getPublishedReleases()
    │       │
    │       ├── withCache('published-releases', ..., 600_000)
    │       │       │
    │       │       ▼
    │       │   prisma.release.findMany(...)
    │       │
    │       ▼
    │   ServiceResponse<PublishedReleaseListing[]>
    │
    ├── Render: PageContainer > ContentContainer
    │       ├── BreadcrumbMenu (Home > Releases)
    │       ├── Heading
    │       ├── ReleaseSearchCombobox (client, receives releases[])
    │       │       └── Client-side filtering via cmdk
    │       └── ReleaseCardGrid
    │               └── ReleaseCard × N
    │
    ▼
HTML Response
```

### Release Media Player Page (`/releases/[releaseId]`)

```text
Browser GET /releases/{releaseId}
    │
    ▼
[Server Component: releases/[releaseId]/page.tsx]
    │
    ├── ReleaseService.getReleaseWithTracks(releaseId)
    │       │
    │       ▼
    │   ServiceResponse<PublishedReleaseDetail>
    │       │
    │       ├── success: false → notFound()
    │       └── success: true → continue
    │
    ├── Extract primaryArtistId = release.artistReleases[0]?.artist.id
    │
    ├── ReleaseService.getArtistOtherReleases(primaryArtistId, releaseId)
    │       │
    │       ▼
    │   ServiceResponse<ReleaseCarouselItem[]>
    │
    ├── Render: PageContainer > ContentContainer
    │       ├── BreadcrumbMenu (Home > Releases > {title})
    │       ├── ArtistReleasesCarousel (if otherReleases.length > 0)
    │       ├── ReleasePlayer (client component)
    │       │       ├── MediaPlayer.InteractiveCoverArt
    │       │       ├── MediaPlayer.Controls
    │       │       ├── MediaPlayer.TrackListDrawer
    │       │       └── MediaPlayer.InfoTickerTape
    │       └── ReleaseDescription (if description exists)
    │
    ▼
HTML Response
```
