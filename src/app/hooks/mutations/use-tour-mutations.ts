/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createTourAction, deleteTourAction, updateTourAction } from '@/lib/actions/tour-actions';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate the tour caches (infinite listing, detail, and dates) so an edited
 * tour is reflected immediately across the admin and public tour surfaces.
 */
const invalidateTourQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.tours.all });

/**
 * Mutation hook wrapping {@link createTourAction}. `mutateAsync` returns the
 * action's {@link FormState} unchanged; the tour caches are invalidated on a
 * successful result.
 */
export const useCreateTourMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createTourAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateTourAction}. See
 * {@link useCreateTourMutation} for the result/invalidation contract.
 */
export const useUpdateTourMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    FormState,
    Error,
    { tourId: string; formState: FormState; formData: FormData }
  >({
    mutationFn: ({ tourId, formState, formData }) => updateTourAction(tourId, formState, formData),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link deleteTourAction}. Invalidates the tour caches
 * on success so the removed tour disappears from listings immediately.
 */
export const useDeleteTourMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof deleteTourAction>>, Error, { tourId: string }>({
    mutationFn: ({ tourId }) => deleteTourAction(tourId),
    onSuccess: (result) => (result.success ? invalidateTourQueries(queryClient) : undefined),
  });
};
