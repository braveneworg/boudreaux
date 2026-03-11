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
          artist: {
            include: {
              groups: {
                include: {
                  group: true,
                },
              },
            },
          },
          group: true,
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
   * Find all tours with optional filtering, search, and pagination
   * Returns tours with tourDates (including venues and headliners) and images
   */
  static async findAll(params?: TourQueryParams): Promise<TourWithRelations[]> {
    const { search, page, limit } = params ?? {};

    // Build query object
    const query: Prisma.TourFindManyArgs = {
      orderBy: { createdAt: 'desc' },
      include: tourInclude,
    };

    // Apply search filter across title, subtitle, and description
    if (search) {
      query.where = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { subtitle: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Apply pagination if provided
    if (page !== undefined && limit !== undefined) {
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

    const where: Prisma.TourWhereInput = {};

    // Apply same search filter as findAll
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { subtitle: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return prisma.tour.count({ where });
  }
}
