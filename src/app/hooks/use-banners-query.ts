/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface BannersResponse {
  banners: Array<{
    id: string;
    message: string;
    linkUrl: string | null;
    linkText: string | null;
    type: string;
  }>;
  rotationInterval: number;
}

const disableCache = process.env.NEXT_PUBLIC_DISABLE_BANNERS_CACHE === 'true';

const fetchBanners = async (): Promise<BannersResponse> => {
  const response = await fetch('/api/notification-banners');
  if (!response.ok) {
    throw Error('Failed to fetch banners');
  }
  return response.json() as Promise<BannersResponse>;
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
    staleTime: disableCache ? 0 : 600_000, // 10 minutes
  });

  return { isPending, error, data, refetch };
};
