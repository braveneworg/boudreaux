/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ReleaseCarouselItem } from '@/lib/types/media-models';

interface ReleaseRelatedResponse {
  releases: ReleaseCarouselItem[];
}

const fetchReleaseRelated = async (releaseId: string): Promise<ReleaseRelatedResponse> => {
  const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/related`);
  if (!response.ok) {
    throw Error('Failed to fetch related releases');
  }
  return response.json() as Promise<ReleaseRelatedResponse>;
};

export const useReleaseRelatedQuery = (releaseId: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.related(releaseId),
    queryFn: () => fetchReleaseRelated(releaseId),
    enabled: !!releaseId,
  });

  return { isPending, error, data, refetch };
};
