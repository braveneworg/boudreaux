/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery } from '@tanstack/react-query';
import { type z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { queryKeys } from '@/lib/query-keys';
import { digitalFormatWithFilesSchema } from '@/lib/validation/media-models-schema';
import { parseResponse } from '@/utils/fetch-and-parse';

/** The single digital format (with its child files) for one release + format. */
export type ReleaseDigitalFormat = z.infer<typeof digitalFormatWithFilesSchema>;

/**
 * Fetches a single digital format (with its child files) for a release from the
 * `/api/releases/[id]/digital-formats?formatType=…` route handler. Unlike the
 * list-oriented {@link useReleaseDigitalFormatsQuery} (which returns the thin
 * `{ formatType, fileName }[]` projection), this returns the full format record
 * — `id`, `files[].{ trackNumber, title, fileName }` — needed to wire a featured
 * track selector.
 *
 * The route wraps the format in `{ digitalFormat }`; a 404 (no such format for
 * the release) maps to `null`. Forwards the TanStack Query {@link AbortSignal}
 * to `fetch` so the request is cancelled automatically on unmount,
 * invalidation, or a superseding refetch.
 *
 * @param releaseId - The release whose format is fetched.
 * @param formatType - The digital format type to look up (e.g. `MP3_320KBPS`).
 * @param signal - The `AbortSignal` forwarded from TanStack Query.
 * @returns The parsed digital format, or `null` when the release has no such
 * format (404).
 * @throws If the response status is not OK (other than 404).
 */
const fetchReleaseDigitalFormat = async (
  releaseId: string,
  formatType: DigitalFormatType,
  signal?: AbortSignal
): Promise<ReleaseDigitalFormat | null> => {
  const url = `/api/releases/${encodeURIComponent(releaseId)}/digital-formats?formatType=${encodeURIComponent(formatType)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw Error('Failed to fetch digital format');
  }
  const body: unknown = await response.json();
  const { digitalFormat } = body as { digitalFormat: unknown };
  return parseResponse(url, digitalFormatWithFilesSchema, digitalFormat);
};

/**
 * React Query hook for fetching a single release digital format with its files.
 *
 * Wraps {@link fetchReleaseDigitalFormat} with a stable query key and exposes
 * the request state. Cancellation is handled automatically via the forwarded
 * `AbortSignal`.
 *
 * @param releaseId - The release whose format is fetched.
 * @param formatType - The digital format type to look up.
 * @param options - Caller overrides spread into the `useQuery` call (e.g.
 * `enabled`); the non-empty-id gate is always applied on top.
 * @returns The query state: `isPending`, `isError`, `error` (defaulted when
 * unknown), `data` (the format, or `null` when not found), and `refetch`.
 */
export const useReleaseDigitalFormatQuery = (
  releaseId: string,
  formatType: DigitalFormatType,
  options: QueryOptionsOverride<ReleaseDigitalFormat | null> = {}
) => {
  const {
    isPending,
    isError,
    error = Error('Unknown error'),
    data,
    refetch,
  } = useQuery({
    queryKey: queryKeys.releases.digitalFormat(releaseId, formatType),
    queryFn: ({ signal }) => fetchReleaseDigitalFormat(releaseId, formatType, signal),
    ...options,
    enabled: (options.enabled ?? true) && !!releaseId && !!formatType,
  });

  return { isPending, isError, error, data, refetch };
};
