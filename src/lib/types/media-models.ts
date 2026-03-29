/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Prisma } from '@prisma/client';

/**
 * Media model types that match the models in prisma/schema.prisma
 * These types are shared across the application for audio/media-related features
 */

// =============================================================================
// Enums (matching Prisma schema enums)
// =============================================================================

/**
 * Platform enum - matches Prisma Platform enum
 */
export type Platform =
  | 'SPOTIFY'
  | 'APPLE_MUSIC'
  | 'BANDCAMP'
  | 'YOUTUBE'
  | 'SOUNDCLOUD'
  | 'AMAZON_MUSIC'
  | 'FACEBOOK'
  | 'TWITTER'
  | 'INSTAGRAM'
  | 'BLUESKY'
  | 'TIKTOK'
  | 'WEBSITE'
  | 'PATREON'
  | 'DISCOGS';

export const FORMATS = {
  // Use AI to expand this list as needed
  DIGITAL: 'DIGITAL',
  MP3_320KBPS: 'MP3_320KBPS',
  MP3_256KBPS: 'MP3_256KBPS',
  MP3_192KBPS: 'MP3_192KBPS',
  MP3_128KBPS: 'MP3_128KBPS',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
  AAC: 'AAC',
  OGG_VORBIS: 'OGG_VORBIS',
  WMA: 'WMA',
  CD: 'CD',
  VINYL: 'VINYL',
  VINYL_7_INCH: 'VINYL_7_INCH',
  VINYL_10_INCH: 'VINYL_10_INCH',
  VINYL_12_INCH: 'VINYL_12_INCH',
  VINYL_180G: 'VINYL_180G',
  VINYL_COLORED: 'VINYL_COLORED',
  VINYL_PICTURE_DISC: 'VINYL_PICTURE_DISC',
  VINYL_GATEFOLD: 'VINYL_GATEFOLD',
  VINYL_SPLATTERED: 'VINYL_SPLATTERED',
  VINYL_ETCHED: 'VINYL_ETCHED',
  VINYL_45RPM: 'VINYL_45RPM',
  VINYL_33RPM: 'VINYL_33RPM',
  VINYL_TRANSPARENT: 'VINYL_TRANSPARENT',
  VINYL_DOUBLE_LP: 'VINYL_DOUBLE_LP',
  VINYL_TRIPLE_LP: 'VINYL_TRIPLE_LP',
  VINYL_QUAD_LP: 'VINYL_QUAD_LP',
  CASSETTE: 'CASSETTE',
  VIDEO: 'VIDEO',
  OTHER: 'OTHER',
} as const;

export type Format = (typeof FORMATS)[keyof typeof FORMATS];

// =============================================================================
// Base Types
// =============================================================================

/**
 * Json type for extended data fields
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

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
      include: {
        images: true;
      };
    };
    digitalFormat: {
      include: {
        files: true;
      };
    };
    release: {
      include: {
        images: true;
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
 * Published release listing for the public releases grid page.
 * Includes artist info, first image (for cover art fallback), and URLs (for Bandcamp link).
 */
export type PublishedReleaseListing = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
    artistReleases: {
      include: {
        artist: true;
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
 * Published release detail for the media player page at /releases/[releaseId].
 * Includes MP3_320KBPS digital format files for audio playback, images, artist info, and URLs.
 */
export type PublishedReleaseDetail = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
    artistReleases: {
      include: {
        artist: {
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
        };
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
 * Lightweight release type for the "other releases by this artist" carousel.
 * Only includes images for cover art display.
 */
export type ReleaseCarouselItem = Prisma.ReleaseGetPayload<{
  include: {
    images: true;
  };
}>;

/**
 * Artist with full published release data including MP3_320KBPS digital format files.
 * Used on the public artist detail page.
 */
export type ArtistWithPublishedReleases = Prisma.ArtistGetPayload<{
  include: {
    images: true;
    labels: true;
    urls: true;
    members: { include: { member: true } };
    releases: {
      include: {
        release: {
          include: {
            images: true;
            artistReleases: { include: { artist: true } };
            digitalFormats: { include: { files: true } };
            releaseUrls: { include: { url: true } };
          };
        };
      };
    };
  };
}>;
