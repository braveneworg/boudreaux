/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface NotificationBannerSearchResult {
  id: string;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  slotNumber: number;
  createdAt: string;
}

interface NotificationBannerSearchResponse {
  notifications: NotificationBannerSearchResult[];
}

const notificationBannerSearchResponseSchema = z.object({
  notifications: z.array(
    z.object({
      id: z.string(),
      content: z.string().nullable(),
      textColor: z.string().nullable(),
      backgroundColor: z.string().nullable(),
      slotNumber: z.number(),
      createdAt: z.string(),
    })
  ),
}) satisfies z.ZodType<NotificationBannerSearchResponse>;

/**
 * Searches notification banners via the `/api/notification-banners/search` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param query - The search query string.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response containing the matching notification banners.
 * @throws If the response status is not OK.
 */
const fetchNotificationBannerSearch = async (
  query: string,
  signal?: AbortSignal
): Promise<NotificationBannerSearchResponse> => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('take', '20');

  return fetchAndParse(
    `/api/notification-banners/search?${params.toString()}`,
    notificationBannerSearchResponseSchema,
    { signal, errorMessage: 'Failed to search notification banners' }
  );
};

/**
 * React Query hook for searching notification banners.
 *
 * Wraps {@link fetchNotificationBannerSearch} with a stable query key and
 * exposes the request state. Cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param query - The search query string.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useNotificationBannerSearchQuery = (
  query: string,
  options: QueryOptionsOverride<NotificationBannerSearchResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.notifications.search(query),
    queryFn: ({ signal }) => fetchNotificationBannerSearch(query, signal),
    placeholderData: keepPreviousData,
    ...options,
  });

  return { isPending, error, data, refetch };
};
