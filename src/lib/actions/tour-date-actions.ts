/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

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
    'venueId',
    'ticketPrices',
    'ticketsUrl',
    'notes',
    'headlinerIds',
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateCreateSchema);

  if (!parsed.success) {
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
    'venueId',
    'ticketPrices',
    'ticketsUrl',
    'notes',
    'headlinerIds',
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourDateUpdateSchema);

  if (!parsed.success) {
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
