// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';

import {
  PUBLISHED_VIDEOS_PAGE_SIZE,
  useInfinitePublishedVideosQuery,
} from './use-infinite-published-videos-query';

import type { PublishedVideosPaginatedResponse } from './use-infinite-published-videos-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface PublishedVideosQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  initialPageParam: number;
  queryFn: (ctx: {
    pageParam: number;
    signal?: AbortSignal;
  }) => Promise<PublishedVideosPaginatedResponse>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const videoRowResponse = {
  id: 'video-1',
  title: 'Clip',
  artist: 'Artist',
  category: 'MUSIC',
  description: null,
  releasedOn: '2024-01-01T00:00:00.000Z',
  durationSeconds: 90,
  s3Key: 'videos/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: 123456,
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: '2024-02-01T00:00:00.000Z',
  archivedAt: null,
  // createdBy / updatedBy are stripped from the public wire payload; the schema
  // makes them optional so the row parses fine without them.
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  streamUrl: 'https://cdn.example.com/clip.mp4',
};

const getOptions = (
  sort: 'asc' | 'desc' = 'desc',
  overrides: InfiniteQueryOptionsOverride<PublishedVideosPaginatedResponse> = {}
): PublishedVideosQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfinitePublishedVideosQuery(sort, overrides));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as PublishedVideosQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useInfinitePublishedVideosQuery', () => {
  it('keys the query by the published-infinite sort', () => {
    const opts = getOptions('asc');

    expect(opts.queryKey).toEqual(['videos', 'publishedInfinite', 'asc']);
  });

  it('defaults the sort to desc', () => {
    const opts = getOptions();

    expect(opts.queryKey).toEqual(['videos', 'publishedInfinite', 'desc']);
  });

  it('starts pagination at skip 0', () => {
    const opts = getOptions();

    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions();

    expect(opts.getNextPageParam({ nextSkip: 5 })).toBe(5);
  });

  it('fetches the published listing with skip/take/sort and forwards the signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [videoRowResponse], nextSkip: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('desc');
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 0, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/videos?listing=published&skip=0&take=${PUBLISHED_VIDEOS_PAGE_SIZE}&sort=desc`,
      { signal }
    );
  });

  it('parses the wire row back into coerced Date and bigint fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [videoRowResponse], nextSkip: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('desc');

    const page = await opts.queryFn({ pageParam: 0 });

    expect(page.rows[0]?.fileSize).toBe(123456n);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions();

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch videos');
  });

  it('lets a caller override enabled via the trailing options', () => {
    const opts = getOptions('desc', { enabled: false });

    expect(opts.enabled).toBe(false);
  });
});
