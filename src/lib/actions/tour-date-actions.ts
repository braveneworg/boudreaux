/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { gateAction } from '@/lib/auth/action-gate';
import type { ServiceResponse } from '@/lib/services/service.types';
import { TourDateService } from '@/lib/services/tours/tour-date-service';
import type { FormState } from '@/lib/types/form-state';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import {
  tourDateCreateSchema,
  tourDateUpdateSchema,
} from '@/lib/validation/tours/tour-date-schema';
import { setUnknownError } from '@/utils/auth/auth-utils';
import { OBJECT_ID_REGEX } from '@/utils/validation/object-id';

import { refusedFormState } from './form-state-helpers';
import { revalidateTourPaths } from './tour-date-actions-helpers';

import type { AdminActionResult } from './run-admin-entity-action';

/** Revalidate after a write that succeeded, and answer in the admin action shape. */
const settleWrite = (result: ServiceResponse<void>): AdminActionResult => {
  if (!result.success) {
    return result;
  }
  revalidateTourPaths();
  return { success: true };
};

/**
 * Server action to create a new tour date entry
 */
export const createTourDateAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

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

  const result = await TourDateService.create(parsed.data, session.user.id);
  if (result.success) {
    formState.success = true;
    formState.errors = undefined;
    formState.data = { tourDateId: result.data.id };
    revalidateTourPaths();
  } else {
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

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

  const result = await TourDateService.update(tourDateId, parsed.data, session.user.id);
  if (result.success) {
    formState.success = true;
    formState.errors = undefined;
    revalidateTourPaths();
  } else {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};

/**
 * Server action to delete a tour date
 */
export const deleteTourDateAction = async (tourDateId: string): Promise<AdminActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  if (!OBJECT_ID_REGEX.test(tourDateId)) {
    return { success: false, error: 'Invalid tour date ID', code: 'INVALID_INPUT' };
  }

  return settleWrite(await TourDateService.delete(tourDateId, session.user.id));
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  if (!OBJECT_ID_REGEX.test(headlinerId)) {
    return { success: false, error: 'Invalid headliner ID', code: 'INVALID_INPUT' };
  }

  const parsedSetTime = setTime ? new Date(setTime) : null;

  if (setTime && parsedSetTime && isNaN(parsedSetTime.getTime())) {
    return { success: false, error: 'Invalid set time format', code: 'INVALID_INPUT' };
  }

  return settleWrite(
    await TourDateService.updateHeadlinerSetTime(
      { headlinerId, setTime, tourDateId, artistId },
      session.user.id
    )
  );
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  if (!OBJECT_ID_REGEX.test(headlinerId)) {
    return { success: false, error: 'Invalid headliner ID', code: 'INVALID_INPUT' };
  }

  return settleWrite(
    await TourDateService.removeHeadliner({ headlinerId, tourDateId, artistId }, session.user.id)
  );
};

/**
 * Server action to reorder headliners on a tour date
 */
export const reorderHeadlinersAction = async (
  tourDateId: string,
  headlinerIds: string[]
): Promise<AdminActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  if (!OBJECT_ID_REGEX.test(tourDateId)) {
    return { success: false, error: 'Invalid tour date ID', code: 'INVALID_INPUT' };
  }

  for (const id of headlinerIds) {
    if (!OBJECT_ID_REGEX.test(id)) {
      return { success: false, error: 'Invalid headliner ID in list', code: 'INVALID_INPUT' };
    }
  }

  return settleWrite(
    await TourDateService.reorderHeadliners(tourDateId, headlinerIds, session.user.id)
  );
};
