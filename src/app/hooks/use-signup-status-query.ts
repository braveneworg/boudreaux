/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

interface SignupStatus {
  paused: boolean;
}

const signupStatusSchema = z.object({
  paused: z.boolean(),
}) satisfies z.ZodType<SignupStatus>;

/**
 * Fetches the current signup-paused flag from the `/api/auth/signup-status`
 * route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param context - The TanStack Query function context, providing the `signal`.
 * @returns The parsed JSON response containing the signup status.
 * @throws If the response status is not OK.
 */
const fetchSignupStatus = async ({ signal }: QueryFunctionContext): Promise<SignupStatus> =>
  fetchAndParse('/api/auth/signup-status', signupStatusSchema, {
    signal,
    cache: 'no-store',
    errorMessage: 'Failed to fetch signup status',
  });

/**
 * React Query hook for fetching whether new signups are currently paused.
 *
 * Wraps {@link fetchSignupStatus} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * Callers on the signup path pass `{ enabled: isSignupPath }` so the request
 * is skipped on all other pages, keeping `queryKey`/`queryFn` locked while
 * letting the call site opt in or out.
 *
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`, `staleTime`); they take precedence over the defaults below.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const useSignupStatusQuery = (options: QueryOptionsOverride<SignupStatus> = {}) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.signupStatus.status(),
    queryFn: fetchSignupStatus,
    ...options,
  });

  return { isPending, error, data, refetch };
};
