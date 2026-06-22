/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { TourScalars, TourWithRelations } from '@/lib/types/tours';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import { runQuery } from '../_internal/map-prisma-error';

import type { AssertExact } from '../_internal/drift';
import type { Prisma } from '@prisma/client';

export interface TourQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  /** Offset for skip/take pagination (takes precedence over page/limit). */
  skip?: number;
  /** Page size for skip/take pagination (takes precedence over page/limit). */
  take?: number;
}

export interface TourCreateData {
  title: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface TourUpdateData {
  title?: string;
  subtitle?: string | null;
  subtitle2?: string | null;
  description?: string | null;
  notes?: string | null;
}

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Tour include — ordered images plus tour dates with venue + headliners. */
const tourInclude = {
  images: {
    orderBy: { displayOrder: 'asc' as const },
  },
  tourDates: {
    include: {
      venue: true,
      headliners: {
        include: {
          artist: true,
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { startDate: 'asc' as const },
  },
} satisfies Prisma.TourInclude;

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// `TourWithRelations` diverges from the Prisma payload this include returns.
type _TourDrift = AssertExact<
  TourWithRelations,
  Prisma.TourGetPayload<{ include: typeof tourInclude }>
>;
const _tourDrift: _TourDrift = true;

/**
 * Re-export of the full tour payload type. Historically defined here; the
 * hand-written, Prisma-free source of truth now lives in `@/lib/types/tours`
 * and is drift-checked above.
 */
export type { TourWithRelations };

/**
 * Builds the case-insensitive search filter shared by `findAll` and `count`.
 * Mirrors the fields the public tours page previously matched client-side: tour
 * title/subtitles/description, venue name/city/state, and headliner artist
 * names. Returns `undefined` when no search term is given.
 */
const buildSearchWhere = (search?: string): Prisma.TourWhereInput | undefined => {
  if (!search) return undefined;

  const contains = { contains: search, mode: 'insensitive' as const };

  return {
    OR: [
      { title: contains },
      { subtitle: contains },
      { subtitle2: contains },
      { description: contains },
      // Venue and headliner matches share a SINGLE `tourDates: { some }` with
      // an inner OR. Two separate `tourDates: { some }` clauses under the outer
      // OR make Prisma's MongoDB connector emit a `$size` on a null array
      // (error 17124) for tours that have no tour dates.
      {
        tourDates: {
          some: {
            OR: [
              { venue: { OR: [{ name: contains }, { city: contains }, { state: contains }] } },
              {
                headliners: {
                  some: {
                    artist: {
                      OR: [
                        { firstName: contains },
                        { surname: contains },
                        { displayName: contains },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
};

/**
 * Repository for Tour data access operations. The only layer that touches Prisma
 * for tours: it owns the query shapes (include/search DSL), wraps every call in
 * `runQuery` so callers see vendor-neutral `DataError`s, and returns
 * hand-written, Prisma-free domain types.
 */
export class TourRepository {
  /**
   * Find all tours with optional filtering, search, and pagination.
   * Returns tours with tourDates (including venues and headliners) and images.
   *
   * Pagination accepts either `skip`/`take` (preferred, drives infinite scroll)
   * or legacy `page`/`limit`.
   */
  static async findAll(params?: TourQueryParams): Promise<TourWithRelations[]> {
    const { search, page, limit, skip, take } = params ?? {};

    const query: Prisma.TourFindManyArgs = {
      orderBy: { createdAt: 'desc' },
      include: tourInclude,
    };

    const where = buildSearchWhere(search);
    if (where) {
      query.where = where;
    }

    // Prefer explicit skip/take; fall back to page/limit for legacy callers.
    if (skip !== undefined || take !== undefined) {
      if (skip !== undefined) query.skip = skip;
      if (take !== undefined) query.take = take;
    } else if (page !== undefined && limit !== undefined) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    return runQuery(() => prisma.tour.findMany(query)) as Promise<TourWithRelations[]>;
  }

  /**
   * Find a single tour by ID with all relations.
   */
  static async findById(id: string): Promise<TourWithRelations | null> {
    if (!OBJECT_ID_REGEX.test(id)) {
      return null;
    }

    return runQuery(() =>
      prisma.tour.findUnique({
        where: { id },
        include: tourInclude,
      })
    );
  }

  /**
   * Create a new tour (without tour dates - add dates separately).
   */
  static async create(data: TourCreateData): Promise<TourScalars> {
    return runQuery(() => prisma.tour.create({ data }));
  }

  /**
   * Update an existing tour (basic info only).
   * Manage tour dates separately via TourDateRepository.
   */
  static async update(
    id: string,
    data: TourUpdateData,
    userId: string
  ): Promise<TourWithRelations> {
    return runQuery(() =>
      prisma.tour.update({
        where: { id },
        data: {
          ...data,
          updatedBy: userId,
        },
        include: tourInclude,
      })
    );
  }

  /**
   * Delete a tour. Cascades to related records (headliners, dates, images)
   * inside a transaction so a tour never leaves orphaned children behind.
   */
  static async delete(id: string): Promise<TourScalars> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.tourDateHeadliner.deleteMany({
          where: {
            tourDate: {
              tourId: id,
            },
          },
        });

        await tx.tourDate.deleteMany({
          where: { tourId: id },
        });

        await tx.tourImage.deleteMany({
          where: { tourId: id },
        });

        return tx.tour.delete({
          where: { id },
        });
      })
    );
  }

  /**
   * Count total tours matching the query. Used for pagination metadata.
   */
  static async count(params?: TourQueryParams): Promise<number> {
    const { search } = params ?? {};

    // Apply the same search filter as findAll.
    const where = buildSearchWhere(search) ?? {};

    return runQuery(() => prisma.tour.count({ where }));
  }
}
