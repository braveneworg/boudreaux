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
  group?: Group;
  groupId?: string;
  track?: Track;
  trackId?: string;
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
 * ArtistGroup model - matches Prisma ArtistGroup model
 */
export interface ArtistGroup {
  id: string;
  artist: Artist;
  artistId: string;
  group: Group;
  groupId: string;
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
 * ReleaseTrack model - matches Prisma ReleaseTrack model
 */
export interface ReleaseTrack {
  id: string;
  release: Release;
  releaseId: string;
  track: Track;
  trackId: string;
  position: number;
  coverArt?: string;
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
    track: true;
    release: {
      include: {
        releaseTracks: {
          include: {
            track: true;
          };
        };
        images: true;
      };
    };
    group: true;
  };
}>;

export type Group = Prisma.GroupGetPayload<{
  include: {
    images: true;
    artistGroups: true;
    urls: true;
  };
}>;

/**
 * Track model - matches Prisma Track model
 */
export type Track = Prisma.TrackGetPayload<{
  include: {
    images: true;
    releaseTracks: true;
  };
}>;

/**
 * Artist model - matches Prisma Artist model
 */
export type Artist = Prisma.ArtistGetPayload<{
  include: {
    images: true;
    labels: true;
    groups: true;
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
    releaseTracks: {
      include: {
        track: true;
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
    track: true;
  };
}>;

export type ReleaseUrl = Prisma.ReleaseUrlGetPayload<{
  include: {
    release: true;
    url: true;
  };
}>;
