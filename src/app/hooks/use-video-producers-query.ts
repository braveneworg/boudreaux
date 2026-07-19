/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

const producerSummarySchema = z.object({ id: z.string(), name: z.string() });
const videoProducersResponseSchema = z.object({ producers: z.array(producerSummarySchema) });
type ProducerSummary = z.infer<typeof producerSummarySchema>;

const fetchVideoProducers = async (
  videoId: string,
  signal?: AbortSignal
): Promise<ProducerSummary[]> => {
  const { producers } = await fetchAndParse(
    `/api/videos/${videoId}/producers`,
    videoProducersResponseSchema,
    { signal, errorMessage: 'Failed to fetch producers' }
  );
  return producers;
};

/**
 * Fetches the producers linked to a video for admin edit-mode prefill.
 * Disabled when `videoId` is empty; forwards the AbortSignal for
 * auto-cancellation on unmount or key change.
 *
 * @param videoId - The Mongo ObjectId of the video being edited.
 * @param options - Caller overrides spread last into `useQuery`.
 * @returns `{ isPending, error, data, refetch }`.
 */
export const useVideoProducersQuery = (
  videoId: string,
  options: QueryOptionsOverride<ProducerSummary[]> = {}
) => {
  const {
    isPending,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.videos.producers(videoId),
    queryFn: ({ signal }) => fetchVideoProducers(videoId, signal),
    enabled: videoId.length > 0,
    ...options,
  });
  return { isPending, error, data, refetch };
};
