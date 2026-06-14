/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { BannersApiResponse } from '@/lib/services/banner-notification-service';

import type { QueryOptionsOverride } from './query-options';

const disableCache = process.env.NEXT_PUBLIC_DISABLE_BANNERS_CACHE === 'true';

/**
 * Fetches the active notification banners from the `/api/notification-banners`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the banners.
 * @throws If the response status is not OK.
 */
const fetchBanners = async ({ signal }: QueryFunctionContext): Promise<BannersApiResponse> => {
  const response = await fetch('/api/notification-banners', { signal });
  if (!response.ok) {
    throw Error('Failed to fetch banners');
  }
  return response.json() as Promise<BannersApiResponse>;
};

/**
 * React Query hook for fetching the active notification banners.
 *
 * Wraps {@link fetchBanners} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useBannersQuery = (options: QueryOptionsOverride<BannersApiResponse> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.banners.active(),
    queryFn: fetchBanners,
    staleTime: disableCache ? 0 : 600_000, // 10 minutes
    ...options,
  });

  return { isPending, error, data, refetch };
};
