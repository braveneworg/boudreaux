/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

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

const fetchNotificationBannerSearch = async (
  query: string
): Promise<NotificationBannerSearchResponse> => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('take', '20');

  const response = await fetch(`/api/notification-banners/search?${params.toString()}`);
  if (!response.ok) {
    throw Error('Failed to search notification banners');
  }
  return response.json() as Promise<NotificationBannerSearchResponse>;
};

export const useNotificationBannerSearchQuery = (query: string, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.notifications.search(query),
    queryFn: () => fetchNotificationBannerSearch(query),
    enabled,
  });

  return { isPending, error, data, refetch };
};
