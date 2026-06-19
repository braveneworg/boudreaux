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
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate the banner caches so the home-page banner carousel/strip reflects
 * the change immediately.
 */
const invalidateBannerQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });

/**
 * Mutation hook wrapping {@link createOrUpdateBannerNotificationAction}.
 * `mutateAsync` returns the action's {@link FormState} unchanged; the banner
 * caches are invalidated on a successful result.
 */
export const useUpsertBannerNotificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) =>
      createOrUpdateBannerNotificationAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link deleteBannerNotificationAction}.
 */
export const useDeleteBannerNotificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof deleteBannerNotificationAction>>,
    Error,
    { slotNumber: number }
  >({
    mutationFn: ({ slotNumber }) => deleteBannerNotificationAction(slotNumber),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateRotationIntervalAction}.
 */
export const useUpdateRotationIntervalMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateRotationIntervalAction>>,
    Error,
    { interval: number }
  >({
    mutationFn: ({ interval }) => updateRotationIntervalAction(interval),
    onSuccess: (result) => (result.success ? invalidateBannerQueries(queryClient) : undefined),
  });
};
