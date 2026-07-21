/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEntityMutation } from '@/hooks/mutations/use-entity-mutation';
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

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<FormState, TourDateCreateInput>(
    (values) => createTourDateAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateTourQueries
  );

  return {
    createTourDate: mutate,
    createTourDateAsync: mutateAsync,
    isCreatingTourDate: isPending,
  };
};

/**
 * Mutation hook wrapping {@link updateTourDateAction}. Empty fields are omitted —
 * the tour-date form normalizes blanks out before submitting.
 */
export const useUpdateTourDateMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    { id: string; values: TourDateUpdateInput }
  >(
    ({ id, values }) => updateTourDateAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateTourQueries
  );

  return {
    updateTourDate: mutate,
    updateTourDateAsync: mutateAsync,
    isUpdatingTourDate: isPending,
  };
};

/**
 * Mutation hook wrapping {@link deleteTourDateAction}.
 */
export const useDeleteTourDateMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { tourDateId: string }
  >(({ tourDateId }) => deleteTourDateAction(tourDateId), invalidateTourQueries);

  return {
    deleteTourDate: mutate,
    deleteTourDateAsync: mutateAsync,
    isDeletingTourDate: isPending,
  };
};

/**
 * Mutation hook wrapping {@link updateHeadlinerSetTimeAction}.
 */
export const useUpdateHeadlinerSetTimeMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { headlinerId: string; setTime: string | null; tourDateId?: string; artistId?: string }
  >(
    ({ headlinerId, setTime, tourDateId, artistId }) =>
      updateHeadlinerSetTimeAction(headlinerId, setTime, tourDateId, artistId),
    invalidateTourQueries
  );

  return {
    updateHeadlinerSetTime: mutate,
    updateHeadlinerSetTimeAsync: mutateAsync,
    isUpdatingHeadlinerSetTime: isPending,
  };
};

/**
 * Mutation hook wrapping {@link removeHeadlinerAction}.
 */
export const useRemoveHeadlinerMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { headlinerId: string; tourDateId?: string; artistId?: string }
  >(
    ({ headlinerId, tourDateId, artistId }) =>
      removeHeadlinerAction(headlinerId, tourDateId, artistId),
    invalidateTourQueries
  );

  return {
    removeHeadliner: mutate,
    removeHeadlinerAsync: mutateAsync,
    isRemovingHeadliner: isPending,
  };
};

/**
 * Mutation hook wrapping {@link reorderHeadlinersAction}.
 */
export const useReorderHeadlinersMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { tourDateId: string; headlinerIds: string[] }
  >(
    ({ tourDateId, headlinerIds }) => reorderHeadlinersAction(tourDateId, headlinerIds),
    invalidateTourQueries
  );

  return {
    reorderHeadliners: mutate,
    reorderHeadlinersAsync: mutateAsync,
    isReorderingHeadliners: isPending,
  };
};
