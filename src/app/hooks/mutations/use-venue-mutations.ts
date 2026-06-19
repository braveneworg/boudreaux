/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createVenueAction, updateVenueAction } from '@/lib/actions/venue-actions';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

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
 * Mutation hook wrapping {@link createVenueAction}. `mutateAsync` returns the
 * action's {@link FormState} unchanged; venue and tour caches are invalidated on
 * a successful result.
 */
export const useCreateVenueMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createVenueAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateVenueQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateVenueAction}. See
 * {@link useCreateVenueMutation} for the result/invalidation contract.
 */
export const useUpdateVenueMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    FormState,
    Error,
    { venueId: string; formState: FormState; formData: FormData }
  >({
    mutationFn: ({ venueId, formState, formData }) =>
      updateVenueAction(venueId, formState, formData),
    onSuccess: (result) => (result.success ? invalidateVenueQueries(queryClient) : undefined),
  });
};
