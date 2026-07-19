// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { TOURS_PAGE_SIZE, useInfiniteToursQuery } from './use-infinite-tours-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface ToursQueryOptions {
  queryKey: unknown[];
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (search: string): ToursQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfiniteToursQuery(search));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as ToursQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useInfiniteToursQuery', () => {
  it('keys the query by the (normalized) search term and starts at skip 0', () => {
    const opts = getOptions('Summer');

    expect(opts.queryKey).toEqual(['tours', 'infinite', 'summer']);
    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions('');

    expect(opts.getNextPageParam({ nextSkip: 48 })).toBe(48);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page with skip/take and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('');
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(`/api/tours?skip=24&take=${TOURS_PAGE_SIZE}`, {
      signal,
    });
  });

  it('includes the search term in the request when present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('Rock');

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tours?skip=0&take=${TOURS_PAGE_SIZE}&search=Rock`,
      { signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions('');

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch tours');
  });
});
