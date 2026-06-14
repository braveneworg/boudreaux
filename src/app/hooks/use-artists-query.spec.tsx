// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { ARTISTS_PAGE_SIZE, useArtistsQuery, type ArtistsQueryParams } from './use-artists-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface ArtistsQueryOptions {
  queryKey: unknown[];
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (params: ArtistsQueryParams): ArtistsQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useArtistsQuery(params));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as ArtistsQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useArtistsQuery', () => {
  it('keys the query by the admin-infinite params and starts at skip 0', () => {
    const opts = getOptions({ search: 'John', published: null, deleted: false });

    expect(opts.queryKey).toEqual(['artists', 'adminInfinite', 'john', null, false]);
    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions({ search: '', published: null, deleted: false });

    expect(opts.getNextPageParam({ nextSkip: 48 })).toBe(48);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page with skip/take and forwards the signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: '', published: null, deleted: false });
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(`/api/artists?skip=24&take=${ARTISTS_PAGE_SIZE}`, {
      signal,
    });
  });

  it('includes search, published, and deleted params when set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: 'Rock', published: true, deleted: true });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artists?skip=0&take=${ARTISTS_PAGE_SIZE}&search=Rock&published=true&deleted=true`,
      { signal: undefined }
    );
  });

  it('sends published=false but omits deleted when false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ search: '', published: false, deleted: false });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artists?skip=0&take=${ARTISTS_PAGE_SIZE}&published=false`,
      { signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions({ search: '', published: null, deleted: false });

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch artists');
  });
});
