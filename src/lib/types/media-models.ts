/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  Artist,
  ArtistListWithBio,
  ArtistScalars,
  ArtistWithPublishedReleases,
} from '@/lib/types/domain/artist';
import type { FeaturedArtist, FeaturedArtistFormatFile } from '@/lib/types/domain/featured-artist';
import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
  ReleaseScalars,
} from '@/lib/types/domain/release';
import type { Platform } from '@/lib/types/domain/shared';
import type { UrlRecord } from '@/lib/types/domain/url';
import type { User } from '@/lib/types/domain/user';

/**
 * Media model types that match the models in prisma/schema.prisma
 * These types are shared across the application for audio/media-related features
 */

// Vendor-neutral primitives now live in the Prisma-free domain layer. Re-exported
// here so existing importers keep working until they migrate to `@/lib/types/domain`.
export { FORMATS } from '@/lib/types/domain/shared';
export type { Format, Json, Platform } from '@/lib/types/domain/shared';

// Artist types are now hand-written, Prisma-free domain types (drift-checked in
// artist-repository). Imported above for local use, re-exported for back-compat.
export type { Artist, ArtistListWithBio, ArtistWithPublishedReleases };

// Release output types are now hand-written, Prisma-free domain types
// (drift-checked in release-repository). Imported above for local use,
// re-exported for back-compat with existing importers of `@/lib/types/media-models`.
export type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
  ReleaseListItem,
};

// FeaturedArtist types are now hand-written, Prisma-free domain types
// (drift-checked in featured-artist-repository). Imported above for local use,
// re-exported for back-compat with existing importers of this module.
export type { FeaturedArtist, FeaturedArtistFormatFile };

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

// `Artist` is re-exported from the domain layer at the top of this file.
// `FeaturedArtist` and `FeaturedArtistFormatFile` are re-exported from the
// domain layer above; their query include lives in featured-artist-repository
// (drift-checked against the domain types).

// `User` is now a hand-written, Prisma-free domain type (drift-checked in
// user-repository). Imported above for local use, re-exported for back-compat
// with existing importers of `@/lib/types/media-models`.
export type { User };

/**
 * Hand-written, Prisma-free mirror of the Prisma `Url` model with its optional
 * `artist` and `release` relations loaded. Mirrors `model Url` in
 * prisma/schema.prisma; both relations are optional in the schema, so each is
 * `| null` when included.
 */
export interface Url {
  id: string;
  artistId: string | null;
  releaseId: string | null;
  platform: Platform;
  url: string;
  artist: ArtistScalars | null;
  release: ReleaseScalars | null;
}

/**
 * Hand-written, Prisma-free mirror of the Prisma `ReleaseUrl` join model with
 * its required `release` and `url` relations loaded. Mirrors `model ReleaseUrl`
 * in prisma/schema.prisma.
 */
export interface ReleaseUrl {
  id: string;
  releaseId: string;
  urlId: string;
  release: ReleaseScalars;
  url: UrlRecord;
}

// `ArtistListWithBio` and `ArtistWithPublishedReleases` are re-exported from the
// domain layer at the top of this file; their query includes live in
// artist-repository (drift-checked against the domain types). The public release
// listing/detail/carousel types are re-exported from the domain layer near the
// top of this file; their query includes/selects live in release-repository
// (drift-checked against the domain types).
