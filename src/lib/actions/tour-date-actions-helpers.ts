/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { revalidatePath } from 'next/cache';

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { DataError } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';
import { logSecurityEvent } from '@/utils/audit-log';
import { OBJECT_ID_REGEX } from '@/utils/validation/object-id';

const logger = loggers.media;

/**
 * Revalidate the three public/admin tour surfaces touched by every tour-date
 * mutation. Extracted to avoid repeating the trio across actions.
 */
export const revalidateTourPaths = (): void => {
  revalidatePath('/admin/tours');
  revalidatePath('/tours');
  revalidatePath('/tours/[tourId]', 'page');
};

/**
 * True when `error` is the repository's "record not found" failure, i.e. the
 * headliner junction row could not be located by its id. Repositories only
 * ever surface `DataError`s (ADR-0001), so this branches on the code.
 */
export const isRecordNotFoundError = (error: unknown): boolean =>
  error instanceof DataError && error.code === 'NOT_FOUND';

/**
 * For a NOT_FOUND failure, resolve the validated `{ tourDateId, artistId }` to
 * retry the headliner operation by tour-date + artist, or `null` when a
 * fallback is not possible (not NOT_FOUND, missing ids, or non-ObjectId ids).
 * Returning the narrowed ids lets the caller pass them without re-checking
 * `undefined`.
 *
 * @param error - The error thrown by the primary (by-id) operation.
 * @param tourDateId - Candidate tour-date id from the caller, if provided.
 * @param artistId - Candidate artist id from the caller, if provided.
 */
export const getHeadlinerFallbackIds = (
  error: unknown,
  tourDateId: string | undefined,
  artistId: string | undefined
): { tourDateId: string; artistId: string } | null => {
  if (!isRecordNotFoundError(error) || !tourDateId || !artistId) {
    return null;
  }

  if (!OBJECT_ID_REGEX.test(tourDateId) || !OBJECT_ID_REGEX.test(artistId)) {
    return null;
  }

  return { tourDateId, artistId };
};

interface SetTimeFallbackParams {
  fallbackIds: { tourDateId: string; artistId: string };
  headlinerId: string;
  setTime: string | null;
  parsedSetTime: Date | null;
  userId: string;
}

/**
 * Retry the headliner set-time update by tour-date + artist after the by-id
 * update missed (NOT_FOUND). On a matched record it audit-logs (with
 * `fallback: true`) and revalidates, returning `true`; a non-match returns
 * `false`, and a thrown fallback is logged and also returns `false`. Mirrors
 * the prior inline fallback block exactly.
 */
export const attemptSetTimeFallback = async ({
  fallbackIds,
  headlinerId,
  setTime,
  parsedSetTime,
  userId,
}: SetTimeFallbackParams): Promise<boolean> => {
  try {
    const fallbackUpdated = await TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist(
      fallbackIds.tourDateId,
      fallbackIds.artistId,
      parsedSetTime
    );

    if (fallbackUpdated) {
      logSecurityEvent({
        event: 'tourDateHeadliner.setTimeUpdated',
        userId,
        metadata: { headlinerId, artistId: fallbackIds.artistId, setTime, fallback: true },
      });

      revalidateTourPaths();
      return true;
    }
  } catch (fallbackError) {
    logger.error('[updateHeadlinerSetTimeAction:fallback]', fallbackError);
  }

  return false;
};

interface RemoveFallbackParams {
  fallbackIds: { tourDateId: string; artistId: string };
  headlinerId: string;
  userId: string;
}

/**
 * Retry the headliner removal by tour-date + artist after the by-id removal
 * missed (NOT_FOUND). On a matched record it audit-logs (with `fallback: true`) and
 * revalidates, returning `true`; a non-match returns `false`, and a thrown
 * fallback is logged and also returns `false`. Mirrors the prior inline
 * fallback block exactly.
 */
export const attemptRemoveFallback = async ({
  fallbackIds,
  headlinerId,
  userId,
}: RemoveFallbackParams): Promise<boolean> => {
  try {
    const fallbackRemoved = await TourDateRepository.removeHeadlinerByTourDateAndArtist(
      fallbackIds.tourDateId,
      fallbackIds.artistId
    );

    if (fallbackRemoved) {
      logSecurityEvent({
        event: 'tourDateHeadliner.removed',
        userId,
        metadata: { headlinerId, artistId: fallbackIds.artistId, fallback: true },
      });

      revalidateTourPaths();
      return true;
    }
  } catch (fallbackError) {
    logger.error('[removeHeadlinerAction:fallback]', fallbackError);
  }

  return false;
};
