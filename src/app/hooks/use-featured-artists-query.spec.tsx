// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  FEATURED_ARTISTS_PAGE_SIZE,
  useFeaturedArtistsQuery,
  type FeaturedArtistsQueryParams,
} from './use-featured-artists-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface FeaturedArtistsQueryOptions {
  queryKey: unknown[];
  initialPageParam: number;
  refetchOnMount: string;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (params: FeaturedArtistsQueryParams): FeaturedArtistsQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useFeaturedArtistsQuery(params));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as FeaturedArtistsQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useFeaturedArtistsQuery', () => {
  it('keys the query by the admin-infinite params and starts at skip 0', () => {
    const opts = getOptions({ search: 'Jazz', published: null, deleted: false });

    expect(opts.queryKey).toEqual(['featuredArtists', 'adminInfinite', 'jazz', null, false]);
    expect(opts.initialPageParam).toBe(0);
  });

  it('always refetches on mount', () => {
    const opts = getOptions({ search: '', published: null, deleted: false });

    expect(opts.refetchOnMount).toBe('always');
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions({ search: '', published: null, deleted: false });

    expect(opts.getNextPageParam({ nextSkip: 48 })).toBe(48);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page with skip/take and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: '', published: null, deleted: false });
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/featured-artists?skip=24&take=${FEATURED_ARTISTS_PAGE_SIZE}`,
      { signal }
    );
  });

  it('includes the search and published params when set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: 'Soul', published: false, deleted: false });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/featured-artists?skip=0&take=${FEATURED_ARTISTS_PAGE_SIZE}&search=Soul&published=false`,
      { signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions({ search: '', published: null, deleted: false });

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow(
      'Failed to fetch featured artists'
    );
  });
});
