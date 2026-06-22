/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { VenueScalars } from '@/lib/types/tours';

import { runQuery } from '../_internal/map-prisma-error';

import type { AssertExact } from '../_internal/drift';
import type { Prisma } from '@prisma/client';

export interface VenueQueryParams {
  search?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface VenueCreateData {
  name: string;
  address?: string | null;
  city: string;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  capacity?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface VenueUpdateData {
  name?: string;
  address?: string | null;
  city?: string;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  capacity?: number | null;
  notes?: string | null;
  timeZone?: string | null;
}

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// `VenueScalars` diverges from the Prisma venue model scalars.
type _VenueDrift = AssertExact<VenueScalars, Prisma.VenueGetPayload<Record<never, never>>>;
const _venueDrift: _VenueDrift = true;

/**
 * Build the venue search/city `where` shared by `findAll` and `count`. Returns
 * `undefined` when no filters are provided.
 */
const buildWhere = (search?: string, city?: string): Prisma.VenueWhereInput | undefined => {
  const where: Prisma.VenueWhereInput = {};
  let hasWhere = false;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
    hasWhere = true;
  }

  if (city) {
    where.city = { equals: city, mode: 'insensitive' };
    hasWhere = true;
  }

  return hasWhere ? where : undefined;
};

/**
 * Repository for Venue data access operations. The only layer that touches
 * Prisma for venues: it owns the where DSL, wraps every call in `runQuery`, and
 * returns hand-written, Prisma-free domain types.
 */
export class VenueRepository {
  /**
   * Find all venues with optional filtering, search, and pagination.
   */
  static async findAll(params?: VenueQueryParams): Promise<VenueScalars[]> {
    const { search, city, page, limit } = params ?? {};

    const query: Prisma.VenueFindManyArgs = {
      orderBy: { name: 'asc' },
    };

    const where = buildWhere(search, city);
    if (where) {
      query.where = where;
    }

    if (page !== undefined && limit !== undefined) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    return runQuery(() => prisma.venue.findMany(query));
  }

  /**
   * Find the most recently created venues, ordered by createdAt descending.
   * Used as the default list before the user types a search term.
   */
  static async findRecent(limit = 5): Promise<VenueScalars[]> {
    return runQuery(() =>
      prisma.venue.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    );
  }

  /**
   * Find a single venue by ID.
   */
  static async findById(id: string): Promise<VenueScalars | null> {
    return runQuery(() =>
      prisma.venue.findUnique({
        where: { id },
      })
    );
  }

  /**
   * Find venues by exact name match (case-insensitive). Used for duplicate
   * checking.
   */
  static async findByName(name: string): Promise<VenueScalars[]> {
    return runQuery(() =>
      prisma.venue.findMany({
        where: {
          name: { equals: name, mode: 'insensitive' },
        },
        take: 1,
      })
    );
  }

  /**
   * Create a new venue.
   */
  static async create(data: VenueCreateData): Promise<VenueScalars> {
    return runQuery(() =>
      prisma.venue.create({
        data,
      })
    );
  }

  /**
   * Update an existing venue.
   */
  static async update(id: string, data: VenueUpdateData, userId: string): Promise<VenueScalars> {
    return runQuery(() =>
      prisma.venue.update({
        where: { id },
        data: {
          ...data,
          updatedBy: userId,
        },
      })
    );
  }

  /**
   * Delete a venue. Will fail if venue has associated tours (foreign key
   * constraint).
   */
  static async delete(id: string): Promise<VenueScalars> {
    return runQuery(() =>
      prisma.venue.delete({
        where: { id },
      })
    );
  }

  /**
   * Count total venues matching the query. Used for pagination metadata.
   */
  static async count(params?: VenueQueryParams): Promise<number> {
    const { search, city } = params ?? {};
    const where = buildWhere(search, city) ?? {};

    return runQuery(() => prisma.venue.count({ where }));
  }
}
