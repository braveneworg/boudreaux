/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { TourDateRepository } from '../repositories/tours/tour-date-repository';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { OBJECT_ID_REGEX } from '../utils/validation/object-id';
import { tourDateCreateSchema, tourDateUpdateSchema } from '../validations/tours/tour-date-schema';

import type { FormState } from '../types/form-state';

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
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateCreateSchema);

  if (!parsed.success) {
    // Populate field-level errors so the client can display them
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (!formState.errors![field]) {
        formState.errors![field] = [];
      }
      (formState.errors![field] as string[]).push(issue.message);
    }
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
    revalidatePath('/admin/tours');
    revalidatePath('/tours');
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
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateUpdateSchema);

  if (!parsed.success) {
    // Populate field-level errors so the client can display them
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (!formState.errors![field]) {
        formState.errors![field] = [];
      }
      (formState.errors![field] as string[]).push(issue.message);
    }
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
    revalidatePath('/admin/tours');
    revalidatePath('/tours');
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to delete a tour date
 */
export const deleteTourDateAction = async (
  tourDateId: string
): Promise<{ success: boolean; error?: string }> => {
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
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

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
): Promise<{ success: boolean; error?: string }> => {
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

    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    const isRecordNotFound =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2025';

    if (
      isRecordNotFound &&
      tourDateId &&
      artistId &&
      OBJECT_ID_REGEX.test(tourDateId) &&
      OBJECT_ID_REGEX.test(artistId)
    ) {
      try {
        const fallbackUpdated = await TourDateRepository.updateHeadlinerSetTimeByTourDateAndArtist(
          tourDateId,
          artistId,
          parsedSetTime
        );

        if (fallbackUpdated) {
          logSecurityEvent({
            event: 'tourDateHeadliner.setTimeUpdated',
            userId: session.user.id,
            metadata: { headlinerId, artistId, setTime, fallback: true },
          });

          revalidatePath('/admin/tours');
          revalidatePath('/tours');

          return { success: true };
        }
      } catch (fallbackError) {
        console.error('[updateHeadlinerSetTimeAction:fallback]', fallbackError);
      }
    }

    console.error('[updateHeadlinerSetTimeAction]', error);
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
): Promise<{ success: boolean; error?: string }> => {
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

    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    const isRecordNotFound =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2025';

    if (
      isRecordNotFound &&
      tourDateId &&
      artistId &&
      OBJECT_ID_REGEX.test(tourDateId) &&
      OBJECT_ID_REGEX.test(artistId)
    ) {
      try {
        const fallbackRemoved = await TourDateRepository.removeHeadlinerByTourDateAndArtist(
          tourDateId,
          artistId
        );

        if (fallbackRemoved) {
          logSecurityEvent({
            event: 'tourDateHeadliner.removed',
            userId: session.user.id,
            metadata: { headlinerId, artistId, fallback: true },
          });

          revalidatePath('/admin/tours');
          revalidatePath('/tours');

          return { success: true };
        }
      } catch (fallbackError) {
        console.error('[removeHeadlinerAction:fallback]', fallbackError);
      }
    }

    console.error('[removeHeadlinerAction]', error);
    return { success: false, error: 'Failed to remove headliner' };
  }
};

/**
 * Server action to reorder headliners on a tour date
 */
export const reorderHeadlinersAction = async (
  tourDateId: string,
  headlinerIds: string[]
): Promise<{ success: boolean; error?: string }> => {
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

    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('[reorderHeadlinersAction]', error);
    return { success: false, error: 'Failed to reorder headliners' };
  }
};
