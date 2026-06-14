/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import type { QueryOptionsOverride } from './query-options';

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

const collectionResponseSchema = z.object({
  purchases: z.array(
    z.object({
      id: z.string(),
      amountPaid: z.number(),
      currency: z.string(),
      purchasedAt: z.string(),
      release: z.object({
        id: z.string(),
        title: z.string(),
        coverArt: z.string(),
        images: z.array(
          z.object({
            id: z.string(),
            src: z.string().nullable(),
            altText: z.string().nullable(),
            sortOrder: z.number(),
          })
        ),
        artistReleases: z.array(
          z.object({
            artist: z.object({
              id: z.string(),
              firstName: z.string(),
              surname: z.string(),
              displayName: z.string().nullable(),
            }),
          })
        ),
        digitalFormats: z.array(
          z.object({
            formatType: z.string(),
            files: z.array(z.object({ fileName: z.string() })),
          })
        ),
        releaseDownloads: z.array(
          z.object({
            downloadCount: z.number(),
            lastDownloadedAt: z.string().nullable(),
          })
        ),
      }),
    })
  ),
  count: z.number(),
  isAdmin: z.boolean(),
}) satisfies z.ZodType<CollectionResponse>;

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
  if (response.status === 401) {
    throw Error('Unauthorized');
  }
  if (!response.ok) {
    throw Error('Failed to fetch collection');
  }
  return collectionResponseSchema.parse(await response.json());
};

/**
 * React Query hook for fetching the viewer's purchased collection.
 *
 * Wraps {@link fetchCollection} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`).
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useCollectionQuery = (options: QueryOptionsOverride<CollectionResponse> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.collection.list(),
    queryFn: fetchCollection,
    ...options,
  });

  return { isPending, error, data, refetch };
};
