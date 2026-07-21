/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEntityMutation } from '@/hooks/mutations/use-entity-mutation';
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

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    BannerNotificationFormData
  >(
    (values) => createOrUpdateBannerNotificationAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateBannerQueries
  );

  return { upsertBanner: mutate, upsertBannerAsync: mutateAsync, isUpsertingBanner: isPending };
};

/**
 * Mutation hook wrapping {@link deleteBannerNotificationAction}.
 */
export const useDeleteBannerNotificationMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { slotNumber: number }
  >(({ slotNumber }) => deleteBannerNotificationAction(slotNumber), invalidateBannerQueries);

  return { deleteBanner: mutate, deleteBannerAsync: mutateAsync, isDeletingBanner: isPending };
};

/**
 * Mutation hook wrapping {@link updateRotationIntervalAction}.
 */
export const useUpdateRotationIntervalMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { interval: number }
  >(({ interval }) => updateRotationIntervalAction(interval), invalidateBannerQueries);

  return {
    updateRotationInterval: mutate,
    updateRotationIntervalAsync: mutateAsync,
    isUpdatingRotationInterval: isPending,
  };
};
