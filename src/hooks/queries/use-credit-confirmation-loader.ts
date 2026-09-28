/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { CreditConfirmation } from '@/lib/utils/credit-confirmation';
import { creditConfirmationSchema } from '@/lib/validation/credit-confirmation-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/**
 * Whose credits to load: a release's stored credits, or the artists a release
 * form is about to credit (not stored until the form is saved).
 */
export type CreditConfirmationSource = { releaseId: string } | { artistIds: string[] };

const urlOf = (source: CreditConfirmationSource): string =>
  'releaseId' in source
    ? `/api/releases/${encodeURIComponent(source.releaseId)}/credits`
    : `/api/artists/credits?${source.artistIds.map((id) => `id=${encodeURIComponent(id)}`).join('&')}`;

const keyOf = (source: CreditConfirmationSource): readonly unknown[] =>
  'releaseId' in source
    ? queryKeys.releases.credits(source.releaseId)
    : queryKeys.artists.credits(source.artistIds);

/**
 * Returns a loader for a release's credit confirmation (ADR-0015): the credits
 * awaiting an admin's decision and those that stay hidden.
 *
 * A loader rather than a `useQuery` hook because the read happens on a click,
 * for a release chosen at that moment. It goes through the query client so the
 * request is deduplicated and cancellable, and it is always fetched fresh:
 * another admin may have published an artist since the last read.
 *
 * @returns An async function resolving to the credit confirmation. Rejects
 *   when the request fails or the response does not match the schema.
 */
export const useCreditConfirmationLoader = (): ((
  source: CreditConfirmationSource
) => Promise<CreditConfirmation>) => {
  const queryClient = useQueryClient();

  return useCallback(
    (source: CreditConfirmationSource) =>
      queryClient.fetchQuery({
        queryKey: keyOf(source),
        queryFn: ({ signal }) =>
          fetchAndParse(urlOf(source), creditConfirmationSchema, {
            signal,
            errorMessage: 'Failed to load the credited artists',
          }),
        staleTime: 0,
      }),
    [queryClient]
  );
};
