/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import type { HealthStatus } from '@/lib/types/health-status';
import { getApiBaseUrl } from '@/lib/utils/api-base-url';
import { parseResponse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const healthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'error']),
  database: z.string(),
  latency: z.number().optional(),
  error: z.string().optional(),
}) satisfies z.ZodType<HealthStatus>;

/**
 * Fetches the application health status from the `/api/health` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` (combined with a
 * 5s timeout signal) so the request is cancelled automatically on unmount,
 * invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the health status.
 * @throws If the response status is not OK.
 */
const fetchHealthStatus = async ({ signal }: QueryFunctionContext): Promise<HealthStatus> => {
  const baseUrl = getApiBaseUrl();
  const apiUrl = `${baseUrl}/api/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const response = await fetch(apiUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: Partial<HealthStatus>;
      try {
        errorData = (await response.json()) as Partial<HealthStatus>;
      } catch {
        errorData = { database: 'Failed to parse response', status: 'error' };
      }
      throw Error(errorData.database ?? 'Failed to fetch health status');
    }

    return parseResponse(apiUrl, healthStatusSchema, await response.json());
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

/**
 * React Query hook for fetching the application health status.
 *
 * Wraps {@link fetchHealthStatus} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `retry`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useHealthStatusQuery = (options: QueryOptionsOverride<HealthStatus> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.health.status(),
    queryFn: fetchHealthStatus,
    retry: 10,
    retryDelay: (attemptIndex) => (attemptIndex < 3 ? 500 : Math.pow(2, attemptIndex - 3) * 1000),
    gcTime: 0,
    staleTime: 0,
    ...options,
  });

  return { isPending, error, data, refetch };
};
