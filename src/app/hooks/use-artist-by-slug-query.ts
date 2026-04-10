/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

const fetchArtistBySlug = async (slug: string) => {
  const response = await fetch(`/api/artists/slug/${encodeURIComponent(slug)}?withReleases=true`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch artist');
  }
  return response.json();
};

export const useArtistBySlugQuery = (slug: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.bySlug(slug),
    queryFn: () => fetchArtistBySlug(slug),
    enabled: !!slug,
  });

  return { isPending, error, data, refetch };
};
