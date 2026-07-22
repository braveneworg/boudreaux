/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ImageRecord } from './image';
import type { ArtistReleaseScalars, Release, ReleaseScalars } from './release';
import type { Json } from './shared';
import type { UrlRecord } from './url';

/**
 * Hand-written, Prisma-free mirrors of the Prisma `Artist` graph. Each output
 * type is drift-checked against its `Prisma.ArtistGetPayload` counterpart inside
 * artist-repository, so a schema change that isn't reflected here fails
 * `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `Artist` model (no relations loaded). Declared as
 * a `type` (not `interface`) so artist payloads remain assignable to
 * `Record<string, unknown>` — the constraint the generic admin `DataView` uses.
 */
export type ArtistScalars = {
  id: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  akaNames: string | null;
  displayName: string | null;
  title: string | null;
  suffix: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  bio: string | null;
  shortBio: string | null;
  altBio: string | null;
  bioGeneratedAt: Date | null;
  bioModel: string | null;
  bioStatus: string | null;
  bioError: string | null;
  bioStartedAt: Date | null;
  bioJobToken: string | null;
  bioProgress: Json | null;
  slug: string;
  genres: string | null;
  bornOn: Date | null;
  diedOn: Date | null;
  formedOn: Date | null;
  publishedOn: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  deletedOn: Date | null;
  deletedBy: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  reactivatedAt: Date | null;
  reactivatedBy: string | null;
  notes: string[];
  tags: string | null;
  isPseudonymous: boolean;
  isActive: boolean;
  instruments: string | null;
  featuredArtistId: string | null;
};

/** Scalar fields of the Prisma `ArtistLabel` join model (`labels: true`). */
export interface ArtistLabelRecord {
  id: string;
  artistId: string;
  labelId: string;
}

/** Scalar fields of the Prisma `ArtistMember` join model. */
export interface ArtistMemberScalars {
  id: string;
  artistId: string;
  memberId: string;
}

/** Scalar fields of the Prisma `ArtistBioImage` model. */
export interface ArtistBioImageRecord {
  id: string;
  artistId: string;
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  /** Machine-readable license page from Commons, when known. */
  licenseUrl: string | null;
  sourceUrl: string | null;
  /** Original external image URL kept so save-time re-hosting can fetch the full-resolution source. */
  originalUrl: string | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  kind: string | null;
  alt: string | null;
  /** Rekognition face signal: `true`/`false` once analyzed, `null` when not analyzed. */
  hasFace: boolean | null;
  /** Rekognition face-match confidence 0–100, `null` when not analyzed. */
  faceScore: number | null;
  /** Provenance: `'generated'` (AI discovery) or `'custom'` (admin upload); `null`/missing on legacy rows, read as generated. */
  origin: string | null;
  sortOrder: number;
  createdAt: Date;
}

/** Fields for creating one bio image row (manual upload / curated addition). */
export interface CreateArtistBioImageData {
  artistId: string;
  url: string;
  thumbnailUrl?: string | null;
  title?: string | null;
  attribution?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  width?: number | null;
  height?: number | null;
  isPrimary?: boolean;
  kind?: string | null;
  alt?: string | null;
  /** Always `'custom'` for this manual-upload path; the repository stamps it when absent. */
  origin?: 'custom';
}

/** Scalar fields of the Prisma `ArtistBioLink` model. */
export interface ArtistBioLinkRecord {
  id: string;
  artistId: string;
  label: string;
  url: string;
  kind: string | null;
  /** Provenance: `'generated'` (AI discovery) or `'custom'` (admin-authored); `null`/missing on legacy rows, read as generated. */
  origin: string | null;
  sortOrder: number;
}

/** Fields for creating one bio link row (admin-authored custom link). */
export interface CreateArtistBioLinkData {
  artistId: string;
  label: string;
  url: string;
  kind?: string | null;
  /** Always `'custom'` for this admin-authored path; the repository stamps it when absent. */
  origin?: 'custom';
}

/**
 * Admin artist payload: scalars plus capped images, label joins, release joins
 * (with release scalars), and platform URLs. Matches the default media `Artist`.
 */
export type Artist = ArtistScalars & {
  images: ImageRecord[];
  labels: ArtistLabelRecord[];
  releases: Array<ArtistReleaseScalars & { release: ReleaseScalars }>;
  urls: UrlRecord[];
};

/**
 * Public artist-detail payload: scalars plus images, labels, urls, bio
 * images/links, band members (with member scalars), and release joins carrying
 * the full media `Release` graph.
 */
export interface ArtistWithPublishedReleases extends ArtistScalars {
  images: ImageRecord[];
  labels: ArtistLabelRecord[];
  urls: UrlRecord[];
  bioImages: ArtistBioImageRecord[];
  bioLinks: ArtistBioLinkRecord[];
  members: Array<ArtistMemberScalars & { member: ArtistScalars }>;
  releases: Array<ArtistReleaseScalars & { release: Release }>;
}

/** Public artists-index row: scalars plus primary bio images. */
export interface ArtistListWithBio extends ArtistScalars {
  bioImages: ArtistBioImageRecord[];
}

/** Narrow release projection loaded for public artist-search matches. */
export interface ArtistSearchReleaseRecord {
  id: string;
  title: string;
  publishedAt: Date | null;
  deletedOn: Date | null;
}

/**
 * Public artist-search match: scalars plus the first image and release joins
 * carrying the narrow release projection the search consumes.
 */
export interface ArtistSearchMatch extends ArtistScalars {
  images: ImageRecord[];
  releases: Array<ArtistReleaseScalars & { release: ArtistSearchReleaseRecord }>;
}

/** Narrow name projection used by the find-or-create-by-name flow. */
export interface ArtistNameRecord {
  id: string;
  displayName: string | null;
  firstName: string;
  surname: string;
}

// =============================================================================
// Input types
// =============================================================================

/** A nested image to connect-or-create when writing an artist. */
export interface ArtistImageInput {
  id: string;
  src: string;
  altText?: string | null;
  caption?: string | null;
}

/** A nested platform URL to connect-or-create when writing an artist. */
export interface ArtistUrlInput {
  id: string;
  platform: string;
  url: string;
}

/** Writable artist scalar fields shared by create/update. */
export interface ArtistWritableData {
  firstName?: string;
  middleName?: string | null;
  surname?: string;
  akaNames?: string | null;
  displayName?: string | null;
  title?: string | null;
  suffix?: string | null;
  bio?: string | null;
  shortBio?: string | null;
  altBio?: string | null;
  slug?: string;
  genres?: string | null;
  tags?: string | null;
  instruments?: string | null;
  isActive?: boolean;
  isPseudonymous?: boolean;
  bornOn?: Date | null;
  diedOn?: Date | null;
  formedOn?: Date | null;
  publishedOn?: Date | null;
  publishedBy?: string | null;
  createdBy?: string | null;
  deletedOn?: Date | null;
}

/** Data accepted by the repository to create an artist. */
export interface CreateArtistData extends ArtistWritableData {
  firstName: string;
  surname: string;
  slug: string;
  images?: ArtistImageInput[];
  urls?: ArtistUrlInput[];
}

/** Data accepted by the repository to update an artist (all fields optional). */
export type UpdateArtistData = ArtistWritableData;

/** Pagination + filters for the admin artist listing. */
export interface ArtistListFilters {
  search?: string;
  published?: boolean;
  deleted?: boolean;
  skip?: number;
  take?: number;
}
