/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useFeaturedArtistQuery } from './use-featured-artist-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const featuredArtistResponse = {
  id: 'fa-1',
  displayName: null,
  featuredOn: '2024-01-01T00:00:00.000Z',
  featuredUntil: null,
  digitalFormatId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  publishedOn: null,
  position: 1,
  description: null,
  coverArt: null,
  featuredTrackNumber: null,
  releaseId: null,
  artists: [],
  digitalFormat: null,
  release: null,
};

describe('useFeaturedArtistQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query when no featured artist id is provided', () => {
    renderHook(() => useFeaturedArtistQuery(''));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('uses the featured artist detail query key', () => {
    renderHook(() => useFeaturedArtistQuery('fa-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['featuredArtists', 'detail', 'fa-1']);
  });

  it('fetches and parses the featured artist on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => featuredArtistResponse })
    );

    renderHook(() => useFeaturedArtistQuery('fa-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();
    const result = (await options.queryFn({ signal })) as { id: string };

    expect(result.id).toBe('fa-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/featured-artists/fa-1', { signal });
  });

  it('returns null when the featured artist is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useFeaturedArtistQuery('missing'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useFeaturedArtistQuery('fa-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch featured artist');
  });
});
