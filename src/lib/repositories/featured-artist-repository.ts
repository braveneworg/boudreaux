/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateFeaturedArtistData,
  FeaturedArtist,
  FeaturedArtistCountFilters,
  FeaturedArtistListFilters,
  UpdateFeaturedArtistData,
} from '@/lib/types/domain/featured-artist';

import { publicArtistWhere } from './_internal/artist-where';
import { bioImageWhere } from './_internal/bio-media-where';
import { featuredArtistWhere, featuredWindowAt } from './_internal/featured-artist-where';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/**
 * Prisma include configuration for featured artist queries with all relations.
 * Shared across every read/write so the returned shape always matches the
 * `FeaturedArtist` domain type consumed by the service and its Zod schemas.
 */
export const featuredArtistInclude = {
  // Project to only the fields the carousel/player and the display-name and
  // cover-art utils actually read — full Artist documents are large (bio,
  // notes[], addresses, …) and were shipped wholesale. `release.artistReleases`
  // (a 4th relation-fetch level — Prisma/MongoDB issues one query per relation
  // edge) is intentionally dropped: it only fed a third-priority display-name
  // fallback for records with no `displayName` and no connected `artists[]`.
  artists: {
    select: {
      id: true,
      displayName: true,
      firstName: true,
      surname: true,
      slug: true,
      // The display-image candidates (a human's chosen rows, else the job's
      // suggested ones) with what resolution reads; the service resolves and
      // caps them (ADR-0008). This read used to take the job's suggestion
      // (`isPrimary`) alone, so a featured row's cover fallback ignored the
      // image a human chose.
      bioImages: {
        where: bioImageWhere.displayCandidate,
        orderBy: { sortOrder: 'asc' },
        select: { url: true, alt: true, isPrimary: true, displayOrder: true },
      },
    },
  },
  digitalFormat: {
    include: {
      files: {
        orderBy: { trackNumber: 'asc' as const },
      },
    },
  },
  release: {
    select: {
      id: true,
      title: true,
      coverArt: true,
      images: { select: { src: true } },
    },
  },
} satisfies Prisma.FeaturedArtistInclude;

/**
 * The include for public reads: the same shape, naming only the artists that
 * are public artists (ADR-0015). Admin reads keep {@link featuredArtistInclude},
 * which names every connected artist.
 */
const publicFeaturedArtistInclude = {
  ...featuredArtistInclude,
  artists: { ...featuredArtistInclude.artists, where: publicArtistWhere },
} satisfies Prisma.FeaturedArtistInclude;

/**
 * A featured row the public may see as far as its artists go: it names no
 * artist at all (a row carried by its own display name), or at least one
 * public artist. A row whose artists are all hidden is dropped.
 */
const hasNoHiddenOnlyArtists = {
  OR: [{ artists: { none: {} } }, { artists: { some: publicArtistWhere } }],
} satisfies Prisma.FeaturedArtistWhereInput;

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// `FeaturedArtist` domain type diverges from the Prisma payload its query
// actually returns.
type _FeaturedArtistDrift = AssertExact<
  FeaturedArtist,
  Prisma.FeaturedArtistGetPayload<{ include: typeof featuredArtistInclude }>
>;
const _featuredArtistDrift: _FeaturedArtistDrift = true;

// =============================================================================
// Translators (domain input -> Prisma input; the return type is the drift guard)
// =============================================================================

/** Build a Prisma create payload from domain create data. */
const toPrismaCreate = (data: CreateFeaturedArtistData): Prisma.FeaturedArtistCreateInput => ({
  ...data,
});

/** Build a Prisma update payload from domain update data. */
const toPrismaUpdate = (data: UpdateFeaturedArtistData): Prisma.FeaturedArtistUpdateInput => ({
  ...data,
});

// =============================================================================
// Where builders (domain filters -> Prisma where; owned by the repository)
// =============================================================================

const containsInsensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * Build the admin-listing `where` from domain filters. The model has no
 * `deletedOn` field, so the `deleted` filter applies no constraint. The search
 * OR and the published OR are combined under `AND` so the two `OR` keys never
 * collide (Prisma 6 + MongoDB null-safe pattern).
 */
const buildListWhere = (filters: FeaturedArtistListFilters): Prisma.FeaturedArtistWhereInput => {
  const { search, published } = filters;
  const and: Prisma.FeaturedArtistWhereInput[] = [];

  if (published === true) {
    and.push(featuredArtistWhere.published);
  } else if (published === false) {
    and.push(featuredArtistWhere.unpublished);
  }
  if (search) {
    and.push({
      OR: [
        { displayName: containsInsensitive(search) },
        { description: containsInsensitive(search) },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
};

/**
 * Data-access layer for the FeaturedArtist model. The only layer that touches
 * Prisma for featured artists: it owns the query shape (include/where DSL),
 * translates domain input to Prisma input, and returns hand-written domain
 * types; failures surface as vendor-neutral `DataError`s.
 */
export class FeaturedArtistRepository {
  /** Create a featured artist, returning it with all relations included. */
  static async create(data: CreateFeaturedArtistData): Promise<FeaturedArtist> {
    return prisma.featuredArtist.create({
      data: toPrismaCreate(data),
      include: featuredArtistInclude,
    }) as Promise<FeaturedArtist>;
  }

  /**
   * Find featured artists currently visible on `currentDate` (published, within
   * the featured window), newest first, capped at `take`. A row whose artists
   * are all hidden is left out, and the rows returned name public artists
   * only (ADR-0015).
   */
  static async findFeatured(currentDate: Date, take: number): Promise<FeaturedArtist[]> {
    return prisma.featuredArtist.findMany({
      where: {
        ...featuredArtistWhere.published,
        ...featuredWindowAt(currentDate),
        AND: [hasNoHiddenOnlyArtists],
      },
      include: publicFeaturedArtistInclude,
      orderBy: {
        featuredOn: 'desc',
      },
      take,
    }) as Promise<FeaturedArtist[]>;
  }

  /**
   * Find featured artists for the admin listing. Builds the filter `where` from
   * domain filters, with skip/take pagination, ordered by position then
   * featured date.
   */
  static async findAll(filters: FeaturedArtistListFilters): Promise<FeaturedArtist[]> {
    const { skip = 0, take = 50 } = filters;
    return prisma.featuredArtist.findMany({
      where: buildListWhere(filters),
      skip,
      take,
      orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
      include: featuredArtistInclude,
    }) as Promise<FeaturedArtist[]>;
  }

  /** Count featured artists matching an optional published filter (admin dashboard). */
  static async count(filters: FeaturedArtistCountFilters = {}): Promise<number> {
    const where: Prisma.FeaturedArtistWhereInput =
      filters.published === true
        ? featuredArtistWhere.published
        : filters.published === false
          ? featuredArtistWhere.unpublished
          : {};
    return prisma.featuredArtist.count({ where });
  }

  /** Find a single featured artist by id, or `null` if it does not exist. */
  static async findById(id: string): Promise<FeaturedArtist | null> {
    return prisma.featuredArtist.findUnique({
      where: { id },
      include: featuredArtistInclude,
    }) as Promise<FeaturedArtist | null>;
  }

  /** Update a featured artist by id, returning it with all relations included. */
  static async update(id: string, data: UpdateFeaturedArtistData): Promise<FeaturedArtist> {
    return prisma.featuredArtist.update({
      where: { id },
      data: toPrismaUpdate(data),
      include: featuredArtistInclude,
    }) as Promise<FeaturedArtist>;
  }

  /** Persist a new cover-art URL on a featured artist (no relations re-hydrated). */
  static async updateCoverArt(id: string, coverArt: string): Promise<void> {
    await prisma.featuredArtist.update({
      where: { id },
      data: { coverArt },
    });
  }

  /** Hard-delete a featured artist by id, returning the deleted record. */
  static async delete(id: string): Promise<FeaturedArtist> {
    return prisma.featuredArtist.delete({
      where: { id },
      include: featuredArtistInclude,
    }) as Promise<FeaturedArtist>;
  }
}
