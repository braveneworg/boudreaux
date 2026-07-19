/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { linkPreviewSchema, type LinkPreview } from '@/lib/validation/link-preview-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

/** Client freshness window for a fetched preview — matches the server LRU TTL
 *  (1 h) so repeat opens of a link's card serve from cache, never the network. */
const LINK_PREVIEW_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * Fetches the unfurl preview for one external URL from
 * `/api/link-preview?url=<encoded>`, validating the body against
 * `linkPreviewSchema` and forwarding the TanStack `AbortSignal` so the request
 * cancels when the card closes, the query is invalidated, or a superseding
 * fetch starts.
 */
const fetchLinkPreview = (url: string, signal?: AbortSignal): Promise<LinkPreview> =>
  fetchAndParse(`/api/link-preview?url=${encodeURIComponent(url)}`, linkPreviewSchema, {
    signal,
    errorMessage: 'Failed to fetch link preview',
  });

/**
 * Lazily fetches an OG-unfurl preview for a single external bio link. Intended
 * to be driven by a card's open state via the `enabled` override: the query
 * stays idle until the admin opens the preview, then fetches once and — thanks
 * to the 1 h `staleTime` matching the server LRU TTL — serves subsequent opens
 * from cache with no network round-trip.
 *
 * @param url - The external URL to unfurl; forwarded encoded to the endpoint.
 * @param options - Caller overrides spread last into `useQuery` (notably
 * `enabled`); `queryKey`/`queryFn` stay locked.
 * @returns The full TanStack `UseQueryResult` (`isPending`, `isError`, `data`).
 */
export const useLinkPreviewQuery = (
  url: string,
  options: QueryOptionsOverride<LinkPreview> = {}
): UseQueryResult<LinkPreview> =>
  useQuery({
    queryKey: queryKeys.linkPreview(url),
    queryFn: ({ signal }) => fetchLinkPreview(url, signal),
    staleTime: LINK_PREVIEW_STALE_TIME_MS,
    ...options,
  });
