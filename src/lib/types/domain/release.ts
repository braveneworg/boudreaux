/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ArtistScalars } from './artist';
import type { ImageRecord } from './image';
import type { Format, Json, Platform } from './shared';
import type { UrlRecord } from './url';

/**
 * Hand-written mirrors of the Prisma release-graph models. Each is drift-checked
 * against its `Prisma.*GetPayload` counterpart in the release/artist repos.
 */

/**
 * Scalar fields of the Prisma `Release` model (no relations loaded). Declared as
 * a `type` (not `interface`) so release payloads built on it remain assignable
 * to `Record<string, unknown>` — the constraint the generic admin `DataView`
 * uses.
 */
export type ReleaseScalars = {
  id: string;
  title: string;
  labels: string[];
  releasedOn: Date;
  catalogNumber: string | null;
  coverArt: string;
  description: string | null;
  downloadUrls: string[];
  formats: Format[];
  extendedData: Json[];
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
  createdAt: Date;
  updatedAt: Date;
  deletedOn: Date | null;
  publishedAt: Date | null;
  featuredOn: Date | null;
  featuredUntil: Date | null;
  featuredDescription: string | null;
  tagId: string | null;
  suggestedPrice: number | null;
};

/** Scalar fields of the Prisma `ReleaseDigitalFormatFile` model. */
export interface ReleaseDigitalFormatFileRecord {
  id: string;
  formatId: string;
  trackNumber: number;
  title: string | null;
  duration: number | null;
  s3Key: string;
  fileName: string;
  fileSize: bigint;
  mimeType: string;
  checksum: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Scalar fields of the Prisma `ReleaseDigitalFormat` model. */
export interface ReleaseDigitalFormatScalars {
  id: string;
  releaseId: string;
  formatType: string;
  s3Key: string | null;
  fileName: string | null;
  fileSize: bigint | null;
  mimeType: string | null;
  trackCount: number;
  totalFileSize: bigint | null;
  checksum: string | null;
  deletedAt: Date | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** A digital format with its track files (`digitalFormats.include.files`). */
export interface ReleaseDigitalFormatRecord extends ReleaseDigitalFormatScalars {
  files: ReleaseDigitalFormatFileRecord[];
}

/** Scalar fields of the Prisma `ArtistRelease` join model. */
export interface ArtistReleaseScalars {
  id: string;
  artistId: string;
  releaseId: string;
}

/** A release→url join row with its `Url` (`releaseUrls.include.url`). */
export interface ReleaseUrlRecord {
  id: string;
  releaseId: string;
  urlId: string;
  url: UrlRecord;
}

/**
 * Full media `Release` graph: scalars plus images, artist join rows (with the
 * artist scalars), digital formats (with files), and release URLs (with url).
 * Matches the Prisma `Release` payload used across the media surfaces.
 */
export type Release = ReleaseScalars & {
  images: ImageRecord[];
  artistReleases: Array<ArtistReleaseScalars & { artist: ArtistScalars }>;
  digitalFormats: ReleaseDigitalFormatRecord[];
  releaseUrls: ReleaseUrlRecord[];
};

// =============================================================================
// Listing / projection output types
//
// Each mirrors a Prisma include/select shape that lives in release-repository
// (drift-checked there). Declared as `type` aliases — not interfaces — so any
// release type used as `DataView<T>` stays assignable to `Record<string,
// unknown>`.
// =============================================================================

/**
 * Lightweight release row for the admin releases listing — release scalars plus
 * capped cover-art images and the artist join rows (full artist scalars) used to
 * derive the album-artist display name. The heavy digital-format files and
 * release URLs are deliberately omitted. Mirrors `releaseListItemInclude`.
 */
export type ReleaseListItem = ReleaseScalars & {
  images: ImageRecord[];
  artistReleases: Array<ArtistReleaseScalars & { artist: ArtistScalars }>;
};

/** Narrow artist name projection consumed by the public releases listing card. */
export type PublishedReleaseListingArtist = {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
};

/** A single image projected for the public listing (`src`/`altText` only). */
export type PublishedReleaseListingImage = {
  src: string | null;
  altText: string | null;
};

/** A release→url join projected to the platform URL the listing renders. */
export type PublishedReleaseListingUrl = {
  url: { platform: Platform; url: string };
};

/**
 * Published release listing for the public releases grid page. Only the fields
 * the listing UI consumes (release cards + search combobox) are projected,
 * keeping both the Mongo read and the API payload small. Mirrors
 * `publishedReleaseListingSelect`.
 */
export type PublishedReleaseListing = {
  id: string;
  title: string;
  coverArt: string;
  releasedOn: Date;
  images: PublishedReleaseListingImage[];
  artistReleases: Array<{ artist: PublishedReleaseListingArtist }>;
  releaseUrls: PublishedReleaseListingUrl[];
};

/** Narrow artist name-part projection for the media-player detail page. */
export type PublishedReleaseDetailArtist = {
  id: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  displayName: string | null;
  title: string | null;
  suffix: string | null;
};

/**
 * Published release detail for the media player page at `/releases/[releaseId]`.
 * Includes digital format files for audio playback, unbounded images, narrowed
 * artist info, and release URLs. Mirrors `publishedReleaseDetailInclude`.
 */
export type PublishedReleaseDetail = ReleaseScalars & {
  images: ImageRecord[];
  artistReleases: Array<{ artist: PublishedReleaseDetailArtist }>;
  digitalFormats: ReleaseDigitalFormatRecord[];
  releaseUrls: ReleaseUrlRecord[];
};

/**
 * Lightweight release for the "other releases by this artist" carousel — release
 * scalars plus images for cover-art display. Mirrors the carousel include.
 */
export type ReleaseCarouselItem = ReleaseScalars & {
  images: ImageRecord[];
};

/**
 * Narrow projection for bio release-link injection — just the id and title.
 * Produced by `ReleaseRepository.findPublishedByArtist` and consumed by the
 * bio-generation service to append internal `/releases/:id` links after
 * generation (the lambda has no DB access).
 */
export interface ReleaseLinkSource {
  id: string;
  title: string;
}

/**
 * S3-cleanup view of a release loaded before a hard delete — just the
 * digital-format files and images needed to enumerate S3 keys. Mirrors the
 * `findForDeletion` include in release-repository.
 */
export type ReleaseForDeletion = ReleaseScalars & {
  images: ImageRecord[];
  digitalFormats: ReleaseDigitalFormatRecord[];
};

// =============================================================================
// Input types
// =============================================================================

/** Writable release scalar fields shared by create/update. */
export interface ReleaseWritableData {
  title?: string;
  labels?: string[];
  releasedOn?: Date;
  catalogNumber?: string;
  coverArt?: string;
  description?: string;
  downloadUrls?: string[];
  formats?: Format[];
  notes?: string[];
  executiveProducedBy?: string[];
  coProducedBy?: string[];
  masteredBy?: string[];
  mixedBy?: string[];
  recordedBy?: string[];
  artBy?: string[];
  designBy?: string[];
  photographyBy?: string[];
  linerNotesBy?: string[];
  publishedAt?: Date | null;
  featuredOn?: Date | null;
  featuredUntil?: Date | null;
  featuredDescription?: string;
  suggestedPrice?: number | null;
  deletedOn?: Date | null;
}

/** Data accepted by the repository to create a release. */
export interface CreateReleaseData extends ReleaseWritableData {
  id?: string;
  title: string;
  releasedOn: Date;
  coverArt: string;
  formats: Format[];
}

/** Data accepted by the repository to update a release (all fields optional). */
export type UpdateReleaseData = ReleaseWritableData;

/** Pagination + filters for the admin releases listing. */
export interface ReleaseListFilters {
  skip?: number;
  take?: number;
  search?: string;
  artistIds?: string[];
  published?: boolean;
  deleted?: boolean;
}

/** Pagination + optional search for the public published-releases listing. */
export interface PublishedReleaseFilters {
  skip?: number;
  take?: number;
  search?: string;
}

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface ReleaseCountFilters {
  published?: boolean;
}
