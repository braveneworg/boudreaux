/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface PublishedReleasesResponse {
  releases: Array<{
    id: string;
    title: string;
    releasedOn: string;
    catalogNumber: string | null;
    coverArtUrl: string | null;
    published: boolean;
    artists: Array<{
      id: string;
      name: string;
      slug: string;
      firstName: string | null;
      lastName: string | null;
    }>;
    bandcampUrl: string | null;
  }>;
  count: number;
}

/**
 * Fetches the published releases from the `/api/releases?listing=published` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the published releases and count.
 * @throws If the response status is not OK.
 */
const fetchPublishedReleases = async ({
  signal,
}: QueryFunctionContext): Promise<PublishedReleasesResponse> => {
  const response = await fetch('/api/releases?listing=published', { signal });
  if (!response.ok) {
    throw Error('Failed to fetch releases');
  }
  return response.json() as Promise<PublishedReleasesResponse>;
};

/**
 * React Query hook for fetching the published releases.
 *
 * Wraps {@link fetchPublishedReleases} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const usePublishedReleasesQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.published(),
    queryFn: fetchPublishedReleases,
  });

  return { isPending, error, data, refetch };
};
