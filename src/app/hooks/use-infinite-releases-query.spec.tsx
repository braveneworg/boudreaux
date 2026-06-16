// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  RELEASES_PAGE_SIZE,
  useReleasesQuery,
  type ReleasesQueryParams,
} from './use-infinite-releases-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface ReleasesQueryOptions {
  queryKey: unknown[];
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (params: ReleasesQueryParams): ReleasesQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useReleasesQuery(params));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as ReleasesQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useReleasesQuery', () => {
  it('keys the query by the admin-infinite params and starts at skip 0', () => {
    const opts = getOptions({ search: 'Album', published: null, deleted: false });

    expect(opts.queryKey).toEqual(['releases', 'adminInfinite', 'album', null, false]);
    expect(opts.initialPageParam).toBe(0);
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

    expect(fetchMock).toHaveBeenCalledWith(`/api/releases?skip=24&take=${RELEASES_PAGE_SIZE}`, {
      signal,
    });
  });

  it('includes search, published, and deleted params when set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: 'Test', published: true, deleted: true });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/releases?skip=0&take=${RELEASES_PAGE_SIZE}&search=Test&published=true&deleted=true`,
      { signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions({ search: '', published: null, deleted: false });

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch releases');
  });
});
