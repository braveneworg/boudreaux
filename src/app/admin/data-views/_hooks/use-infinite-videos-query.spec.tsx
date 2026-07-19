// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';

import {
  useInfiniteVideosQuery,
  VIDEOS_PAGE_SIZE,
  type VideosPaginatedResponse,
  type VideosQueryParams,
} from './use-infinite-videos-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface VideosQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (
  params: VideosQueryParams,
  overrides: InfiniteQueryOptionsOverride<VideosPaginatedResponse> = {}
): VideosQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfiniteVideosQuery(params, overrides));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as VideosQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useInfiniteVideosQuery', () => {
  it('keys the query by the admin-infinite params and starts at skip 0', () => {
    const opts = getOptions({ search: 'Clip', published: null, archived: false, sort: 'desc' });

    expect(opts.queryKey).toEqual(['videos', 'adminInfinite', 'clip', null, false, 'desc']);
  });

  it('starts pagination at skip 0', () => {
    const opts = getOptions({ search: '', published: null, archived: false, sort: 'desc' });

    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions({ search: '', published: null, archived: false, sort: 'desc' });

    expect(opts.getNextPageParam({ nextSkip: 5 })).toBe(5);
  });

  it('returns null for the next page param on the last page', () => {
    const opts = getOptions({ search: '', published: null, archived: false, sort: 'desc' });

    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page with skip/take/sort and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: '', published: null, archived: false, sort: 'desc' });
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 5, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/videos?skip=5&take=${VIDEOS_PAGE_SIZE}&sort=desc`,
      { signal }
    );
  });

  it('includes search, published, and archived params when set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: 'Test', published: true, archived: true, sort: 'asc' });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/videos?skip=0&take=${VIDEOS_PAGE_SIZE}&sort=asc&search=Test&published=true&archived=true`,
      { signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions({ search: '', published: null, archived: false, sort: 'desc' });

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch videos');
  });

  it('lets a caller override enabled via the trailing options', () => {
    const opts = getOptions(
      { search: '', published: null, archived: false, sort: 'desc' },
      { enabled: false }
    );

    expect(opts.enabled).toBe(false);
  });
});
