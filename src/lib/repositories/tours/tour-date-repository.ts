/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '../../prisma';
import { OBJECT_ID_REGEX } from '../../utils/validation/object-id';

import type { Prisma, TourDate } from '@prisma/client';

export interface TourDateCreateData {
  tourId: string;
  startDate: Date;
  endDate?: Date | null;
  showStartTime: Date;
  showEndTime?: Date | null;
  venueId: string;
  ticketsUrl?: string | null;
  ticketPrices?: string | null;
  notes?: string | null;
  headlinerIds: string[];
}

export interface TourDateUpdateData {
  startDate?: Date | null;
  endDate?: Date | null;
  showStartTime?: Date | null;
  showEndTime?: Date | null;
  venueId?: string;
  ticketsUrl?: string | null;
  ticketPrices?: string | null;
  notes?: string | null;
  headlinerIds?: string[];
}

/**
 * Prisma include configuration for tour date queries with all relations
 */
const tourDateInclude = {
  venue: true,
  tour: true,
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
} satisfies Prisma.TourDateInclude;

/**
 * Repository for TourDate data access operations.
 * Provides CRUD operations for individual tour date entries.
 */
export class TourDateRepository {
  /**
   * Find all tour dates for a specific tour
   */
  static async findByTourId(tourId: string): Promise<TourDate[]> {
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return [];
    }

    return prisma.tourDate.findMany({
      where: { tourId },
      orderBy: { startDate: 'asc' },
      include: tourDateInclude,
    });
  }

  /**
   * Find a single tour date by ID with all relations
   */
  static async findById(id: string): Promise<TourDate | null> {
    if (!OBJECT_ID_REGEX.test(id)) {
      return null;
    }

    return prisma.tourDate.findUnique({
      where: { id },
      include: tourDateInclude,
    });
  }

  /**
   * Create a new tour date with headliners in a transaction
   * Headliners are linked via TourDateHeadliner junction table
   */
  static async create(data: TourDateCreateData): Promise<TourDate> {
    const { headlinerIds, venueId, tourId, ...tourDateData } = data;

    return prisma.$transaction(async (tx) => {
      // Create the tour date with proper Prisma types
      const tourDate = await tx.tourDate.create({
        data: {
          ...tourDateData,
          tour: {
            connect: { id: tourId },
          },
          venue: {
            connect: { id: venueId },
          },
        },
      });

      // Create TourDateHeadliner records with sortOrder
      if (headlinerIds && headlinerIds.length > 0) {
        await tx.tourDateHeadliner.createMany({
          data: headlinerIds.map((artistId, index) => ({
            tourDateId: tourDate.id,
            artistId,
            sortOrder: index,
          })),
        });
      }

      // Return the created tour date
      // Caller should refetch if full relations are needed
      return tourDate;
    });
  }

  /**
   * Update an existing tour date
   * If headlinerIds are provided, replaces all existing headliner associations
   */
  static async update(id: string, data: TourDateUpdateData): Promise<TourDate> {
    const { headlinerIds, venueId, ...tourDateData } = data;

    // Build the Prisma update data object with proper types
    // Convert null values to undefined for Prisma compatibility
    const updateData: Prisma.TourDateUpdateInput = {
      ...(tourDateData.startDate !== undefined && {
        startDate: tourDateData.startDate || undefined,
      }),
      ...(tourDateData.endDate !== undefined && { endDate: tourDateData.endDate || undefined }),
      ...(tourDateData.showStartTime !== undefined && {
        showStartTime: tourDateData.showStartTime || undefined,
      }),
      ...(tourDateData.showEndTime !== undefined && {
        showEndTime: tourDateData.showEndTime || undefined,
      }),
      ...(tourDateData.ticketsUrl !== undefined && {
        ticketsUrl: tourDateData.ticketsUrl || undefined,
      }),
      ...(tourDateData.ticketPrices !== undefined && {
        ticketPrices: tourDateData.ticketPrices || undefined,
      }),
      ...(tourDateData.notes !== undefined && { notes: tourDateData.notes || undefined }),
      ...(venueId && {
        venue: {
          connect: { id: venueId },
        },
      }),
    };

    // If headlinerIds are provided, use transaction to update headliners
    if (headlinerIds !== undefined) {
      return prisma.$transaction(async (tx) => {
        // Delete existing headliners
        await tx.tourDateHeadliner.deleteMany({
          where: { tourDateId: id },
        });

        // Create new headliner records with sortOrder
        if (headlinerIds.length > 0) {
          await tx.tourDateHeadliner.createMany({
            data: headlinerIds.map((artistId, index) => ({
              tourDateId: id,
              artistId,
              sortOrder: index,
            })),
          });
        }

        // Update tour date fields
        return tx.tourDate.update({
          where: { id },
          data: updateData,
          include: tourDateInclude,
        });
      });
    }

    // Simple update without headliner changes
    return prisma.tourDate.update({
      where: { id },
      data: updateData,
      include: tourDateInclude,
    });
  }

  /**
   * Delete a tour date
   * Cascades to related records (headliners) based on schema
   */
  static async delete(id: string): Promise<TourDate> {
    return prisma.tourDate.delete({
      where: { id },
    });
  }

  /**
   * Count total tour dates for a specific tour
   */
  static async countByTourId(tourId: string): Promise<number> {
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return 0;
    }

    return prisma.tourDate.count({
      where: { tourId },
    });
  }

  /**
   * Find all upcoming tour dates across all tours
   * Useful for public display of upcoming shows
   */
  static async findUpcoming(limit?: number): Promise<TourDate[]> {
    const now = new Date();
    return prisma.tourDate.findMany({
      where: {
        startDate: {
          gte: now,
        },
      },
      orderBy: { startDate: 'asc' },
      take: limit,
      include: tourDateInclude,
    });
  }
}
