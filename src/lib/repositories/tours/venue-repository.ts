/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '../../prisma';

import type { Prisma, Venue } from '@prisma/client';

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
}

/**
 * Repository for Venue data access operations.
 * Provides CRUD operations and query methods for venue management.
 */
export class VenueRepository {
  /**
   * Find all venues with optional filtering, search, and pagination
   */
  static async findAll(params?: VenueQueryParams): Promise<Venue[]> {
    const { search, city, page, limit } = params ?? {};

    // Build where clause only if filters are provided
    const where: Prisma.VenueWhereInput = {};
    let hasWhere = false;

    // Apply search filter across name, address, and city
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
      hasWhere = true;
    }

    // Apply city filter (exact match, case-insensitive)
    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
      hasWhere = true;
    }

    // Build query object conditionally
    const query: Prisma.VenueFindManyArgs = {
      orderBy: { name: 'asc' },
    };

    if (hasWhere) {
      query.where = where;
    }

    if (page !== undefined && limit !== undefined) {
      query.skip = (page - 1) * limit;
      query.take = limit;
    }

    return prisma.venue.findMany(query);
  }

  /**
   * Find the most recently created venues, ordered by createdAt descending.
   * Used as the default list before the user types a search term.
   */
  static async findRecent(limit = 5): Promise<Venue[]> {
    return prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Find a single venue by ID
   */
  static async findById(id: string): Promise<Venue | null> {
    return prisma.venue.findUnique({
      where: { id },
    });
  }

  /**
   * Find venues by exact name match (case-insensitive)
   * Used for duplicate checking
   */
  static async findByName(name: string): Promise<Venue[]> {
    return prisma.venue.findMany({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
      take: 1,
    });
  }

  /**
   * Create a new venue
   */
  static async create(data: VenueCreateData): Promise<Venue> {
    return prisma.venue.create({
      data,
    });
  }

  /**
   * Update an existing venue
   */
  static async update(id: string, data: VenueUpdateData, userId: string): Promise<Venue> {
    return prisma.venue.update({
      where: { id },
      data: {
        ...data,
        updatedBy: userId,
      },
    });
  }

  /**
   * Delete a venue
   * Will fail if venue has associated tours (foreign key constraint)
   */
  static async delete(id: string): Promise<Venue> {
    return prisma.venue.delete({
      where: { id },
    });
  }

  /**
   * Count total venues matching the query
   * Used for pagination metadata
   */
  static async count(params?: VenueQueryParams): Promise<number> {
    const { search, city } = params ?? {};

    const where: Prisma.VenueWhereInput = {};

    // Apply same filters as findAll
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    return prisma.venue.count({ where });
  }
}
