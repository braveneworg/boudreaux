/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createTourDateAction,
  deleteTourDateAction,
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
  updateTourDateAction,
} from '@/lib/actions/tour-date-actions';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate the tour caches. Tour dates and headliners render inside the tour
 * detail/listing queries, so any tour-date mutation refreshes the same keys.
 */
const invalidateTourQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });

/**
 * Mutation hook wrapping {@link createTourDateAction}. `mutateAsync` returns the
 * action's {@link FormState} unchanged; the tour caches are invalidated on a
 * successful result.
 */
export const useCreateTourDateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createTourDateAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateTourDateAction}.
 */
export const useUpdateTourDateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    FormState,
    Error,
    { tourDateId: string; formState: FormState; formData: FormData }
  >({
    mutationFn: ({ tourDateId, formState, formData }) =>
      updateTourDateAction(tourDateId, formState, formData),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link deleteTourDateAction}.
 */
export const useDeleteTourDateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof deleteTourDateAction>>,
    Error,
    { tourDateId: string }
  >({
    mutationFn: ({ tourDateId }) => deleteTourDateAction(tourDateId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateHeadlinerSetTimeAction}.
 */
export const useUpdateHeadlinerSetTimeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateHeadlinerSetTimeAction>>,
    Error,
    { headlinerId: string; setTime: string | null; tourDateId?: string; artistId?: string }
  >({
    mutationFn: ({ headlinerId, setTime, tourDateId, artistId }) =>
      updateHeadlinerSetTimeAction(headlinerId, setTime, tourDateId, artistId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link removeHeadlinerAction}.
 */
export const useRemoveHeadlinerMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof removeHeadlinerAction>>,
    Error,
    { headlinerId: string; tourDateId?: string; artistId?: string }
  >({
    mutationFn: ({ headlinerId, tourDateId, artistId }) =>
      removeHeadlinerAction(headlinerId, tourDateId, artistId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link reorderHeadlinersAction}.
 */
export const useReorderHeadlinersMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof reorderHeadlinersAction>>,
    Error,
    { tourDateId: string; headlinerIds: string[] }
  >({
    mutationFn: ({ tourDateId, headlinerIds }) => reorderHeadlinersAction(tourDateId, headlinerIds),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};
