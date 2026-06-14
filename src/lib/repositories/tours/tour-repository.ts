/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

import type { Prisma, Tour } from '@prisma/client';

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

/**
 * Prisma include configuration for tour queries with all relations
 */
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

/**
 * Type for Tour with all relations loaded
 */
export type TourWithRelations = Prisma.TourGetPayload<{
  include: typeof tourInclude;
}>;

/**
 * Repository for Tour data access operations.
 * Provides CRUD operations and query methods for tour management.
 */
export class TourRepository {
  /**
   * Builds the case-insensitive search filter shared by {@link findAll} and
   * {@link count}. Mirrors the fields the public tours page previously matched
   * client-side: tour title/subtitles/description, venue name/city/state, and
   * headliner artist names. Returns `undefined` when no search term is given.
   */
  private static buildSearchWhere(search?: string): Prisma.TourWhereInput | undefined {
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
  }

  /**
   * Find all tours with optional filtering, search, and pagination
   * Returns tours with tourDates (including venues and headliners) and images
   *
   * Pagination accepts either `skip`/`take` (preferred, drives infinite scroll)
   * or legacy `page`/`limit`.
   */
  static async findAll(params?: TourQueryParams): Promise<TourWithRelations[]> {
    const { search, page, limit, skip, take } = params ?? {};

    // Build query object
    const query: Prisma.TourFindManyArgs = {
      orderBy: { createdAt: 'desc' },
      include: tourInclude,
    };

    const where = TourRepository.buildSearchWhere(search);
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

    return prisma.tour.findMany(query) as Promise<TourWithRelations[]>;
  }

  /**
   * Find a single tour by ID with all relations
   */
  static async findById(id: string): Promise<TourWithRelations | null> {
    if (!OBJECT_ID_REGEX.test(id)) {
      return null;
    }

    return prisma.tour.findUnique({
      where: { id },
      include: tourInclude,
    });
  }

  /**
   * Create a new tour (without tour dates - add dates separately)
   */
  static async create(data: TourCreateData): Promise<Tour> {
    return prisma.tour.create({
      data,
    });
  }

  /**
   * Update an existing tour (basic info only)
   * Manage tour dates separately via TourDateRepository
   */
  static async update(id: string, data: TourUpdateData, userId: string): Promise<Tour> {
    return prisma.tour.update({
      where: { id },
      data: {
        ...data,
        updatedBy: userId,
      },
      include: tourInclude,
    });
  }

  /**
   * Delete a tour
   * Cascades to related records (headliners, images) based on schema
   */
  static async delete(id: string): Promise<Tour> {
    return prisma.$transaction(async (tx) => {
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
    });
  }

  /**
   * Count total tours matching the query
   * Used for pagination metadata
   */
  static async count(params?: TourQueryParams): Promise<number> {
    const { search } = params ?? {};

    // Apply the same search filter as findAll.
    const where = TourRepository.buildSearchWhere(search) ?? {};

    return prisma.tour.count({ where });
  }
}
