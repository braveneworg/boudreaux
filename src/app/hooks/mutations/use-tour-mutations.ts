/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { createTourAction, deleteTourAction, updateTourAction } from '@/lib/actions/tour-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { TourCreateInput, TourUpdateInput } from '@/lib/validation/tours/tour-schema';

/**
 * Invalidate the tour caches (infinite listing, detail, and dates) so an edited
 * tour is reflected immediately across the admin and public tour surfaces.
 */
const invalidateTourQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });

/**
 * Mutation hook wrapping {@link createTourAction}. Accepts the validated tour
 * values and serializes them to `FormData` internally; the returned `createTour`
 * /`createTourAsync` resolve to the action's {@link FormState} so callers can map
 * field errors, and the tour caches are invalidated on a successful result.
 */
export const useCreateTourMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createTour,
    mutateAsync: createTourAsync,
    isPending: isCreatingTour,
    isError: isCreateTourError,
    error: createTourError,
    data: createdTour,
    reset: resetCreateTour,
  } = useMutation<FormState, Error, TourCreateInput>({
    mutationFn: (values) => createTourAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    createTour,
    createTourAsync,
    isCreatingTour,
    isCreateTourError,
    createTourError,
    createdTour,
    resetCreateTour,
  };
};

/**
 * Mutation hook wrapping {@link updateTourAction}. Empty strings are preserved so
 * optional fields can be cleared. See {@link useCreateTourMutation} for the
 * result/invalidation contract.
 */
export const useUpdateTourMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateTour,
    mutateAsync: updateTourAsync,
    isPending: isUpdatingTour,
    isError: isUpdateTourError,
    error: updateTourError,
    data: updatedTour,
    reset: resetUpdateTour,
  } = useMutation<FormState, Error, { id: string; values: TourUpdateInput }>({
    mutationFn: ({ id, values }) =>
      updateTourAction(id, EMPTY_FORM_STATE, objectToFormData(values, { keepEmptyStrings: true })),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    updateTour,
    updateTourAsync,
    isUpdatingTour,
    isUpdateTourError,
    updateTourError,
    updatedTour,
    resetUpdateTour,
  };
};

/**
 * Mutation hook wrapping {@link deleteTourAction}. Invalidates the tour caches
 * on success so the removed tour disappears from listings immediately.
 */
export const useDeleteTourMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteTour,
    mutateAsync: deleteTourAsync,
    isPending: isDeletingTour,
    isError: isDeleteTourError,
    error: deleteTourError,
    reset: resetDeleteTour,
  } = useMutation<AdminActionResult, Error, { tourId: string }>({
    mutationFn: ({ tourId }) => deleteTourAction(tourId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    deleteTour,
    deleteTourAsync,
    isDeletingTour,
    isDeleteTourError,
    deleteTourError,
    resetDeleteTour,
  };
};
