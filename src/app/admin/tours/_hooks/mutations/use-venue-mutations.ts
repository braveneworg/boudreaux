/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createVenueAction, updateVenueAction } from '@/lib/actions/venue-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { VenueCreateInput, VenueUpdateInput } from '@/lib/validation/tours/venue-schema';

/**
 * Invalidate the venue caches plus the tour caches — tour dates embed venue
 * data, so an edited venue must refresh tour views too.
 */
const invalidateVenueQueries = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.venues.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tours.all }),
  ]);

/**
 * Mutation hook wrapping {@link createVenueAction}. Accepts the validated venue
 * values and serializes them to `FormData` internally; venue and tour caches are
 * invalidated on a successful result.
 */
export const useCreateVenueMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createVenue,
    mutateAsync: createVenueAsync,
    isPending: isCreatingVenue,
    isError: isCreateVenueError,
    error: createVenueError,
    data: createdVenue,
    reset: resetCreateVenue,
  } = useMutation<FormState, Error, VenueCreateInput>({
    mutationFn: (values) => createVenueAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateVenueQueries(queryClient) : undefined),
  });

  return {
    createVenue,
    createVenueAsync,
    isCreatingVenue,
    isCreateVenueError,
    createVenueError,
    createdVenue,
    resetCreateVenue,
  };
};

/**
 * Mutation hook wrapping {@link updateVenueAction}. Empty strings are preserved so
 * optional fields can be cleared. See {@link useCreateVenueMutation} for the
 * result/invalidation contract.
 */
export const useUpdateVenueMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateVenue,
    mutateAsync: updateVenueAsync,
    isPending: isUpdatingVenue,
    isError: isUpdateVenueError,
    error: updateVenueError,
    data: updatedVenue,
    reset: resetUpdateVenue,
  } = useMutation<FormState, Error, { id: string; values: VenueUpdateInput }>({
    mutationFn: ({ id, values }) =>
      updateVenueAction(id, EMPTY_FORM_STATE, objectToFormData(values, { keepEmptyStrings: true })),
    onSuccess: (result) => (result.success ? invalidateVenueQueries(queryClient) : undefined),
  });

  return {
    updateVenue,
    updateVenueAsync,
    isUpdatingVenue,
    isUpdateVenueError,
    updateVenueError,
    updatedVenue,
    resetUpdateVenue,
  };
};
