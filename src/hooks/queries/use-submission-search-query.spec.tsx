// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { COMMUNITY_SEARCH_RESULTS } from '@/lib/constants/submissions';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { useSubmissionSearchQuery } from './use-submission-search-query';

const useQueryMock = vi.hoisted(() => vi.fn());
const KEEP_PREVIOUS = vi.hoisted(() => Symbol('keepPreviousData'));

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: KEEP_PREVIOUS,
  useQuery: (options: unknown) => useQueryMock(options),
}));

interface SearchQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  placeholderData?: unknown;
  queryFn: (ctx: { signal?: AbortSignal }) => Promise<SubmissionCard[]>;
}

const cards: SubmissionCard[] = [
  {
    id: 'c'.repeat(24),
    title: 'Bus poem',
    category: 'WRITING',
    cardPictureUrl: null,
    owner: { username: 'ada', gravatarHash: 'abc123' },
  },
];

const getOptions = (
  search = '',
  overrides: QueryOptionsOverride<SubmissionCard[]> = {}
): SearchQueryOptions => {
  useQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useSubmissionSearchQuery(search, overrides));
  return useQueryMock.mock.calls.at(-1)?.[0] as SearchQueryOptions;
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

beforeEach(() => useQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useSubmissionSearchQuery', () => {
  it('keys the query by the term, whatever its case or outer spaces', () => {
    expect(getOptions('  Bus ').queryKey).toEqual(['submissions', 'search', 'bus']);
  });

  it('asks the listing route for the best few matches, forwarding the abort signal', async () => {
    const fetchMock = stubFetch({ rows: cards, nextSkip: null });
    const { signal } = new AbortController();

    await expect(getOptions('bus poem').queryFn({ signal })).resolves.toEqual(cards);
    expect(fetchMock.mock.calls).toEqual([
      [
        `/api/community/submissions?skip=0&take=${COMMUNITY_SEARCH_RESULTS}&search=bus+poem`,
        expect.objectContaining({ signal }),
      ],
    ]);
  });

  it('asks for the newest when nothing is typed', async () => {
    const fetchMock = stubFetch({ rows: cards, nextSkip: null });

    await getOptions('   ').queryFn({});

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/community/submissions?skip=0&take=${COMMUNITY_SEARCH_RESULTS}`
    );
  });

  it('keeps the last results on screen while the next term loads', () => {
    expect(getOptions('bus').placeholderData).toBe(KEEP_PREVIOUS);
  });

  it('throws when the route fails', async () => {
    stubFetch({ error: 'Internal server error' }, false);

    await expect(getOptions('bus').queryFn({})).rejects.toThrow('Failed to search submissions');
  });

  it('lets a call site override an option, but not the key', () => {
    const opts = getOptions('bus', { enabled: false });

    expect(opts.enabled).toBe(false);
    expect(opts.queryKey).toEqual(['submissions', 'search', 'bus']);
  });
});
