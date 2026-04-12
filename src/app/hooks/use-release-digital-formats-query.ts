/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { queryKeys } from '@/lib/query-keys';

interface ReleaseDigitalFormatsResponse {
  formats: Array<{
    formatType: DigitalFormatType;
    fileName: string;
  }>;
}

const fetchReleaseDigitalFormats = async (
  releaseId: string
): Promise<ReleaseDigitalFormatsResponse> => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/digital-formats`);
  if (!response.ok) {
    throw Error('Failed to fetch digital formats');
  }
  return response.json() as Promise<ReleaseDigitalFormatsResponse>;
};

export const useReleaseDigitalFormatsQuery = (
  releaseId: string,
  options?: { enabled?: boolean }
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.digitalFormats(releaseId),
    queryFn: () => fetchReleaseDigitalFormats(releaseId),
    enabled: (options?.enabled ?? true) && !!releaseId,
  });

  return { isPending, error, data, refetch };
};
