// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  PUBLISHED_RELEASES_PAGE_SIZE,
  usePublishedReleaseSearchQuery,
  useInfinitePublishedReleasesQuery,
} from './use-infinite-published-releases-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
  useQuery: (options: unknown) => useQueryMock(options),
}));

interface InfiniteOptions {
  queryKey: unknown[];
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

interface SearchOptions {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: (ctx: { signal?: AbortSignal }) => Promise<unknown>;
  select: (page: { rows: unknown[] }) => unknown;
}

beforeEach(() => {
  useInfiniteQueryMock.mockReset();
  useQueryMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('useInfinitePublishedReleasesQuery', () => {
  const getOptions = (search?: string): InfiniteOptions => {
    useInfiniteQueryMock.mockReturnValue({ isPending: true });
    renderHook(() => useInfinitePublishedReleasesQuery(search));
    return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as InfiniteOptions;
  };

  it('keys the query by search and starts at skip 0', () => {
    const opts = getOptions('Doe');

    expect(opts.queryKey).toEqual(['releases', 'publishedInfinite', 'doe']);
    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions();

    expect(opts.getNextPageParam({ nextSkip: 24 })).toBe(24);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a published page with skip/take and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions();
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/releases?listing=published&skip=24&take=${PUBLISHED_RELEASES_PAGE_SIZE}`,
      { signal }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions();

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch releases');
  });
});

describe('usePublishedReleaseSearchQuery', () => {
  const getOptions = (search: string): SearchOptions => {
    useQueryMock.mockReturnValue({ data: [] });
    renderHook(() => usePublishedReleaseSearchQuery(search));
    return useQueryMock.mock.calls.at(-1)?.[0] as SearchOptions;
  };

  it('is disabled until the user types', () => {
    expect(getOptions('   ').enabled).toBe(false);
    expect(getOptions('rock').enabled).toBe(true);
  });

  it('keys the query under a combobox namespace', () => {
    expect(getOptions('rock').queryKey).toEqual(['releases', 'publishedInfinite', 'combobox:rock']);
  });

  it('selects the rows from the page response', () => {
    const rows = [{ id: 'r-1' }];
    expect(getOptions('rock').select({ rows })).toBe(rows);
  });

  it('requests a capped first page including the search term', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('rock');

    await opts.queryFn({});

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/releases?listing=published&skip=0&take=20&search=rock',
      { signal: undefined }
    );
  });
});
