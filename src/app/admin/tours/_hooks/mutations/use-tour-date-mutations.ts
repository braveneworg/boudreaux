/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import {
  createTourDateAction,
  deleteTourDateAction,
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
  updateTourDateAction,
} from '@/lib/actions/tour-date-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type {
  TourDateCreateInput,
  TourDateUpdateInput,
} from '@/lib/validation/tours/tour-date-schema';

/**
 * Invalidate the tour caches. Tour dates and headliners render inside the tour
 * detail/listing queries, so any tour-date mutation refreshes the same keys.
 */
const invalidateTourQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });

/**
 * Mutation hook wrapping {@link createTourDateAction}. Accepts the validated tour
 * date values and serializes them to `FormData` internally; the tour caches are
 * invalidated on a successful result.
 */
export const useCreateTourDateMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createTourDate,
    mutateAsync: createTourDateAsync,
    isPending: isCreatingTourDate,
    isError: isCreateTourDateError,
    error: createTourDateError,
    data: createdTourDate,
    reset: resetCreateTourDate,
  } = useMutation<FormState, Error, TourDateCreateInput>({
    mutationFn: (values) => createTourDateAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    createTourDate,
    createTourDateAsync,
    isCreatingTourDate,
    isCreateTourDateError,
    createTourDateError,
    createdTourDate,
    resetCreateTourDate,
  };
};

/**
 * Mutation hook wrapping {@link updateTourDateAction}. Empty fields are omitted —
 * the tour-date form normalizes blanks out before submitting.
 */
export const useUpdateTourDateMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateTourDate,
    mutateAsync: updateTourDateAsync,
    isPending: isUpdatingTourDate,
    isError: isUpdateTourDateError,
    error: updateTourDateError,
    data: updatedTourDate,
    reset: resetUpdateTourDate,
  } = useMutation<FormState, Error, { id: string; values: TourDateUpdateInput }>({
    mutationFn: ({ id, values }) =>
      updateTourDateAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    updateTourDate,
    updateTourDateAsync,
    isUpdatingTourDate,
    isUpdateTourDateError,
    updateTourDateError,
    updatedTourDate,
    resetUpdateTourDate,
  };
};

/**
 * Mutation hook wrapping {@link deleteTourDateAction}.
 */
export const useDeleteTourDateMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteTourDate,
    mutateAsync: deleteTourDateAsync,
    isPending: isDeletingTourDate,
    isError: isDeleteTourDateError,
    error: deleteTourDateError,
    reset: resetDeleteTourDate,
  } = useMutation<AdminActionResult, Error, { tourDateId: string }>({
    mutationFn: ({ tourDateId }) => deleteTourDateAction(tourDateId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    deleteTourDate,
    deleteTourDateAsync,
    isDeletingTourDate,
    isDeleteTourDateError,
    deleteTourDateError,
    resetDeleteTourDate,
  };
};

/**
 * Mutation hook wrapping {@link updateHeadlinerSetTimeAction}.
 */
export const useUpdateHeadlinerSetTimeMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateHeadlinerSetTime,
    mutateAsync: updateHeadlinerSetTimeAsync,
    isPending: isUpdatingHeadlinerSetTime,
    isError: isUpdateHeadlinerSetTimeError,
    error: updateHeadlinerSetTimeError,
    reset: resetUpdateHeadlinerSetTime,
  } = useMutation<
    AdminActionResult,
    Error,
    { headlinerId: string; setTime: string | null; tourDateId?: string; artistId?: string }
  >({
    mutationFn: ({ headlinerId, setTime, tourDateId, artistId }) =>
      updateHeadlinerSetTimeAction(headlinerId, setTime, tourDateId, artistId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    updateHeadlinerSetTime,
    updateHeadlinerSetTimeAsync,
    isUpdatingHeadlinerSetTime,
    isUpdateHeadlinerSetTimeError,
    updateHeadlinerSetTimeError,
    resetUpdateHeadlinerSetTime,
  };
};

/**
 * Mutation hook wrapping {@link removeHeadlinerAction}.
 */
export const useRemoveHeadlinerMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: removeHeadliner,
    mutateAsync: removeHeadlinerAsync,
    isPending: isRemovingHeadliner,
    isError: isRemoveHeadlinerError,
    error: removeHeadlinerError,
    reset: resetRemoveHeadliner,
  } = useMutation<
    AdminActionResult,
    Error,
    { headlinerId: string; tourDateId?: string; artistId?: string }
  >({
    mutationFn: ({ headlinerId, tourDateId, artistId }) =>
      removeHeadlinerAction(headlinerId, tourDateId, artistId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    removeHeadliner,
    removeHeadlinerAsync,
    isRemovingHeadliner,
    isRemoveHeadlinerError,
    removeHeadlinerError,
    resetRemoveHeadliner,
  };
};

/**
 * Mutation hook wrapping {@link reorderHeadlinersAction}.
 */
export const useReorderHeadlinersMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: reorderHeadliners,
    mutateAsync: reorderHeadlinersAsync,
    isPending: isReorderingHeadliners,
    isError: isReorderHeadlinersError,
    error: reorderHeadlinersError,
    reset: resetReorderHeadliners,
  } = useMutation<AdminActionResult, Error, { tourDateId: string; headlinerIds: string[] }>({
    mutationFn: ({ tourDateId, headlinerIds }) => reorderHeadlinersAction(tourDateId, headlinerIds),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });

  return {
    reorderHeadliners,
    reorderHeadlinersAsync,
    isReorderingHeadliners,
    isReorderHeadlinersError,
    reorderHeadlinersError,
    resetReorderHeadliners,
  };
};
