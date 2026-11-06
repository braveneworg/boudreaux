/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { failFromError } from '@/lib/services/_internal/map-data-error';
import type { ServiceResponse } from '@/lib/services/service.types';
import { DataError } from '@/lib/types/domain/errors';
import type { TourDateWithTourAndRelations } from '@/lib/types/tours';
import { loggers } from '@/lib/utils/logger';
import type {
  TourDateCreateInput,
  TourDateUpdateInput,
} from '@/lib/validation/tours/tour-date-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { OBJECT_ID_REGEX } from '@/utils/validation/object-id';

const logger = loggers.media;

/** A headliner named by its junction id, with the ids a NOT_FOUND retry may use. */
export interface HeadlinerRef {
  headlinerId: string;
  tourDateId?: string;
  artistId?: string;
}

/** A failure with fixed copy: what the caller shows, whatever the cause. */
const failed = (error: string): { success: false; error: string; code: 'UNKNOWN' } => ({
  success: false,
  error,
  code: 'UNKNOWN',
});

const SUCCEEDED: ServiceResponse<void> = { success: true, data: undefined };

/**
 * The tour date and artist a headliner operation may retry by, or null when
 * it may not: the first attempt failed with anything but NOT_FOUND, or the
 * caller did not send both ids as ObjectIds.
 */
const retryIds = (
  error: unknown,
  { tourDateId, artistId }: HeadlinerRef
): { tourDateId: string; artistId: string } | null => {
  const isNotFound = error instanceof DataError && error.code === 'NOT_FOUND';
  if (!isNotFound || !tourDateId || !artistId) {
    return null;
  }
  if (!OBJECT_ID_REGEX.test(tourDateId) || !OBJECT_ID_REGEX.test(artistId)) {
    return null;
  }
  return { tourDateId, artistId };
};

/**
 * Tour date business rules over the tour date repository: the writes, their
 * audit events, and the headliner retry policy. A headliner's junction id
 * can go stale while the admin form is open (the dates were re-saved, which
 * rewrites the junction rows), so a set-time update or removal that misses
 * by id (NOT_FOUND) retries once by tour date + artist, when the caller sent
 * both.
 */
export class TourDateService {
  /** Every date of a tour, with every headliner whatever the artists' state (admin read). */
  static async findByTourId(
    tourId: string
  ): Promise<ServiceResponse<TourDateWithTourAndRelations[]>> {
    try {
      return { success: true, data: await TourDateRepository.findByTourId(tourId) };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to fetch tour dates' });
    }
  }

  /** Create a tour date with its headliners; resolves with its id. */
  static async create(
    input: TourDateCreateInput,
    userId: string
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      const tourDate = await TourDateRepository.create(input);

      logSecurityEvent({
        event: 'tourDate.created',
        userId,
        metadata: {
          tourDateId: tourDate.id,
          tourId: input.tourId,
          venueId: input.venueId,
          headlinerCount: input.headlinerIds.length,
        },
      });

      return { success: true, data: { id: tourDate.id } };
    } catch (error) {
      logger.error('[TourDateService.create]', error);
      return failed('Failed to create tour date');
    }
  }

  /** Update a tour date's fields. */
  static async update(
    id: string,
    input: TourDateUpdateInput,
    userId: string
  ): Promise<ServiceResponse<void>> {
    try {
      await TourDateRepository.update(id, input);

      logSecurityEvent({
        event: 'tourDate.updated',
        userId,
        metadata: { tourDateId: id, updatedFields: Object.keys(input) },
      });

      return SUCCEEDED;
    } catch (error) {
      logger.error('[TourDateService.update]', error);
      return failed('Failed to update tour date');
    }
  }

  /** Delete a tour date. */
  static async delete(id: string, userId: string): Promise<ServiceResponse<void>> {
    try {
      await TourDateRepository.delete(id);

      logSecurityEvent({ event: 'tourDate.deleted', userId, metadata: { tourDateId: id } });

      return SUCCEEDED;
    } catch (error) {
      logger.error('[TourDateService.delete]', error);
      return failed('Failed to delete tour date');
    }
  }

  /**
   * Set (or, with null, clear) a headliner's set time. A NOT_FOUND by id
   * retries by tour date + artist; see the class note.
   */
  static async updateHeadlinerSetTime(
    ref: HeadlinerRef & { setTime: string | null },
    userId: string
  ): Promise<ServiceResponse<void>> {
    const { headlinerId, setTime } = ref;
    const setTimeDate = setTime ? new Date(setTime) : null;

    try {
      await TourDateRepository.updateHeadlinerSetTime(headlinerId, setTimeDate);

      logSecurityEvent({
        event: 'tourDateHeadliner.setTimeUpdated',
        userId,
        metadata: { headlinerId, setTime },
      });

      return SUCCEEDED;
    } catch (error) {
      const ids = retryIds(error, ref);
      if (ids && (await this.retrySetTime({ ...ids, headlinerId, setTime, setTimeDate }, userId))) {
        return SUCCEEDED;
      }

      logger.error('[TourDateService.updateHeadlinerSetTime]', error);
      return failed('Failed to update set time');
    }
  }

  /**
   * Remove a headliner from a tour date — the junction row only, never the
   * artist. A NOT_FOUND by id retries by tour date + artist; see the class
   * note.
   */
  static async removeHeadliner(ref: HeadlinerRef, userId: string): Promise<ServiceResponse<void>> {
    const { headlinerId } = ref;

    try {
      await TourDateRepository.removeHeadliner(headlinerId);

      logSecurityEvent({ event: 'tourDateHeadliner.removed', userId, metadata: { headlinerId } });

      return SUCCEEDED;
    } catch (error) {
      const ids = retryIds(error, ref);
      if (ids && (await this.retryRemove(ids, headlinerId, userId))) {
        return SUCCEEDED;
      }

      logger.error('[TourDateService.removeHeadliner]', error);
      return failed('Failed to remove headliner');
    }
  }

  /** Store a new headliner order for a tour date. */
  static async reorderHeadliners(
    tourDateId: string,
    headlinerIds: string[],
    userId: string
  ): Promise<ServiceResponse<void>> {
    try {
      await TourDateRepository.reorderHeadliners(tourDateId, headlinerIds);

      logSecurityEvent({
        event: 'tourDateHeadliner.reordered',
        userId,
        metadata: { tourDateId, headlinerIds },
      });

      return SUCCEEDED;
    } catch (error) {
      logger.error('[TourDateService.reorderHeadliners]', error);
      return failed('Failed to reorder headliners');
    }
  }

  /** The set-time retry: true when a row matched, false on no match or a thrown retry. */
  private static async retrySetTime(
    {
      tourDateId,
      artistId,
      headlinerId,
      setTime,
      setTimeDate,
    }: {
      tourDateId: string;
      artistId: string;
      headlinerId: string;
      setTime: string | null;
      setTimeDate: Date | null;
    },
    userId: string
  ): Promise<boolean> {
    try {
      const updated = await TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist(
        tourDateId,
        artistId,
        setTimeDate
      );
      if (updated) {
        logSecurityEvent({
          event: 'tourDateHeadliner.setTimeUpdated',
          userId,
          metadata: { headlinerId, artistId, setTime, fallback: true },
        });
      }
      return updated;
    } catch (retryError) {
      logger.error('[TourDateService.updateHeadlinerSetTime:fallback]', retryError);
      return false;
    }
  }

  /** The removal retry: true when a row matched, false on no match or a thrown retry. */
  private static async retryRemove(
    { tourDateId, artistId }: { tourDateId: string; artistId: string },
    headlinerId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const removed = await TourDateRepository.removeHeadlinerByTourDateAndArtist(
        tourDateId,
        artistId
      );
      if (removed) {
        logSecurityEvent({
          event: 'tourDateHeadliner.removed',
          userId,
          metadata: { headlinerId, artistId, fallback: true },
        });
      }
      return removed;
    } catch (retryError) {
      logger.error('[TourDateService.removeHeadliner:fallback]', retryError);
      return false;
    }
  }
}
