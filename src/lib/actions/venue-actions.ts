/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { VenueService } from '../services/tours/venue-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { OBJECT_ID_REGEX } from '../utils/validation/object-id';
import { venueCreateSchema, venueUpdateSchema } from '../validations/tours/venue-schema';

import type { FormState } from '../types/form-state';

/**
 * Server action to create a new venue
 */
export const createVenueAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  const permittedFieldNames = [
    'name',
    'address',
    'city',
    'state',
    'country',
    'postalCode',
    'capacity',
    'notes',
    'timeZone',
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, venueCreateSchema);

  if (!parsed.success) {
    return formState;
  }

  try {
    // Check for duplicate venue name in the same city
    const isDuplicate = await VenueService.checkDuplicateName(parsed.data.name, parsed.data.city);

    if (isDuplicate) {
      formState.success = false;
      formState.errors = {
        general: [`A venue with this name already exists in ${parsed.data.city}`],
      };
      return formState;
    }

    // Create venue
    const venue = await VenueService.create({
      ...parsed.data,
      createdBy: session.user.id,
    });

    // Log security event
    logSecurityEvent({
      event: 'venue.created',
      userId: session.user.id,
      metadata: {
        venueId: venue.id,
        name: venue.name,
        city: venue.city,
      },
    });

    formState.success = true;
    formState.errors = undefined;
    formState.data = { venueId: venue.id };

    // Revalidate paths
    revalidatePath('/admin/tours/new');
    revalidatePath('/admin/tours');
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to update an existing venue
 */
export const updateVenueAction = async (
  venueId: string,
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');
  if (!session?.user?.id) {
    throw new Error('Invalid admin session: missing user id for audit logging.');
  }

  if (!OBJECT_ID_REGEX.test(venueId)) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Invalid venue ID'] },
    };
  }

  const permittedFieldNames = [
    'name',
    'address',
    'city',
    'state',
    'country',
    'postalCode',
    'capacity',
    'notes',
    'timeZone',
  ];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, venueUpdateSchema);

  if (!parsed.success) {
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
    // Update venue
    const venue = await VenueService.update(venueId, parsed.data, session.user.id);

    // Log security event
    logSecurityEvent({
      event: 'venue.updated',
      userId: session.user.id,
      metadata: {
        venueId: venue.id,
        name: venue.name,
        updatedFields: Object.keys(parsed.data),
      },
    });

    formState.success = true;
    formState.errors = undefined;
    formState.data = {
      venueId: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
      timeZone: venue.timeZone,
    };

    // Revalidate paths
    revalidatePath('/admin/tours/new');
    revalidatePath('/admin/tours');
    revalidatePath('/tours');
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
