// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import type { InfiniteQueryOptionsOverride } from '@/hooks/query-options';
import type { ArtistListingSort } from '@/lib/types/domain/artist';

import {
  PUBLISHED_ARTISTS_PAGE_SIZE,
  useInfinitePublishedArtistsQuery,
} from './use-infinite-published-artists-query';

import type { PublishedArtistsPaginatedResponse } from './use-infinite-published-artists-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

interface PublishedArtistsQueryOptions {
  queryKey: unknown[];
  enabled?: boolean;
  initialPageParam: number;
  placeholderData: unknown;
  queryFn: (ctx: {
    pageParam: number;
    signal?: AbortSignal;
  }) => Promise<PublishedArtistsPaginatedResponse>;
  getNextPageParam: (lastPage: { nextSkip: number | null }) => number | null;
}

const artistRowResponse = {
  id: 'artist-1',
  slug: 'e2e-artist',
  firstName: 'E2E',
  middleName: null,
  surname: 'Artist',
  title: null,
  suffix: null,
  displayName: 'E2E Artist',
  akaNames: null,
  genres: 'Experimental',
  instruments: null,
  shortBio: 'A short bio.',
  bornOn: null,
  diedOn: null,
  formedOn: '2010-01-01T00:00:00.000Z',
  bioImages: [],
  members: [],
  memberOf: [],
  releaseCount: 2,
  newestRelease: { id: 'r-1', title: 'LP', releasedOn: '2024-09-01T00:00:00.000Z' },
};

const getOptions = (
  sort: ArtistListingSort = 'alpha',
  search = '',
  overrides: InfiniteQueryOptionsOverride<PublishedArtistsPaginatedResponse> = {}
): PublishedArtistsQueryOptions => {
  useInfiniteQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useInfinitePublishedArtistsQuery(sort, search, overrides));
  return useInfiniteQueryMock.mock.calls.at(-1)?.[0] as PublishedArtistsQueryOptions;
};

beforeEach(() => useInfiniteQueryMock.mockReset());

afterEach(() => vi.unstubAllGlobals());

describe('useInfinitePublishedArtistsQuery', () => {
  it('requests a 24-row page', () => {
    expect(PUBLISHED_ARTISTS_PAGE_SIZE).toBe(24);
  });

  it('keys the query by the published-infinite sort', () => {
    const opts = getOptions('newest');

    expect(opts.queryKey).toEqual(['artists', 'publishedInfinite', 'newest', '']);
  });

  it('defaults the sort to A–Z', () => {
    const opts = getOptions();

    expect(opts.queryKey).toEqual(['artists', 'publishedInfinite', 'alpha', '']);
  });

  it('keys the query by the normalized search term', () => {
    const opts = getOptions('alpha', '  Punk  ');

    expect(opts.queryKey).toEqual(['artists', 'publishedInfinite', 'alpha', 'punk']);
  });

  it('starts pagination at skip 0', () => {
    const opts = getOptions();

    expect(opts.initialPageParam).toBe(0);
  });

  it('keeps the previous page on screen while a new key loads', () => {
    const opts = getOptions();

    expect(opts.placeholderData).toBeTypeOf('symbol');
  });

  it('derives the next page param from nextSkip', () => {
    const opts = getOptions();

    expect(opts.getNextPageParam({ nextSkip: 24 })).toBe(24);
  });

  it('fetches the published listing with skip/take/sort and forwards the signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [artistRowResponse], nextSkip: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('newest');
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 24, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artists?listing=published&skip=24&take=${PUBLISHED_ARTISTS_PAGE_SIZE}&sort=newest`,
      { signal }
    );
  });

  it('appends the search param to the listing request when set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [artistRowResponse], nextSkip: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const opts = getOptions('alpha', 'Punk');
    const { signal } = new AbortController();

    await opts.queryFn({ pageParam: 0, signal });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/artists?listing=published&skip=0&take=${PUBLISHED_ARTISTS_PAGE_SIZE}&sort=alpha&search=Punk`,
      { signal }
    );
  });

  it('parses the wire row back into coerced Date fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rows: [artistRowResponse], nextSkip: null }),
      })
    );
    const opts = getOptions();

    const page = await opts.queryFn({ pageParam: 0 });

    expect(page.rows[0]?.newestRelease?.releasedOn).toEqual(new Date('2024-09-01T00:00:00.000Z'));
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const opts = getOptions();

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow('Failed to fetch artists');
  });

  it('lets a caller override enabled via the trailing options', () => {
    const opts = getOptions('alpha', '', { enabled: false });

    expect(opts.enabled).toBe(false);
  });
});
