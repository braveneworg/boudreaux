/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { TourService } from '../services/tours/tour-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { OBJECT_ID_REGEX } from '../utils/validation/object-id';
import { tourCreateSchema, tourUpdateSchema } from '../validations/tours/tour-schema';

import type { FormState } from '../types/form-state';

/**
 * Server action to create a new tour
 */
export const createTourAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  const permittedFieldNames = ['title', 'subtitle', 'subtitle2', 'description', 'notes'];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourCreateSchema);

  if (!parsed.success) {
    return formState;
  }

  try {
    // Create tour
    const tour = await TourService.create({
      ...parsed.data,
      createdBy: session.user.id,
    });

    // Log security event
    logSecurityEvent({
      event: 'tour.created',
      userId: session.user.id,
      metadata: {
        tourId: tour.id,
        title: tour.title,
      },
    });

    formState.success = true;
    formState.errors = undefined;
    formState.data = { tourId: tour.id };

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
 * Server action to update an existing tour
 */
export const updateTourAction = async (
  tourId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  const permittedFieldNames = ['title', 'subtitle', 'subtitle2', 'description', 'notes'];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, tourUpdateSchema);

  if (!parsed.success) {
    return formState;
  }

  try {
    // Update tour
    const _tour = await TourService.update(
      tourId,
      {
        ...parsed.data,
      },
      session.user.id
    );

    // Log security event
    logSecurityEvent({
      event: 'tour.updated',
      userId: session.user.id,
      metadata: {
        tourId,
        updatedFields: Object.keys(parsed.data),
      },
    });

    formState.success = true;
    formState.errors = undefined;

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');
    revalidatePath(`/tours/${tourId}`);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to delete a tour
 */
export const deleteTourAction = async (
  tourId: string
): Promise<{ success: boolean; error?: string }> => {
  let session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  if (!OBJECT_ID_REGEX.test(tourId)) {
    return { success: false, error: 'Invalid tour ID' };
  }

  try {
    await TourService.delete(tourId);

    // Log security event
    logSecurityEvent({
      event: 'tour.deleted',
      userId: session.user.id,
      metadata: { tourId },
    });

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete tour' };
  }
};
