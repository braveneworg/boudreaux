/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import type { FormState } from '@/lib/types/form-state';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  tourDateCreateSchema,
  tourDateUpdateSchema,
} from '@/lib/validation/tours/tour-date-schema';
import { logSecurityEvent } from '@/utils/audit-log';
import { setUnknownError } from '@/utils/auth/auth-utils';
import { OBJECT_ID_REGEX } from '@/utils/validation/object-id';

import {
  attemptRemoveFallback,
  attemptSetTimeFallback,
  getHeadlinerFallbackIds,
  revalidateTourPaths,
} from './tour-date-actions-helpers';

import type { AdminActionResult } from './run-admin-entity-action';

const logger = loggers.media;

/**
 * Server action to create a new tour date entry
 */
export const createTourDateAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  const permittedFieldNames = [
    'tourId',
    'startDate',
    'endDate',
    'showStartTime',
    'showEndTime',
    'doorsOpenAt',
    'venueId',
    'ticketPrices',
    'ticketsUrl',
    'ticketIconUrl',
    'notes',
    'headlinerIds',
    'timeZone',
    'utcOffset',
  ] as const;

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateCreateSchema);

  if (!parsed.success) {
    // Populate field-level errors so the client can display them
    const errors = new Map<string, string[]>(Object.entries(formState.errors ?? {}));
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      const messages = errors.get(field) ?? [];
      messages.push(issue.message);
      errors.set(field, messages);
    }
    formState.errors = Object.fromEntries(errors);
    return formState;
  }

  try {
    // Create tour date
    const tourDate = await TourDateRepository.create({
      ...parsed.data,
      headlinerIds: parsed.data.headlinerIds,
    });

    // Log security event
    logSecurityEvent({
      event: 'tourDate.created',
      userId: session.user.id,
      metadata: {
        tourDateId: tourDate.id,
        tourId: parsed.data.tourId,
        venueId: parsed.data.venueId,
        headlinerCount: parsed.data.headlinerIds.length,
      },
    });

    formState.success = true;
    formState.errors = undefined;
    formState.data = { tourDateId: tourDate.id };

    // Revalidate paths
    revalidateTourPaths();
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to update an existing tour date
 */
export const updateTourDateAction = async (
  tourDateId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  const permittedFieldNames = [
    'startDate',
    'endDate',
    'showStartTime',
    'showEndTime',
    'doorsOpenAt',
    'venueId',
    'ticketPrices',
    'ticketsUrl',
    'ticketIconUrl',
    'notes',
    'headlinerIds',
    'timeZone',
    'utcOffset',
  ] as const;

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateUpdateSchema);

  if (!parsed.success) {
    // Populate field-level errors so the client can display them
    const errors = new Map<string, string[]>(Object.entries(formState.errors ?? {}));
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      const messages = errors.get(field) ?? [];
      messages.push(issue.message);
      errors.set(field, messages);
    }
    formState.errors = Object.fromEntries(errors);
    return formState;
  }

  try {
    // Update tour date
    await TourDateRepository.update(tourDateId, {
      ...parsed.data,
    });

    // Log security event
    logSecurityEvent({
      event: 'tourDate.updated',
      userId: session.user.id,
      metadata: {
        tourDateId,
        updatedFields: Object.keys(parsed.data),
      },
    });

    formState.success = true;
    formState.errors = undefined;

    // Revalidate paths
    revalidateTourPaths();
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to delete a tour date
 */
export const deleteTourDateAction = async (tourDateId: string): Promise<AdminActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!OBJECT_ID_REGEX.test(tourDateId)) {
    return { success: false, error: 'Invalid tour date ID' };
  }

  try {
    await TourDateRepository.delete(tourDateId);

    // Log security event
    logSecurityEvent({
      event: 'tourDate.deleted',
      userId: session.user.id,
      metadata: { tourDateId },
    });

    // Revalidate paths
    revalidateTourPaths();

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete tour date' };
  }
};

/**
 * Server action to update the set time for a headliner on a tour date
 */
export const updateHeadlinerSetTimeAction = async (
  headlinerId: string,
  setTime: string | null,
  tourDateId?: string,
  artistId?: string
): Promise<AdminActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!OBJECT_ID_REGEX.test(headlinerId)) {
    return { success: false, error: 'Invalid headliner ID' };
  }

  const parsedSetTime = setTime ? new Date(setTime) : null;

  if (setTime && parsedSetTime && isNaN(parsedSetTime.getTime())) {
    return { success: false, error: 'Invalid set time format' };
  }

  try {
    await TourDateRepository.updateHeadlinerSetTime(headlinerId, parsedSetTime);

    logSecurityEvent({
      event: 'tourDateHeadliner.setTimeUpdated',
      userId: session.user.id,
      metadata: { headlinerId, setTime },
    });

    revalidateTourPaths();

    return { success: true };
  } catch (error) {
    const fallbackIds = getHeadlinerFallbackIds(error, tourDateId, artistId);

    if (
      fallbackIds &&
      (await attemptSetTimeFallback({
        fallbackIds,
        headlinerId,
        setTime,
        parsedSetTime,
        userId: session.user.id,
      }))
    ) {
      return { success: true };
    }

    logger.error('[updateHeadlinerSetTimeAction]', error);
    return { success: false, error: 'Failed to update set time' };
  }
};

/**
 * Server action to remove a headliner from a tour date.
 * Only removes the junction record — does NOT delete the artist.
 */
export const removeHeadlinerAction = async (
  headlinerId: string,
  tourDateId?: string,
  artistId?: string
): Promise<AdminActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!OBJECT_ID_REGEX.test(headlinerId)) {
    return { success: false, error: 'Invalid headliner ID' };
  }

  try {
    await TourDateRepository.removeHeadliner(headlinerId);

    logSecurityEvent({
      event: 'tourDateHeadliner.removed',
      userId: session.user.id,
      metadata: { headlinerId },
    });

    revalidateTourPaths();

    return { success: true };
  } catch (error) {
    const fallbackIds = getHeadlinerFallbackIds(error, tourDateId, artistId);

    if (
      fallbackIds &&
      (await attemptRemoveFallback({ fallbackIds, headlinerId, userId: session.user.id }))
    ) {
      return { success: true };
    }

    logger.error('[removeHeadlinerAction]', error);
    return { success: false, error: 'Failed to remove headliner' };
  }
};

/**
 * Server action to reorder headliners on a tour date
 */
export const reorderHeadlinersAction = async (
  tourDateId: string,
  headlinerIds: string[]
): Promise<AdminActionResult> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!OBJECT_ID_REGEX.test(tourDateId)) {
    return { success: false, error: 'Invalid tour date ID' };
  }

  for (const id of headlinerIds) {
    if (!OBJECT_ID_REGEX.test(id)) {
      return { success: false, error: 'Invalid headliner ID in list' };
    }
  }

  try {
    await TourDateRepository.reorderHeadliners(tourDateId, headlinerIds);

    logSecurityEvent({
      event: 'tourDateHeadliner.reordered',
      userId: session.user.id,
      metadata: { tourDateId, headlinerIds },
    });

    revalidateTourPaths();

    return { success: true };
  } catch (error) {
    logger.error('[reorderHeadlinersAction]', error);
    return { success: false, error: 'Failed to reorder headliners' };
  }
};
