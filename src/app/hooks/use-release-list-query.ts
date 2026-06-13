/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ReleaseListItem {
  id: string;
  title: string;
  releasedOn: string;
  artistReleases?: {
    artist: {
      id: string;
      firstName: string | null;
      surname: string;
      displayName: string | null;
    };
  }[];
}

interface ReleaseListParams {
  search?: string;
  artistIds?: string[];
  take?: number;
}

/**
 * Fetches a filtered list of releases from the `/api/releases` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The search, artist, and pagination filters for the request.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed JSON response's `releases` array.
 * @throws If the response status is not OK.
 */
const fetchReleaseList = async (
  params: ReleaseListParams,
  signal?: AbortSignal
): Promise<ReleaseListItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.take !== undefined) searchParams.set('take', String(params.take));
  if (params.artistIds) {
    for (const id of params.artistIds) {
      searchParams.append('artistIds', id);
    }
  }

  const queryString = searchParams.toString();
  const url = `/api/releases${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  const json = (await response.json()) as { releases: ReleaseListItem[] };
  return json.releases;
};

/**
 * React Query hook for fetching a filtered list of releases.
 *
 * Wraps {@link fetchReleaseList} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param params - The search, artist, and pagination filters for the request.
 * @param enabled - Whether the query should run.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useReleaseListQuery = (params: ReleaseListParams, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.filteredList(params),
    queryFn: ({ signal }) => fetchReleaseList(params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { isPending, error, data, refetch };
};
