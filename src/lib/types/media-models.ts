/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Platform } from '@/lib/types/domain/shared';

import type { Prisma } from '@prisma/client';

/**
 * Media model types that match the models in prisma/schema.prisma
 * These types are shared across the application for audio/media-related features
 */

// Vendor-neutral primitives now live in the Prisma-free domain layer. Re-exported
// here so existing importers keep working until they migrate to `@/lib/types/domain`.
export { FORMATS } from '@/lib/types/domain/shared';
export type { Format, Json, Platform } from '@/lib/types/domain/shared';

// =============================================================================
// Model Interfaces (matching Prisma schema models)
// =============================================================================

/**
 * Image model - matches Prisma Image model
 */
export interface Image {
  id: string;
  caption?: string;
  artist: Artist;
  artistId: string;
  release?: Release;
  releaseId?: string;
  url?: Url;
  urlId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Genre model - matches Prisma Genre model
 */
export interface Genre {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Label model - matches Prisma Label model
 */
export interface Label {
  id: string;
  name: string;
  signedOn?: Date;
  createdAt: Date;
  updatedAt: Date;
  artistLabels: ArtistLabel[];
}

/**
 * ArtistMember model - matches Prisma ArtistMember model
 */
export interface ArtistMember {
  id: string;
  artist: Artist;
  artistId: string;
  member: Artist;
  memberId: string;
}

/**
 * ArtistLabel model - matches Prisma ArtistLabel model
 */
export interface ArtistLabel {
  id: string;
  artist: Artist;
  artistId: string;
  label: Label;
  labelId: string;
}

/**
 * ArtistRelease model - matches Prisma ArtistRelease model
 */
export interface ArtistRelease {
  id: string;
  artist: Artist;
  artistId: string;
  release: Release;
  releaseId: string;
}

/**
 * ArtistUrl model - matches Prisma ArtistUrl model
 */
export interface ArtistUrl {
  id: string;
  artist: Artist;
  artistId: string;
  platform: Platform;
  url: string;
}

/**
 * Tag model - matches Prisma Tag model
 */
export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Variants model - matches Prisma Variants model
 */
export interface Variants {
  id: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Instrument model - matches Prisma Instrument model
 */
export interface Instrument {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FeaturedArtist = Prisma.FeaturedArtistGetPayload<{
  include: {
    artists: {
      select: {
        id: true;
        displayName: true;
        firstName: true;
        surname: true;
        slug: true;
        images: { select: { src: true } };
      };
    };
    digitalFormat: {
      include: {
        files: true;
      };
    };
    release: {
      select: {
        id: true;
        title: true;
        coverArt: true;
        images: { select: { src: true } };
      };
    };
  };
}>;

/**
 * A single file within a digital format, used for playback in the
 * featured artists player.
 */
export type FeaturedArtistFormatFile = NonNullable<
  FeaturedArtist['digitalFormat']
>['files'][number];

/**
 * Artist model - matches Prisma Artist model
 */
export type Artist = Prisma.ArtistGetPayload<{
  include: {
    images: true;
    labels: true;
    releases: {
      include: {
        release: true;
      };
    };
    urls: true;
  };
}>;

export type User = Prisma.UserGetPayload<{
  include: {
    accounts: true;
    sessions: true;
  };
}>;

export type Release = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
    artistReleases: {
      include: {
        artist: true;
      };
    };
    digitalFormats: {
      include: {
        files: true;
      };
    };
    releaseUrls: {
      include: {
        url: true;
      };
    };
  };
}>;

/**
 * Prisma include for the admin releases listing. The admin grid only renders
 * release scalars, cover-art images, and the album-artist display name, so the
 * heavy `digitalFormats.files` and `releaseUrls` relations (loaded by the full
 * detail include) are deliberately omitted. Single source of truth for
 * `ReleaseListItem` — the repository query and the derived type reference this
 * same const so they can't drift.
 */
export const releaseListItemInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 3,
  },
  artistReleases: {
    include: {
      artist: true,
    },
  },
} as const satisfies Prisma.ReleaseInclude;

/**
 * Lightweight release row for the admin releases listing — release scalars
 * plus capped cover-art images and the artist join rows used to derive the
 * album-artist display name.
 */
export type ReleaseListItem = Prisma.ReleaseGetPayload<{
  include: typeof releaseListItemInclude;
}>;

export type Url = Prisma.UrlGetPayload<{
  include: {
    artist: true;
    release: true;
  };
}>;

export type ReleaseUrl = Prisma.ReleaseUrlGetPayload<{
  include: {
    release: true;
    url: true;
  };
}>;

// =============================================================================
// Public Release Types (for /releases pages)
// =============================================================================

/**
 * Prisma projection for the public releases grid page. Only the fields the
 * listing UI consumes (release cards + search combobox) are selected, keeping
 * both the Mongo read and the API payload small — this is the single source
 * of truth for `PublishedReleaseListing`.
 */
export const publishedReleaseListingSelect = {
  id: true,
  title: true,
  coverArt: true,
  releasedOn: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { src: true, altText: true },
  },
  artistReleases: {
    select: {
      artist: {
        select: { id: true, firstName: true, surname: true, displayName: true },
      },
    },
  },
  releaseUrls: {
    select: {
      url: { select: { platform: true, url: true } },
    },
  },
} as const satisfies Prisma.ReleaseSelect;

/**
 * Published release listing for the public releases grid page.
 * Includes artist display-name fields, first image (for cover art fallback),
 * and URLs (for Bandcamp link).
 */
export type PublishedReleaseListing = Prisma.ReleaseGetPayload<{
  select: typeof publishedReleaseListingSelect;
}>;

/**
 * Prisma projection for the media player page at /releases/[releaseId].
 * Artist rows are narrowed to display-name fields — the player never renders
 * artist images/labels/urls or the artist's other releases, and the full
 * nested include shipped every artist document (plus all of its releases)
 * in the page payload. Single source of truth for `PublishedReleaseDetail`.
 */
export const publishedReleaseDetailInclude = {
  images: {
    orderBy: { sortOrder: 'asc' },
  },
  artistReleases: {
    select: {
      artist: {
        // The full name-part set consumed by `getArtistDisplayName`.
        select: {
          id: true,
          firstName: true,
          middleName: true,
          surname: true,
          displayName: true,
          title: true,
          suffix: true,
        },
      },
    },
  },
  digitalFormats: {
    include: {
      files: {
        orderBy: { trackNumber: 'asc' },
      },
    },
  },
  releaseUrls: {
    include: {
      url: true,
    },
  },
} as const satisfies Prisma.ReleaseInclude;

/**
 * Published release detail for the media player page at /releases/[releaseId].
 * Includes MP3_320KBPS digital format files for audio playback, images, artist info, and URLs.
 */
export type PublishedReleaseDetail = Prisma.ReleaseGetPayload<{
  include: typeof publishedReleaseDetailInclude;
}>;

/**
 * Lightweight release type for the "other releases by this artist" carousel.
 * Only includes images for cover art display.
 */
export type ReleaseCarouselItem = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
  };
}>;

/**
 * Prisma include for the public artist detail page at /artists/[slug].
 * Single source of truth for `ArtistWithPublishedReleases` — the service query
 * and the derived type are guaranteed to match because both reference this
 * const, so a relation can't be declared on the type yet dropped from the query
 * (which would make the response fail client-side schema validation).
 */
export const artistWithPublishedReleasesInclude = {
  images: true,
  labels: true,
  urls: true,
  bioImages: { orderBy: { sortOrder: 'asc' } },
  bioLinks: { orderBy: { sortOrder: 'asc' } },
  members: { include: { member: true } },
  releases: {
    include: {
      release: {
        include: {
          images: true,
          artistReleases: { include: { artist: true } },
          digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
          releaseUrls: { include: { url: true } },
        },
      },
    },
  },
} as const satisfies Prisma.ArtistInclude;

/**
 * Artist with full published release data including MP3_320KBPS digital format files.
 * Used on the public artist detail page.
 */
export type ArtistWithPublishedReleases = Prisma.ArtistGetPayload<{
  include: typeof artistWithPublishedReleasesInclude;
}>;

/**
 * Prisma include for the public artists index at `/artists`. Pulls only the
 * primary identifying images (2–3) shown beside each card's short bio.
 */
export const artistListWithBioInclude = {
  bioImages: {
    where: { isPrimary: true },
    orderBy: { sortOrder: 'asc' },
    take: 3,
  },
} as const satisfies Prisma.ArtistInclude;

/** Published artist with its primary bio images, for the public listing. */
export type ArtistListWithBio = Prisma.ArtistGetPayload<{
  include: typeof artistListWithBioInclude;
}>;
