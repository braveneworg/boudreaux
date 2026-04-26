/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '../../prisma';
import { OBJECT_ID_REGEX } from '../../utils/validation/object-id';

import type { Prisma, TourDate } from '@prisma/client';

export interface HeadlinerInput {
  artistId: string;
  setTime?: Date | null;
}

export interface TourDateCreateData {
  tourId: string;
  startDate: Date;
  endDate?: Date | null;
  showStartTime: Date;
  showEndTime?: Date | null;
  doorsOpenAt?: Date | null;
  venueId: string;
  ticketsUrl?: string | null;
  ticketIconUrl?: string | null;
  ticketPrices?: string | null;
  notes?: string | null;
  headlinerIds: string[];
  timeZone?: string | null;
  utcOffset?: number | null;
}

export interface TourDateUpdateData {
  startDate?: Date | null;
  endDate?: Date | null;
  showStartTime?: Date | null;
  showEndTime?: Date | null;
  doorsOpenAt?: Date | null;
  venueId?: string;
  ticketsUrl?: string | null;
  ticketIconUrl?: string | null;
  ticketPrices?: string | null;
  notes?: string | null;
  headlinerIds?: string[];
  timeZone?: string | null;
  utcOffset?: number | null;
}

/**
 * Prisma include configuration for tour date queries with all relations
 */
const tourDateInclude = {
  venue: true,
  tour: true,
  headliners: {
    include: {
      artist: true,
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
   * Create a new tour date with headliners
   * Headliners are linked via TourDateHeadliner junction table
   */
  static async create(data: TourDateCreateData): Promise<TourDate> {
    const { headlinerIds, venueId, tourId, ...tourDateData } = data;

    // Create the tour date with proper Prisma types
    const tourDate = await prisma.tourDate.create({
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
      await prisma.tourDateHeadliner.createMany({
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
      ...(tourDateData.doorsOpenAt !== undefined && {
        doorsOpenAt: tourDateData.doorsOpenAt || undefined,
      }),
      ...(tourDateData.ticketsUrl !== undefined && {
        ticketsUrl: tourDateData.ticketsUrl || undefined,
      }),
      ...(tourDateData.ticketPrices !== undefined && {
        ticketPrices: tourDateData.ticketPrices || undefined,
      }),
      ...(tourDateData.notes !== undefined && { notes: tourDateData.notes || undefined }),
      ...(tourDateData.timeZone !== undefined && { timeZone: tourDateData.timeZone }),
      ...(tourDateData.utcOffset !== undefined && { utcOffset: tourDateData.utcOffset }),
      ...(venueId && {
        venue: {
          connect: { id: venueId },
        },
      }),
    };

    // If headlinerIds are provided, replace all existing headliner associations
    if (headlinerIds !== undefined) {
      // Delete existing headliners
      await prisma.tourDateHeadliner.deleteMany({
        where: { tourDateId: id },
      });

      // Create new headliner records with sortOrder
      if (headlinerIds.length > 0) {
        await prisma.tourDateHeadliner.createMany({
          data: headlinerIds.map((artistId, index) => ({
            tourDateId: id,
            artistId,
            sortOrder: index,
          })),
        });
      }

      // Update tour date fields
      return prisma.tourDate.update({
        where: { id },
        data: updateData,
        include: tourDateInclude,
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

  /**
   * Update the setTime for a specific headliner on a tour date
   */
  static async updateHeadlinerSetTime(headlinerId: string, setTime: Date | null): Promise<void> {
    await prisma.tourDateHeadliner.update({
      where: { id: headlinerId },
      data: { setTime },
    });
  }

  /**
   * Update setTime for a headliner identified by the (tourDateId, artistId) pair.
   * Returns true when at least one row is updated.
   */
  static async updateHeadlinerSetTimeByTourDateAndArtist(
    tourDateId: string,
    artistId: string,
    setTime: Date | null
  ): Promise<boolean> {
    const result = await prisma.tourDateHeadliner.updateMany({
      where: { tourDateId, artistId },
      data: { setTime },
    });

    return result.count > 0;
  }

  /**
   * Remove a specific headliner from a tour date
   * Only deletes the TourDateHeadliner junction record — does NOT delete the artist
   */
  static async removeHeadliner(headlinerId: string): Promise<void> {
    await prisma.tourDateHeadliner.delete({
      where: { id: headlinerId },
    });
  }

  /**
   * Remove a headliner identified by the (tourDateId, artistId) pair.
   * Returns true when at least one row is deleted.
   */
  static async removeHeadlinerByTourDateAndArtist(
    tourDateId: string,
    artistId: string
  ): Promise<boolean> {
    const result = await prisma.tourDateHeadliner.deleteMany({
      where: { tourDateId, artistId },
    });

    return result.count > 0;
  }

  /**
   * Reorder headliners for a tour date by updating sortOrder in batch
   */
  static async reorderHeadliners(_tourDateId: string, headlinerIds: string[]): Promise<void> {
    await prisma.$transaction(
      headlinerIds.map((id, index) =>
        prisma.tourDateHeadliner.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
  }
}
