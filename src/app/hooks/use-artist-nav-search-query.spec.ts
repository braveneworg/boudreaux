/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useArtistNavSearchQuery } from './use-artist-nav-search-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe('useArtistNavSearchQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { results: [] },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query for short search terms', () => {
    renderHook(() => useArtistNavSearchQuery('ab'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryKey: unknown[];
    };

    expect(options.enabled).toBe(false);
    expect(options.queryKey).toEqual(['artists', 'search', 'ab']);
  });

  it('fetches search results for valid query strings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ artistSlug: 'a', artistName: 'A', thumbnailSrc: null, releases: [] }],
        }),
      })
    );

    renderHook(() => useArtistNavSearchQuery('artist'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryFn: () => Promise<unknown>;
    };

    expect(options.enabled).toBe(true);
    await expect(options.queryFn()).resolves.toEqual({
      results: [{ artistSlug: 'a', artistName: 'A', thumbnailSrc: null, releases: [] }],
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/artists/search?q=artist');
  });

  it('throws when the search request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useArtistNavSearchQuery('artist'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: () => Promise<unknown>;
    };

    await expect(options.queryFn()).rejects.toThrow('Failed to search artists');
  });
});
