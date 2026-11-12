/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import {
  submissionAttachmentsResponseSchema,
  type SubmissionAttachmentsResponse,
} from '@/lib/validation/submission-attachment-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** Poll cadence while any attachment is still processing. */
export const ATTACHMENTS_POLL_INTERVAL_MS = 2500;

/**
 * Fetches a submission's attachments from
 * `/api/community/submissions/:id/attachments`, forwarding the TanStack
 * `AbortSignal`.
 */
const fetchSubmissionAttachments = async (
  submissionId: string,
  signal?: AbortSignal
): Promise<SubmissionAttachmentsResponse> =>
  fetchAndParse(
    `/api/community/submissions/${encodeURIComponent(submissionId)}/attachments`,
    submissionAttachmentsResponseSchema,
    { signal, errorMessage: 'Failed to load the attachments' }
  );

/**
 * A submission's attachments as its owner or an approver sees them, and the
 * state the submission is in. The query refetches on an interval only while
 * an attachment is processing, so a page with nothing in flight asks once.
 *
 * @param submissionId - The submission to read; the query is disabled when empty.
 * @param options - Caller overrides spread into `useQuery` (notably
 * `initialData` from the server render, and `enabled`); the non-empty-id gate
 * and the adaptive `refetchInterval` are applied on top.
 * @returns The query state: `data`, `isPending`, `isError`, `refetch`.
 */
export const useSubmissionAttachmentsQuery = (
  submissionId: string,
  options: QueryOptionsOverride<SubmissionAttachmentsResponse> = {}
) => {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.submissions.attachments(submissionId),
    queryFn: ({ signal }) => fetchSubmissionAttachments(submissionId, signal),
    staleTime: 0,
    ...options,
    enabled: (options.enabled ?? true) && !!submissionId,
    refetchInterval: (query) =>
      query.state.data?.attachments.some(({ state }) => state === 'processing')
        ? ATTACHMENTS_POLL_INTERVAL_MS
        : false,
  });

  return { data, isPending, isError, refetch };
};
