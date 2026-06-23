/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseDigitalFormatRecord } from './release';

/**
 * Hand-written, Prisma-free mirrors of the narrowly-projected Prisma
 * `FeaturedArtist` graph. The output type is drift-checked against its
 * `Prisma.FeaturedArtistGetPayload` counterpart inside
 * featured-artist-repository, so a schema change that isn't reflected here fails
 * `pnpm run typecheck`.
 */

// =============================================================================
// Output records
// =============================================================================

/**
 * Scalar fields of the Prisma `FeaturedArtist` model (no relations loaded).
 * Declared as a `type` (not `interface`) so featured-artist payloads remain
 * assignable to `Record<string, unknown>` — the constraint the generic admin
 * `DataView` uses.
 */
export type FeaturedArtistScalars = {
  id: string;
  displayName: string | null;
  featuredOn: Date;
  featuredUntil: Date | null;
  digitalFormatId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedOn: Date | null;
  position: number;
  description: string | null;
  coverArt: string | null;
  featuredTrackNumber: number | null;
  releaseId: string | null;
};

/** Narrow artist projection on a featured artist (carousel/player). */
export type FeaturedArtistArtist = {
  id: string;
  displayName: string | null;
  firstName: string;
  surname: string;
  slug: string;
  images: Array<{ src: string | null }>;
};

/** Narrow release projection on a featured artist (cover-art/title display). */
export type FeaturedArtistRelease = {
  id: string;
  title: string;
  coverArt: string;
  images: Array<{ src: string | null }>;
};

/**
 * A single file within a featured artist's digital format, used for playback in
 * the featured artists player. Mirrors the Prisma `ReleaseDigitalFormatFile`
 * scalar shape (re-exported from the release domain so the chains share it).
 */
export type { ReleaseDigitalFormatFileRecord as FeaturedArtistFormatFile } from './release';

/**
 * Featured artist payload with its narrowly-projected artists, digital format
 * (with files), and release. Declared as a `type` (not `interface`) so it stays
 * assignable to `Record<string, unknown>` for `DataView<FeaturedArtist>`. Mirrors
 * `featuredArtistInclude` in featured-artist-repository (drift-checked there).
 */
export type FeaturedArtist = FeaturedArtistScalars & {
  artists: FeaturedArtistArtist[];
  digitalFormat: ReleaseDigitalFormatRecord | null;
  release: FeaturedArtistRelease | null;
};

// =============================================================================
// Input types
// =============================================================================

/** Connect-by-id operation for a to-one or to-many relation. */
export type ConnectById = { id: string };

/** Connect a set of artists to a featured artist (create). */
export type FeaturedArtistArtistConnect = {
  connect: ConnectById[];
};

/** Replace the connected artists of a featured artist (update). */
export type FeaturedArtistArtistSet = {
  set: ConnectById[];
};

/** Connect a single related record by id (digital format / release). */
export type FeaturedArtistRelationConnect = {
  connect: ConnectById;
};

/** Writable featured-artist scalar fields shared by create/update. */
export interface FeaturedArtistWritableData {
  displayName?: string | null;
  description?: string | null;
  coverArt?: string | null;
  position?: number;
  featuredOn?: Date;
  featuredUntil?: Date | null;
  featuredTrackNumber?: number | null;
  publishedOn?: Date | null;
}

/** Data accepted by the repository to create a featured artist. */
export interface CreateFeaturedArtistData extends FeaturedArtistWritableData {
  artists?: FeaturedArtistArtistConnect;
  digitalFormat?: FeaturedArtistRelationConnect;
  release?: FeaturedArtistRelationConnect;
}

/** Data accepted by the repository to update a featured artist. */
export interface UpdateFeaturedArtistData extends FeaturedArtistWritableData {
  artists?: FeaturedArtistArtistSet;
  digitalFormat?: FeaturedArtistRelationConnect;
  release?: FeaturedArtistRelationConnect;
}

/** Pagination + filters for the admin featured-artist listing. */
export interface FeaturedArtistListFilters {
  skip?: number;
  take?: number;
  search?: string;
  published?: boolean;
  /**
   * Accepted for a uniform admin API but applies no constraint: the
   * `FeaturedArtist` model has no `deletedOn` field.
   */
  deleted?: boolean;
}

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface FeaturedArtistCountFilters {
  published?: boolean;
}
