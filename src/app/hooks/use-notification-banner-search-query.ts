/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

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

  const response = await fetch(`/api/notification-banners/search?${params.toString()}`, { signal });
  if (!response.ok) {
    throw Error('Failed to search notification banners');
  }
  return response.json() as Promise<NotificationBannerSearchResponse>;
};

/**
 * React Query hook for searching notification banners.
 *
 * Wraps {@link fetchNotificationBannerSearch} with a stable query key and
 * exposes the request state. Cancellation is handled automatically via the
 * forwarded `AbortSignal`.
 *
 * @param query - The search query string.
 * @param enabled - Whether the query should run.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useNotificationBannerSearchQuery = (query: string, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.notifications.search(query),
    queryFn: ({ signal }) => fetchNotificationBannerSearch(query, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { isPending, error, data, refetch };
};
