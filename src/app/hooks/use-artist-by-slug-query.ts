/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

/**
 * Fetches a single artist by slug from the `/api/artists/slug/:slug` route
 * handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param slug - The artist slug to look up.
 * @param signal - The TanStack Query `AbortSignal` used to cancel the request.
 * @returns The parsed JSON response for the artist, or `null` if not found.
 * @throws If the response status is not OK and not a 404.
 */
const fetchArtistBySlug = async (slug: string, signal?: AbortSignal) => {
  const response = await fetch(`/api/artists/slug/${encodeURIComponent(slug)}?withReleases=true`, {
    signal,
  });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch artist');
  }
  return response.json();
};

/**
 * React Query hook for fetching a single artist by slug.
 *
 * Wraps {@link fetchArtistBySlug} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param slug - The artist slug to look up; the query is disabled when empty.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useArtistBySlugQuery = (slug: string) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.artists.bySlug(slug),
    queryFn: ({ signal }) => fetchArtistBySlug(slug, signal),
    enabled: !!slug,
  });

  return { isPending, error, data, refetch };
};
