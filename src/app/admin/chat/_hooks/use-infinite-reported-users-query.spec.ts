// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  REPORTED_USERS_PAGE_SIZE,
  useInfiniteReportedUsersQuery,
} from './use-infinite-reported-users-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface InfiniteOptions {
  queryKey: unknown[];
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<unknown>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const getOptions = (params: { windowDays: number | null; search?: string }): InfiniteOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfiniteReportedUsersQuery(params));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as InfiniteOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('useInfiniteReportedUsersQuery', () => {
  it('keys the query by window + search and starts at skip 0', () => {
    const opts = getOptions({ windowDays: null, search: 'Spam' });

    expect(opts.queryKey).toEqual(['chat', 'reportedUsersInfinite', 'all', 'spam']);
    expect(opts.initialPageParam).toBe(0);
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions({ windowDays: 7 });

    expect(opts.getNextPageParam({ nextSkip: 24 })).toBe(24);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page with skip/take (no-store) and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ windowDays: null });
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/chat/reported-users?skip=24&take=${REPORTED_USERS_PAGE_SIZE}`,
      { cache: 'no-store', signal }
    );
  });

  it('includes windowDays and search in the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: null }) });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions({ windowDays: 30, search: 'abc' });

    await opts.queryFn({ pageParam: 0 });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/chat/reported-users?skip=0&take=${REPORTED_USERS_PAGE_SIZE}&windowDays=30&search=abc`,
      { cache: 'no-store', signal: undefined }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions({ windowDays: null });

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to load reported users');
  });
});
