/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { queryKeys } from '@/lib/query-keys';

interface ReleaseUserStatusResponse {
  hasPurchase: boolean;
  isSubscriber: boolean;
  purchasedAt: string | null;
  downloadCount: number;
  resetInHours: number | null;
  availableFormats: Array<{
    formatType: DigitalFormatType;
    fileName: string;
  }>;
}

const fetchReleaseUserStatus = async (
  releaseId: string
): Promise<ReleaseUserStatusResponse | null> => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/user-status`);
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw Error('Failed to fetch release user status');
  }
  return response.json() as Promise<ReleaseUserStatusResponse>;
};

export const useReleaseUserStatusQuery = (releaseId: string) => {
  const { status } = useSession();

  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.userStatus(releaseId),
    queryFn: () => fetchReleaseUserStatus(releaseId),
    enabled: !!releaseId && status === 'authenticated',
  });

  return { isPending, error, data, refetch };
};
