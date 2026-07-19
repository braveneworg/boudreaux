/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createOrUpdateBannerNotificationAction,
  deleteBannerNotificationAction,
  updateRotationIntervalAction,
} from '@/lib/actions/banner-notification-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { BannerNotificationFormData } from '@/lib/validation/banner-notification-schema';

/**
 * Invalidate the banner caches so the home-page banner carousel/strip reflects
 * the change immediately.
 */
const invalidateBannerQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });

/**
 * Mutation hook wrapping {@link createOrUpdateBannerNotificationAction}. Accepts
 * the validated banner values and serializes them to `FormData` internally; the
 * banner caches are invalidated on a successful result.
 */
export const useUpsertBannerNotificationMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: upsertBanner,
    mutateAsync: upsertBannerAsync,
    isPending: isUpsertingBanner,
    isError: isUpsertBannerError,
    error: upsertBannerError,
    data: savedBanner,
    reset: resetUpsertBanner,
  } = useMutation<FormState, Error, BannerNotificationFormData>({
    mutationFn: (values) =>
      createOrUpdateBannerNotificationAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });

  return {
    upsertBanner,
    upsertBannerAsync,
    isUpsertingBanner,
    isUpsertBannerError,
    upsertBannerError,
    savedBanner,
    resetUpsertBanner,
  };
};

/**
 * Mutation hook wrapping {@link deleteBannerNotificationAction}.
 */
export const useDeleteBannerNotificationMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteBanner,
    mutateAsync: deleteBannerAsync,
    isPending: isDeletingBanner,
    isError: isDeleteBannerError,
    error: deleteBannerError,
    reset: resetDeleteBanner,
  } = useMutation<AdminActionResult, Error, { slotNumber: number }>({
    mutationFn: ({ slotNumber }) => deleteBannerNotificationAction(slotNumber),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });

  return {
    deleteBanner,
    deleteBannerAsync,
    isDeletingBanner,
    isDeleteBannerError,
    deleteBannerError,
    resetDeleteBanner,
  };
};

/**
 * Mutation hook wrapping {@link updateRotationIntervalAction}.
 */
export const useUpdateRotationIntervalMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateRotationInterval,
    mutateAsync: updateRotationIntervalAsync,
    isPending: isUpdatingRotationInterval,
    isError: isUpdateRotationIntervalError,
    error: updateRotationIntervalError,
    reset: resetUpdateRotationInterval,
  } = useMutation<AdminActionResult, Error, { interval: number }>({
    mutationFn: ({ interval }) => updateRotationIntervalAction(interval),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });

  return {
    updateRotationInterval,
    updateRotationIntervalAsync,
    isUpdatingRotationInterval,
    isUpdateRotationIntervalError,
    updateRotationIntervalError,
    resetUpdateRotationInterval,
  };
};
