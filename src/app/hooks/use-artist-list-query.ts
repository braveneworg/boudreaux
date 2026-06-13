/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface ArtistListItem {
  id: string;
  firstName: string | null;
  surname: string;
  displayName: string | null;
  slug: string;
}

interface ArtistListParams {
  search?: string;
  take?: number;
}

/**
 * Fetches a filtered list of artists from the `/api/artists` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param params - The search and pagination parameters for the list.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed array of artist list items.
 * @throws If the response status is not OK.
 */
const fetchArtistList = async (
  params: ArtistListParams,
  signal?: AbortSignal
): Promise<ArtistListItem[]> => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.take !== undefined) searchParams.set('take', String(params.take));

  const queryString = searchParams.toString();
  const url = `/api/artists${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw Error('Failed to fetch artists');
  }
  const json = (await response.json()) as { rows: ArtistListItem[] };
  return json.rows;
};

/**
 * React Query hook for fetching a filtered list of artists.
 *
 * Wraps {@link fetchArtistList} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param params - The search and pagination parameters for the list.
 * @param enabled - Whether the query should run; defaults to `true`.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useArtistListQuery = (params: ArtistListParams, enabled = true) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.filteredList(params),
    queryFn: ({ signal }) => fetchArtistList(params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { isPending, error, data, refetch };
};
