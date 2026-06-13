/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

interface CollectionResponse {
  purchases: Array<{
    id: string;
    amountPaid: number;
    currency: string;
    purchasedAt: string;
    release: {
      id: string;
      title: string;
      coverArt: string;
      images: Array<{
        id: string;
        src: string | null;
        altText: string | null;
        sortOrder: number;
      }>;
      artistReleases: Array<{
        artist: {
          id: string;
          firstName: string;
          surname: string;
          displayName: string | null;
        };
      }>;
      digitalFormats: Array<{
        formatType: string;
        files: Array<{ fileName: string }>;
      }>;
      releaseDownloads: Array<{
        downloadCount: number;
        lastDownloadedAt: string | null;
      }>;
    };
  }>;
  count: number;
  isAdmin: boolean;
}

/**
 * Fetches the viewer's purchased collection from the `/api/user/collection`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the collection.
 * @throws If the response status is 401 (unauthorized) or otherwise not OK.
 */
const fetchCollection = async ({ signal }: QueryFunctionContext): Promise<CollectionResponse> => {
  const response = await fetch('/api/user/collection', { signal });
  if (!response.ok) {
    if (response.status === 401) {
      throw Error('Unauthorized');
    }
    throw Error('Failed to fetch collection');
  }
  return response.json() as Promise<CollectionResponse>;
};

/**
 * React Query hook for fetching the viewer's purchased collection.
 *
 * Wraps {@link fetchCollection} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useCollectionQuery = () => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.collection.list(),
    queryFn: fetchCollection,
  });

  return { isPending, error, data, refetch };
};
