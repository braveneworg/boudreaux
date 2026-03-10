/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';

import { VenueService } from '../services/tours/venue-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { venueCreateSchema } from '../validations/tours/venue-schema';

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
