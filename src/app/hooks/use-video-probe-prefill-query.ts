/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

// ── Response schema ───────────────────────────────────────────────────────────

const probePrefillTagsSchema = z.object({
  title: z.string().nullable(),
  artist: z.string().nullable(),
  releasedOn: z.string().nullable(),
  description: z.string().nullable(),
  durationSeconds: z.number().nullable(),
});

const probePrefillResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), tags: probePrefillTagsSchema }),
  z.object({ ok: z.literal(false), error: z.string().optional() }),
]);

/** Parsed response from `GET /api/videos/probe-metadata`. */
export type ProbePrefillResponse = z.infer<typeof probePrefillResponseSchema>;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React Query hook for fetching ffprobe-derived prefill metadata for the admin
 * video form. This is the **only** access path to `GET /api/videos/probe-metadata`;
 * never call that route directly from a component.
 *
 * The query is disabled when either `s3Key` or `videoId` is empty, or when
 * `options.enabled` is `false`. `staleTime` is `Infinity` because the same
 * s3Key never needs re-probing. `retry` is `false` because ffprobe is expensive
 * and a failed probe silently skips prefill.
 *
 * @param s3Key - The S3 key of the uploaded video; disables the query when empty.
 * @param videoId - The admin video record id; disables the query when empty.
 * @param options - Caller overrides spread into `useQuery` (e.g. `enabled`);
 * `queryKey` and `queryFn` stay locked.
 * @returns The TanStack Query result containing `{ ok: true, tags }` or `{ ok: false }`.
 */
export const useVideoProbePrefillQuery = (
  s3Key: string,
  videoId: string,
  options: QueryOptionsOverride<ProbePrefillResponse> = {}
): UseQueryResult<ProbePrefillResponse> => {
  return useQuery({
    queryKey: queryKeys.videos.probePrefill(s3Key, videoId),
    queryFn: ({ signal }) =>
      fetchAndParse(
        `/api/videos/probe-metadata?videoId=${encodeURIComponent(videoId)}&s3Key=${encodeURIComponent(s3Key)}`,
        probePrefillResponseSchema,
        { signal, errorMessage: 'Failed to fetch probe prefill' }
      ),
    staleTime: Infinity,
    retry: false,
    ...options,
    enabled: (options.enabled ?? true) && s3Key !== '' && videoId !== '',
  });
};
