/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEntityMutation } from '@/hooks/mutations/use-entity-mutation';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { createTourAction, deleteTourAction, updateTourAction } from '@/lib/actions/tour-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { TourCreateInput, TourUpdateInput } from '@/lib/validation/tours/tour-schema';

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<FormState, TourCreateInput>(
    (values) => createTourAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateTourQueries
  );

  return { createTour: mutate, createTourAsync: mutateAsync, isCreatingTour: isPending };
};

/**
 * Mutation hook wrapping {@link updateTourAction}. Empty strings are preserved so
 * optional fields can be cleared. See {@link useCreateTourMutation} for the
 * result/invalidation contract.
 */
export const useUpdateTourMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    { id: string; values: TourUpdateInput }
  >(
    ({ id, values }) =>
      updateTourAction(id, EMPTY_FORM_STATE, objectToFormData(values, { keepEmptyStrings: true })),
    invalidateTourQueries
  );

  return { updateTour: mutate, updateTourAsync: mutateAsync, isUpdatingTour: isPending };
};

/**
 * Mutation hook wrapping {@link deleteTourAction}. Invalidates the tour caches
 * on success so the removed tour disappears from listings immediately.
 */
export const useDeleteTourMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { tourId: string }
  >(({ tourId }) => deleteTourAction(tourId), invalidateTourQueries);

  return { deleteTour: mutate, deleteTourAsync: mutateAsync, isDeletingTour: isPending };
};
