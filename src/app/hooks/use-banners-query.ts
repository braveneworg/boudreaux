/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { BannersApiResponse } from '@/lib/services/banner-notification-service';

const fetchBanners = async (): Promise<BannersApiResponse> => {
  const response = await fetch('/api/notification-banners');
  if (!response.ok) {
    throw Error('Failed to fetch banners');
  }
  return response.json() as Promise<BannersApiResponse>;
};

export const useBannersQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.banners.active(),
    queryFn: fetchBanners,
  });

  return { isPending, error, data, refetch };
};
