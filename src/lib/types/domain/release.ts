/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ArtistScalars } from './artist';
import type { ImageRecord } from './image';
import type { Format, Json } from './shared';
import type { UrlRecord } from './url';

/**
 * Hand-written mirrors of the Prisma release-graph models. Each is drift-checked
 * against its `Prisma.*GetPayload` counterpart in the release/artist repos.
 */

/** Scalar fields of the Prisma `Release` model (no relations loaded). */
export interface ReleaseScalars {
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
}

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
export interface Release extends ReleaseScalars {
  images: ImageRecord[];
  artistReleases: Array<ArtistReleaseScalars & { artist: ArtistScalars }>;
  digitalFormats: ReleaseDigitalFormatRecord[];
  releaseUrls: ReleaseUrlRecord[];
}
