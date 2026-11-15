/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { submissionReadPath } from '@/lib/community/community-paths';
import { queryKeys } from '@/lib/query-keys';
import type { SubmissionViewPayload } from '@/lib/types/domain/submission';
import { submissionViewPayloadSchema } from '@/lib/validation/submission-view-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/**
 * How long a read of a submission is held before the next opening reads it
 * again. Short, since a rejection or an edit takes a submission offline; long
 * enough that a deep link's server read is not repeated at once in the browser.
 */
export const SUBMISSION_STALE_MS = 30_000;

/**
 * Reads one submission as this reader may see it, from
 * `/api/community/submissions/:id`, forwarding the TanStack `AbortSignal`.
 * A `404` is an answer, not a failure: the reader may not open it.
 *
 * @throws If the response status is neither OK nor `404`, or the body is malformed.
 */
const fetchSubmission = async (
  submissionId: string,
  signal?: AbortSignal
): Promise<SubmissionViewPayload | null> =>
  fetchAndParse(submissionReadPath(submissionId), submissionViewPayloadSchema, {
    signal,
    errorMessage: 'Failed to load the submission',
    fallbackByStatus: { 404: null },
  });

/**
 * React Query hook behind the submission modal: one submission as the
 * reader may see it (the public a public one; its owner and approvers any).
 *
 * `data` is `null` when the reader may not open the submission, whether it
 * does not exist, is not public, or was taken offline since it was listed.
 *
 * @param submissionId - The submission to read, or `null` while none is
 * open: the query is then disabled, whatever `options.enabled` says.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `staleTime`); the no-submission gate is applied on top.
 * @returns The TanStack `useQuery` result; `data` is the payload or `null`.
 */
export const useSubmissionQuery = (
  submissionId: string | null,
  options: QueryOptionsOverride<SubmissionViewPayload | null> = {}
) =>
  useQuery({
    queryKey: queryKeys.submissions.detail(submissionId ?? ''),
    queryFn: ({ signal }) => fetchSubmission(submissionId ?? '', signal),
    staleTime: SUBMISSION_STALE_MS,
    ...options,
    enabled: (options.enabled ?? true) && submissionId !== null,
  });
