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

/**
 * Format enum - matches Prisma Format enum
 */
export type Format =
  | 'DIGITAL'
  | 'MP3_320KBPS'
  | 'MP3_256KBPS'
  | 'MP3_192KBPS'
  | 'MP3_128KBPS'
  | 'FLAC'
  | 'ALAC'
  | 'WAV'
  | 'AIFF'
  | 'AAC'
  | 'OGG_VORBIS'
  | 'WMA'
  | 'CD'
  | 'VINYL'
  | 'VINYL_7_INCH'
  | 'VINYL_10_INCH'
  | 'VINYL_12_INCH'
  | 'VINYL_180G'
  | 'VINYL_COLORED'
  | 'VINYL_PICTURE_DISC'
  | 'VINYL_GATEFOLD'
  | 'VINYL_SPLATTERED'
  | 'VINYL_ETCHED'
  | 'VINYL_45RPM'
  | 'VINYL_33RPM'
  | 'VINYL_TRANSPARENT'
  | 'VINYL_DOUBLE_LP'
  | 'VINYL_TRIPLE_LP'
  | 'VINYL_QUAD_LP'
  | 'CASSETTE'
  | 'VIDEO'
  | 'OTHER';

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
 * Group model - matches Prisma Group model
 */
export interface Group {
  id: string;
  name: string;
  formedOn?: Date;
  endedOn?: Date;
  bio?: string;
  shortBio?: string;
  createdAt: Date;
  updatedAt: Date;
  images: Image[];
  artistGroups: ArtistGroup[];
  urls: Url[];
}

/**
 * Url model - matches Prisma Url model
 */
export interface Url {
  id: string;
  artist: Artist;
  artistId: string;
  release?: Release;
  releaseId?: string;
  group?: Group;
  groupId?: string;
  platform: Platform;
  url: string;
  images: Image[];
  releaseUrls: ReleaseUrl[];
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
 * Artist model - matches Prisma Artist model
 */
export interface Artist {
  id: string;
  firstName: string;
  middleName?: string;
  surname: string;
  akaNames?: string;
  displayName?: string;
  title?: string;
  suffix?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  bio?: string;
  shortBio?: string;
  altBio?: string;
  slug: string;
  genres?: string;
  bornOn?: Date;
  diedOn?: Date;
  featuredOn?: Date;
  publishedOn?: Date;
  createdAt: Date;
  updatedAt?: Date;
  archivedAt?: Date;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
  notes: string[];
  images: Image[];
  artistLabels: ArtistLabel[];
  artistGroups: ArtistGroup[];
  artistReleases: ArtistRelease[];
  urls: Url[];
  tags?: string;
  isPseudonymous: boolean;
  isActive: boolean;
  instruments?: string;
  artistUrls: ArtistUrl[];
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
 * ReleaseUrl model - matches Prisma ReleaseUrl model
 */
export interface ReleaseUrl {
  id: string;
  release: Release;
  releaseId: string;
  url: Url;
  urlId: string;
}

/**
 * Release model - matches Prisma Release model
 */
export interface Release {
  id: string;
  title: string;
  labels: string[];
  releasedOn: Date;
  catalogNumber?: string;
  coverArt: string;
  downloadUrls: string[];
  formats: Format[];
  extendedData: Json[];
  images: Image[];
  tags: string[];
  notes: string[];
  executiveProducedBy: string[];
  coProducedBy: string[];
  masteredBy: string[];
  mixedBy: string[];
  recordedBy: string[];
  artBy: string[];
  designBy: string[];
  photographyBy: string[];
  linerNotesBy: string[];
  imageTypes: string[];
  variants: string[];
  releaseTracks: ReleaseTrack[];
  artistReleases: ArtistRelease[];
  releaseUrls: ReleaseUrl[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  urls: Url[];
}

/**
 * Track model - matches Prisma Track model
 */
export interface Track {
  id: string;
  title: string;
  duration: number;
  audioFile: string;
  createdAt: Date;
  updatedAt: Date;
  images: Image[];
  position: number;
  releaseTracks: ReleaseTrack[];
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
