# Data Model: Release Search & Media Player

**Phase**: 1 — Design & Contracts
**Date**: 2026-02-21
**Source**: Prisma schema at `prisma/schema.prisma`, types at `src/lib/types/media-models.ts`

---

## Entity Relationship Diagram

```text
┌──────────┐     ┌───────────────┐     ┌──────────┐
│  Artist   │────▶│ ArtistRelease │◀────│ Release  │
└──────────┘     └───────────────┘     └──────────┘
     │                                       │
     │ ArtistGroup                           │ ReleaseTrack
     ▼                                       ▼
┌──────────┐                           ┌──────────┐
│  Group   │                           │  Track   │
└──────────┘                           └──────────┘
                                             │
                                       ReleaseUrl
                                             ▼
                                       ┌──────────┐
                                       │   Url    │
                                       └──────────┘
```

---

## Entities Used by This Feature

### Release (central entity)

| Field       | Type              | Nullable | Description                                |
| ----------- | ----------------- | -------- | ------------------------------------------ |
| id          | String (ObjectId) | No       | Primary key                                |
| title       | String            | No       | Release title (unique)                     |
| coverArt    | String            | No       | Cover art image URL                        |
| description | String            | Yes      | Plain text blurb about the release         |
| releasedOn  | DateTime          | No       | Release date — used for sort order         |
| publishedAt | DateTime          | Yes      | Publication timestamp — null = unpublished |
| deletedOn   | DateTime          | Yes      | Soft-delete timestamp — null = active      |

**Relations used:**

- `images: Image[]` — additional images, ordered by `sortOrder`
- `artistReleases: ArtistRelease[]` — join to artists
- `releaseTracks: ReleaseTrack[]` — join to tracks (with position)
- `releaseUrls: ReleaseUrl[]` — join to URLs (platform-typed)

**Filters (both pages):**

- `publishedAt: { not: null }` — only published releases
- `deletedOn: null` — not soft-deleted

**Validation rules:**

- `title` is required and unique
- `coverArt` has a value but may be an empty string — treat empty string as "no cover art" in fallback chain
- `publishedAt` must be set for inclusion in public pages

**State transitions:** Not applicable (read-only feature; state managed by admin)

---

### Artist

| Field       | Type              | Nullable | Description             |
| ----------- | ----------------- | -------- | ----------------------- |
| id          | String (ObjectId) | No       | Primary key             |
| firstName   | String            | No       | First name              |
| surname     | String            | No       | Last name               |
| displayName | String            | Yes      | Overridden display name |

**Relations used:**

- `groups: ArtistGroup[]` — join to groups (for search and display name fallback)

**Display name fallback chain:**

1. `artist.displayName` (if non-null/non-empty)
2. `artist.firstName + ' ' + artist.surname`
3. First group's `displayName` (via `artist.groups[0].group.displayName`)
4. `'Unknown Artist'`

---

### Group

| Field       | Type              | Nullable | Description           |
| ----------- | ----------------- | -------- | --------------------- |
| id          | String (ObjectId) | No       | Primary key           |
| name        | String            | No       | Group name            |
| displayName | String            | Yes      | Display-friendly name |

**Used for:** Search field matching (group display name) and artist name fallback.

---

### Track

| Field    | Type              | Nullable | Description                 |
| -------- | ----------------- | -------- | --------------------------- |
| id       | String (ObjectId) | No       | Primary key                 |
| title    | String            | No       | Track title                 |
| duration | Int               | No       | Duration in seconds         |
| audioUrl | String            | No       | URL to the audio file       |
| position | Int               | No       | Order position in a release |
| coverArt | String            | Yes      | Track-specific cover art    |

**Validation rules:**

- `audioUrl` must be a valid URL for playback
- `position` determines track order in the media player

---

### Image

| Field     | Type              | Nullable | Description                |
| --------- | ----------------- | -------- | -------------------------- |
| id        | String (ObjectId) | No       | Primary key                |
| src       | String            | Yes      | Image URL                  |
| altText   | String            | Yes      | Alt text for accessibility |
| sortOrder | Int               | No       | Display order (default 0)  |

**Used for:** Cover art fallback when `release.coverArt` is empty/missing.

---

### Url

| Field    | Type              | Nullable | Description                             |
| -------- | ----------------- | -------- | --------------------------------------- |
| id       | String (ObjectId) | No       | Primary key                             |
| platform | Platform (enum)   | No       | Platform type (BANDCAMP, SPOTIFY, etc.) |
| url      | String            | No       | The external URL                        |

**Platform enum values used:** `BANDCAMP` (for card links on listing page)

---

### ArtistRelease (join table)

| Field     | Type              | Description  |
| --------- | ----------------- | ------------ |
| id        | String (ObjectId) | Primary key  |
| artistId  | String (ObjectId) | FK → Artist  |
| releaseId | String (ObjectId) | FK → Release |

**Constraints:** Unique on `[artistId, releaseId]`. Indexed on both FKs.

**Significance:** The order of `ArtistRelease` records determines the "primary artist" — the first artist in the join is used for the "other releases" carousel and primary display name.

---

### ArtistGroup (join table)

| Field    | Type              | Description |
| -------- | ----------------- | ----------- |
| id       | String (ObjectId) | Primary key |
| artistId | String (ObjectId) | FK → Artist |
| groupId  | String (ObjectId) | FK → Group  |

**Constraints:** Unique on `[artistId, groupId]`. Indexed on both FKs.

---

### ReleaseTrack (join table)

| Field     | Type              | Description                                |
| --------- | ----------------- | ------------------------------------------ |
| id        | String (ObjectId) | Primary key                                |
| releaseId | String (ObjectId) | FK → Release                               |
| trackId   | String (ObjectId) | FK → Track                                 |
| position  | Int               | Track position in this release (default 0) |
| coverArt  | String?           | Release-specific track cover art override  |

**Constraints:** Unique on `[releaseId, trackId]`. Indexed on both FKs.

**Note:** `position` on `ReleaseTrack` may differ from `Track.position`. Use `ReleaseTrack.position` for ordering tracks within a specific release.

---

### ReleaseUrl (join table)

| Field     | Type              | Description  |
| --------- | ----------------- | ------------ |
| id        | String (ObjectId) | Primary key  |
| releaseId | String (ObjectId) | FK → Release |
| urlId     | String (ObjectId) | FK → Url     |

**Indexed on:** `releaseId`

---

## Prisma Query Shapes

### Published releases for listing page

```typescript
prisma.release.findMany({
  where: { publishedAt: { not: null }, deletedOn: null },
  orderBy: { releasedOn: 'desc' },
  include: {
    images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    artistReleases: {
      include: {
        artist: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            displayName: true,
            groups: {
              include: {
                group: { select: { id: true, displayName: true } },
              },
            },
          },
        },
      },
    },
    releaseUrls: {
      include: {
        url: { select: { id: true, platform: true, url: true } },
      },
    },
  },
});
```

### Single release with tracks for media player page

```typescript
prisma.release.findFirst({
  where: { id, publishedAt: { not: null }, deletedOn: null },
  include: {
    images: { orderBy: { sortOrder: 'asc' } },
    artistReleases: {
      include: {
        artist: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            displayName: true,
          },
        },
      },
    },
    releaseTracks: {
      orderBy: { position: 'asc' },
      include: { track: true },
    },
    releaseUrls: {
      include: {
        url: { select: { id: true, platform: true, url: true } },
      },
    },
  },
});
```

### Other releases by artist

```typescript
prisma.release.findMany({
  where: {
    artistReleases: { some: { artistId } },
    id: { not: excludeReleaseId },
    publishedAt: { not: null },
    deletedOn: null,
  },
  orderBy: { releasedOn: 'desc' },
  include: {
    images: { orderBy: { sortOrder: 'asc' }, take: 1 },
  },
});
```

---

## New TypeScript Types Needed

```typescript
/** Published release for listing page — lightweight includes */
export type PublishedReleaseListing = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
    artistReleases: {
      include: {
        artist: {
          select: {
            id: true;
            firstName: true;
            surname: true;
            displayName: true;
            groups: { include: { group: { select: { id: true; displayName: true } } } };
          };
        };
      };
    };
    releaseUrls: {
      include: {
        url: { select: { id: true; platform: true; url: true } };
      };
    };
  };
}>;

/** Published release for media player page — full includes */
export type PublishedReleaseDetail = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
    artistReleases: {
      include: {
        artist: {
          select: {
            id: true;
            firstName: true;
            surname: true;
            displayName: true;
          };
        };
      };
    };
    releaseTracks: {
      include: { track: true };
    };
    releaseUrls: {
      include: {
        url: { select: { id: true; platform: true; url: true } };
      };
    };
  };
}>;

/** Minimal release for carousel items */
export type ReleaseCarouselItem = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
  };
}>;
```
