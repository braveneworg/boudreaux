/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface CDNStatus {
  status: 'invalidating' | 'ready' | 'unknown' | 'error';
  message: string;
  estimatedMinutesRemaining?: number;
  inProgress?: number;
  startedAt?: string;
  completedAt?: string;
}

const cdnStatusSchema = z.object({
  status: z.enum(['invalidating', 'ready', 'unknown', 'error']),
  message: z.string(),
  estimatedMinutesRemaining: z.number().optional(),
  inProgress: z.number().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
}) satisfies z.ZodType<CDNStatus>;

/**
 * Fetches the current CDN invalidation status from the `/api/cdn-status` route
 * handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the CDN status.
 * @throws If the response status is not OK.
 */
const fetchCdnStatus = async ({ signal }: QueryFunctionContext): Promise<CDNStatus> => {
  return fetchAndParse('/api/cdn-status', cdnStatusSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to fetch CDN status',
  });
};

/**
 * React Query hook for fetching the current CDN invalidation status.
 *
 * Wraps {@link fetchCdnStatus} with a stable query key and exposes the request
 * state. Cancellation is handled automatically via the forwarded `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useCdnStatusQuery = (options: QueryOptionsOverride<CDNStatus> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.cdn.status(),
    queryFn: fetchCdnStatus,
    refetchInterval: (query) => (query.state.data?.status === 'invalidating' ? 30_000 : false),
    ...options,
  });

  return { isPending, error, data, refetch };
};
