// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import { COMMUNITY_PAGE_SIZE } from '@/lib/constants/submissions';
import type { SubmissionCardPage } from '@/lib/validation/submission-listing-schema';

import { useInfiniteListedSubmissionsQuery } from './use-infinite-listed-submissions-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface ListedQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  initialPageParam: number;
  queryFn: (ctx: { pageParam: number; signal?: AbortSignal }) => Promise<SubmissionCardPage>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const page: SubmissionCardPage = {
  rows: [
    {
      id: 'c'.repeat(24),
      title: 'Bus poem',
      category: 'WRITING',
      cardPictureUrl: null,
      owner: { username: 'ada', gravatarHash: 'abc123' },
    },
  ],
  nextSkip: 12,
};

const getOptions = (
  user = '',
  overrides: InfiniteQueryOptionsOverride<SubmissionCardPage> = {}
): ListedQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfiniteListedSubmissionsQuery(user, overrides));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as ListedQueryOptions;
};

const stubFetch = (body: unknown, ok = true): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    headers: new Headers(),
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useInfiniteListedSubmissionsQuery', () => {
  it('keys the query by the user the list is narrowed to', () => {
    expect(getOptions('ada').queryKey).toEqual(['submissions', 'listedInfinite', 'ada']);
  });

  it('keys everyone’s list with an empty user', () => {
    expect(getOptions().queryKey).toEqual(['submissions', 'listedInfinite', '']);
  });

  it('starts at the first page and follows each page’s cursor', () => {
    const opts = getOptions();

    expect(opts.initialPageParam).toBe(0);
    expect(opts.getNextPageParam({ nextSkip: 24 })).toBe(24);
    expect(opts.getNextPageParam({ nextSkip: null })).toBeNull();
  });

  it('fetches a page of the listing route, forwarding the abort signal', async () => {
    const fetchMock = stubFetch(page);
    const { signal } = new AbortController();

    await expect(getOptions().queryFn({ pageParam: 12, signal })).resolves.toEqual(page);
    expect(fetchMock.mock.calls).toEqual([
      [
        `/api/community/submissions?skip=12&take=${COMMUNITY_PAGE_SIZE}`,
        expect.objectContaining({ signal }),
      ],
    ]);
  });

  it('asks for one user’s list by username', async () => {
    const fetchMock = stubFetch(page);

    await getOptions('ada lovelace').queryFn({ pageParam: 0 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/community/submissions?skip=0&take=${COMMUNITY_PAGE_SIZE}&user=ada+lovelace`
    );
  });

  it('throws when the route fails', async () => {
    stubFetch({ error: 'Internal server error' }, false);

    await expect(getOptions().queryFn({ pageParam: 0 })).rejects.toThrow(
      'Failed to fetch submissions'
    );
  });

  it('throws on a page that is not the shape the route promises', async () => {
    stubFetch({ rows: [{ id: 'x' }], nextSkip: null });

    await expect(getOptions().queryFn({ pageParam: 0 })).rejects.toThrow();
  });

  it('lets a call site override an option, but not the key', () => {
    const opts = getOptions('', { enabled: false });

    expect(opts.enabled).toBe(false);
    expect(opts.queryKey).toEqual(['submissions', 'listedInfinite', '']);
  });
});
