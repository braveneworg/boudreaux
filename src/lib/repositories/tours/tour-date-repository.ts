/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';
import type { TourDateScalars, TourDateWithTourAndRelations } from '@/lib/types/tours';
import { OBJECT_ID_REGEX } from '@/utils/validation/object-id';

import { runQuery } from '../_internal/map-prisma-error';

import type { AssertExact } from '../_internal/drift';
import type { Prisma } from '@prisma/client';

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

// =============================================================================
// Query shapes (single source of truth for both the query and the drift check)
// =============================================================================

/** Tour-date include — venue, parent tour, and ordered headliners. */
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

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// payload type diverges from the Prisma payload this include returns.
type _TourDateDrift = AssertExact<
  TourDateWithTourAndRelations,
  Prisma.TourDateGetPayload<{ include: typeof tourDateInclude }>
>;
const _tourDateDrift: _TourDateDrift = true;

type TourDateUpdateFields = Omit<TourDateUpdateData, 'headlinerIds'>;

/**
 * Coerce a date/string update value to the Prisma "leave-unchanged" form: a
 * null or empty value becomes `undefined` so the field is not written. Mirrors
 * the original `field || undefined` expression.
 */
const coalesceUpdateValue = <T extends Date | string | null | undefined>(
  value: T
): NonNullable<T> | undefined => value || undefined;

/** Build the schedule (date/time) portion of the update payload. */
const toScheduleUpdate = (fields: TourDateUpdateFields): Prisma.TourDateUpdateInput => ({
  ...(fields.startDate !== undefined && { startDate: coalesceUpdateValue(fields.startDate) }),
  ...(fields.endDate !== undefined && { endDate: coalesceUpdateValue(fields.endDate) }),
  ...(fields.showStartTime !== undefined && {
    showStartTime: coalesceUpdateValue(fields.showStartTime),
  }),
  ...(fields.showEndTime !== undefined && {
    showEndTime: coalesceUpdateValue(fields.showEndTime),
  }),
  ...(fields.doorsOpenAt !== undefined && {
    doorsOpenAt: coalesceUpdateValue(fields.doorsOpenAt),
  }),
});

/** Build the ticket/notes portion of the update payload. */
const toDetailsUpdate = (fields: TourDateUpdateFields): Prisma.TourDateUpdateInput => ({
  ...(fields.ticketsUrl !== undefined && { ticketsUrl: coalesceUpdateValue(fields.ticketsUrl) }),
  ...(fields.ticketPrices !== undefined && {
    ticketPrices: coalesceUpdateValue(fields.ticketPrices),
  }),
  ...(fields.notes !== undefined && { notes: coalesceUpdateValue(fields.notes) }),
});

/**
 * Build the Prisma update payload from domain update data. Converts null values
 * to `undefined` (leave-unchanged) for the date/string fields, and translates a
 * `venueId` into a `connect`. Headliner replacement is handled separately.
 */
const toPrismaUpdate = (data: TourDateUpdateFields): Prisma.TourDateUpdateInput => {
  const { venueId, timeZone, utcOffset } = data;
  return {
    ...toScheduleUpdate(data),
    ...toDetailsUpdate(data),
    ...(timeZone !== undefined && { timeZone }),
    ...(utcOffset !== undefined && { utcOffset }),
    ...(venueId && {
      venue: {
        connect: { id: venueId },
      },
    }),
  };
};

/**
 * Repository for TourDate data access operations. The only layer that touches
 * Prisma for tour dates: it owns the include/update DSL, wraps every call in
 * `runQuery`, and returns hand-written, Prisma-free domain types.
 */
export class TourDateRepository {
  /**
   * Find all tour dates for a specific tour.
   */
  static async findByTourId(tourId: string): Promise<TourDateWithTourAndRelations[]> {
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return [];
    }

    return runQuery(() =>
      prisma.tourDate.findMany({
        where: { tourId },
        orderBy: { startDate: 'asc' },
        include: tourDateInclude,
      })
    );
  }

  /**
   * Find a single tour date by ID with all relations.
   */
  static async findById(id: string): Promise<TourDateWithTourAndRelations | null> {
    if (!OBJECT_ID_REGEX.test(id)) {
      return null;
    }

    return runQuery(() =>
      prisma.tourDate.findUnique({
        where: { id },
        include: tourDateInclude,
      })
    );
  }

  /**
   * Create a new tour date with headliners. Headliners are linked via the
   * TourDateHeadliner junction table. Returns the created tour date scalars;
   * callers should refetch if full relations are needed.
   */
  static async create(data: TourDateCreateData): Promise<TourDateScalars> {
    const { headlinerIds, venueId, tourId, ...tourDateData } = data;

    const tourDate = await runQuery(() =>
      prisma.tourDate.create({
        data: {
          ...tourDateData,
          tour: {
            connect: { id: tourId },
          },
          venue: {
            connect: { id: venueId },
          },
        },
      })
    );

    // Create TourDateHeadliner records with sortOrder
    if (headlinerIds && headlinerIds.length > 0) {
      await runQuery(() =>
        prisma.tourDateHeadliner.createMany({
          data: headlinerIds.map((artistId, index) => ({
            tourDateId: tourDate.id,
            artistId,
            sortOrder: index,
          })),
        })
      );
    }

    return tourDate;
  }

  /**
   * Update an existing tour date. If headlinerIds are provided, replaces all
   * existing headliner associations.
   */
  static async update(id: string, data: TourDateUpdateData): Promise<TourDateWithTourAndRelations> {
    const { headlinerIds, ...rest } = data;
    const updateData = toPrismaUpdate(rest);

    // If headlinerIds are provided, replace all existing headliner associations
    if (headlinerIds !== undefined) {
      await runQuery(() =>
        prisma.tourDateHeadliner.deleteMany({
          where: { tourDateId: id },
        })
      );

      if (headlinerIds.length > 0) {
        await runQuery(() =>
          prisma.tourDateHeadliner.createMany({
            data: headlinerIds.map((artistId, index) => ({
              tourDateId: id,
              artistId,
              sortOrder: index,
            })),
          })
        );
      }
    }

    return runQuery(() =>
      prisma.tourDate.update({
        where: { id },
        data: updateData,
        include: tourDateInclude,
      })
    );
  }

  /**
   * Delete a tour date. Cascades to related records (headliners) per schema.
   */
  static async delete(id: string): Promise<TourDateScalars> {
    return runQuery(() =>
      prisma.tourDate.delete({
        where: { id },
      })
    );
  }

  /**
   * Count total tour dates for a specific tour.
   */
  static async countByTourId(tourId: string): Promise<number> {
    if (!OBJECT_ID_REGEX.test(tourId)) {
      return 0;
    }

    return runQuery(() =>
      prisma.tourDate.count({
        where: { tourId },
      })
    );
  }

  /**
   * Find all upcoming tour dates across all tours. Useful for public display of
   * upcoming shows.
   */
  static async findUpcoming(limit?: number): Promise<TourDateWithTourAndRelations[]> {
    const now = new Date();
    return runQuery(() =>
      prisma.tourDate.findMany({
        where: {
          startDate: {
            gte: now,
          },
        },
        orderBy: { startDate: 'asc' },
        take: limit,
        include: tourDateInclude,
      })
    );
  }

  /** Count tour dates scheduled on or after now (used by the admin dashboard). */
  static async countUpcoming(): Promise<number> {
    return runQuery(() =>
      prisma.tourDate.count({
        where: { startDate: { gte: new Date() } },
      })
    );
  }

  /**
   * Update the setTime for a specific headliner on a tour date.
   */
  static async updateHeadlinerSetTime(headlinerId: string, setTime: Date | null): Promise<void> {
    await runQuery(() =>
      prisma.tourDateHeadliner.update({
        where: { id: headlinerId },
        data: { setTime },
      })
    );
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
    const result = await runQuery(() =>
      prisma.tourDateHeadliner.updateMany({
        where: { tourDateId, artistId },
        data: { setTime },
      })
    );

    return result.count > 0;
  }

  /**
   * Remove a specific headliner from a tour date. Only deletes the
   * TourDateHeadliner junction record — does NOT delete the artist.
   */
  static async removeHeadliner(headlinerId: string): Promise<void> {
    await runQuery(() =>
      prisma.tourDateHeadliner.delete({
        where: { id: headlinerId },
      })
    );
  }

  /**
   * Remove a headliner identified by the (tourDateId, artistId) pair.
   * Returns true when at least one row is deleted.
   */
  static async removeHeadlinerByTourDateAndArtist(
    tourDateId: string,
    artistId: string
  ): Promise<boolean> {
    const result = await runQuery(() =>
      prisma.tourDateHeadliner.deleteMany({
        where: { tourDateId, artistId },
      })
    );

    return result.count > 0;
  }

  /**
   * Reorder headliners for a tour date by updating sortOrder in batch.
   */
  static async reorderHeadliners(_tourDateId: string, headlinerIds: string[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(
        headlinerIds.map((id, index) =>
          prisma.tourDateHeadliner.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      )
    );
  }
}
