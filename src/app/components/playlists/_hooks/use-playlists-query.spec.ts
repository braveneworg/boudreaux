/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import type { PlaylistListRow, PlaylistsResponse } from '@/lib/types/domain/playlist';
import { ResponseValidationError } from '@/utils/fetch-and-parse';

import { usePlaylistsQuery } from './use-playlists-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

const makeRow = (id: string, title: string): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages: [],
  itemCount: 2,
  totalDuration: 371,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const pageOne: PlaylistsResponse = { rows: [makeRow('p1', 'Late Night Mix')], nextSkip: 24 };
const pageTwo: PlaylistsResponse = { rows: [makeRow('p2', 'Morning Mix')], nextSkip: null };

interface CapturedOptions {
  queryKey: unknown[];
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<PlaylistsResponse>;
  initialPageParam: number;
  getNextPageParam: (lastPage: PlaylistsResponse) => number | null;
  enabled?: boolean;
}

const fetchNextPageMock = vi.fn();

/** Seed the mocked useInfiniteQuery return; data uses the InfiniteData
 * `{ pages, pageParams }` shape — the same shape `prefetchInfiniteQuery`
 * dehydrates, which is what keeps SSR hydration parity honest. */
const mockReturn = (overrides: Record<string, unknown> = {}): void => {
  useInfiniteQueryMock.mockReturnValue({
    isPending: false,
    error: undefined,
    data: { pages: [pageOne, pageTwo], pageParams: [0, 24] },
    refetch: vi.fn(),
    fetchNextPage: fetchNextPageMock,
    isFetchingNextPage: false,
    ...overrides,
  });
};

const lastOptions = (): CapturedOptions =>
  useInfiniteQueryMock.mock.calls.at(-1)?.[0] as CapturedOptions;

describe('usePlaylistsQuery', () => {
  beforeEach(() => {
    mockReturn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the my-playlists key with locked pagination options', () => {
    renderHook(() => usePlaylistsQuery());

    const opts = lastOptions();
    expect(opts.queryKey).toEqual(['playlists', 'mine']);
    expect(opts.initialPageParam).toBe(0);
    expect(opts.getNextPageParam(pageOne)).toBe(24);
    expect(opts.getNextPageParam(pageTwo)).toBeNull();
  });

  it('fetches the requested cursor page with the forwarded signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => pageTwo });
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePlaylistsQuery());
    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ pageParam: 24, signal })).resolves.toEqual(pageTwo);

    expect(fetchMock).toHaveBeenCalledWith('/api/playlists?skip=24&take=24', { signal });
  });

  it('surfaces a ResponseValidationError for a malformed page body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: 'oops' }) })
    );
    renderHook(() => usePlaylistsQuery());

    await expect(lastOptions().queryFn({ pageParam: 0 })).rejects.toBeInstanceOf(
      ResponseValidationError
    );
  });

  it('flattens loaded pages into rows and mirrors the LAST page nextSkip', () => {
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows?.map(({ id }) => id)).toEqual(['p1', 'p2']);
    expect(result.current.nextSkip).toBeNull();
  });

  it('reports the intermediate cursor while more pages remain', () => {
    mockReturn({ data: { pages: [pageOne], pageParams: [0] } });
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows?.map(({ id }) => id)).toEqual(['p1']);
    expect(result.current.nextSkip).toBe(24);
  });

  it('leaves rows undefined until the first page settles', () => {
    mockReturn({ isPending: true, data: undefined });
    const { result } = renderHook(() => usePlaylistsQuery());

    expect(result.current.rows).toBeUndefined();
    expect(result.current.nextSkip).toBeNull();
  });

  it('loadMore fetches the next page', () => {
    const { result } = renderHook(() => usePlaylistsQuery());

    result.current.loadMore();

    expect(fetchNextPageMock).toHaveBeenCalledTimes(1);
  });

  it('loadMore is a no-op while a page fetch is already in flight', () => {
    mockReturn({ isFetchingNextPage: true });
    const { result } = renderHook(() => usePlaylistsQuery());

    result.current.loadMore();

    expect(fetchNextPageMock).not.toHaveBeenCalled();
    expect(result.current.isLoadingMore).toBe(true);
  });

  it('passes caller overrides through to useInfiniteQuery', () => {
    renderHook(() => usePlaylistsQuery({ enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
