/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Strict schema for the `/api/releases/{releaseId}/purchase-status` response. */
const purchaseStatusResponseSchema = z.object({ confirmed: z.boolean() });

/** The parsed `{ confirmed }` response returned by the purchase-status route. */
export type PurchaseStatusResponse = z.infer<typeof purchaseStatusResponseSchema>;

/**
 * Fetches a release's purchase-confirmation status for a Stripe checkout
 * session from the `/api/releases/{releaseId}/purchase-status` route handler.
 *
 * Forwards the TanStack Query {@link AbortSignal} to `fetch` so the request is
 * cancelled automatically on unmount, invalidation, or a superseding refetch.
 *
 * @param releaseId - The release identifier whose purchase status is fetched.
 * @param sessionId - The Stripe checkout session id to check.
 * @param signal - The TanStack Query abort signal forwarded to `fetch`.
 * @returns The parsed `{ confirmed }` response.
 * @throws If the response status is not OK.
 */
const fetchPurchaseStatus = async (
  releaseId: string,
  sessionId: string | null,
  signal?: AbortSignal
): Promise<PurchaseStatusResponse> => {
  return fetchAndParse(
    `/api/releases/${encodeURIComponent(releaseId)}/purchase-status?sessionId=${encodeURIComponent(sessionId ?? '')}`,
    purchaseStatusResponseSchema,
    { signal, errorMessage: 'Failed to fetch purchase status' }
  );
};

/**
 * React Query hook for polling a release's purchase-confirmation status.
 *
 * Wraps {@link fetchPurchaseStatus} with a stable query key and exposes the
 * request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`. Callers typically pass `refetchInterval` and `retry` through
 * `options` to poll until the webhook confirms the purchase; the spread keeps a
 * caller-supplied `enabled` while always composing it with the session gate, so
 * the query stays disabled until a session id is present.
 *
 * @param releaseId - The release identifier whose purchase status is fetched.
 * @param sessionId - The Stripe checkout session id, or `null` to keep the
 * query disabled.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `refetchInterval`, `retry`, `enabled`); the session-present gate is always
 * applied on top.
 * @returns The query state: `isPending`, `error` (defaulted when unknown),
 * `data`, and `refetch`.
 */
export const usePurchaseStatusQuery = (
  releaseId: string,
  sessionId: string | null,
  options: QueryOptionsOverride<PurchaseStatusResponse> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.purchaseStatus.bySession(releaseId, sessionId ?? ''),
    queryFn: ({ signal }) => fetchPurchaseStatus(releaseId, sessionId, signal),
    ...options,
    enabled: (options.enabled ?? true) && sessionId !== null,
  });

  return { isPending, error, data, refetch };
};
