/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { keepPreviousData } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from './fetch-and-parse';
import { usePlaylistMediaSearchQuery } from './use-playlist-media-search-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const mediaSearchResponse = {
  groups: [
    {
      key: 'songs',
      label: 'Songs',
      items: [
        {
          key: 'track:tf1',
          itemType: 'track',
          title: 'Song',
          artistName: 'Artist',
          coverArt: null,
          duration: 213,
          source: { trackFileId: 'tf1', releaseId: 'r1' },
        },
      ],
    },
  ],
};

interface CapturedOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  placeholderData: unknown;
  staleTime: number;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('usePlaylistMediaSearchQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: mediaSearchResponse,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query for a query below the minimum length', () => {
    renderHook(() => usePlaylistMediaSearchQuery('a'));

    expect(lastOptions().enabled).toBe(false);
  });

  it('disables the query for a whitespace-only query', () => {
    renderHook(() => usePlaylistMediaSearchQuery('   '));

    expect(lastOptions().enabled).toBe(false);
  });

  it('enables the query and normalizes the key at the minimum length', () => {
    renderHook(() => usePlaylistMediaSearchQuery('  Beach '));

    expect(lastOptions().enabled).toBe(true);
    expect(lastOptions().queryKey).toEqual(['playlists', 'mediaSearch', 'beach']);
  });

  it('keeps previous data and applies the 30s stale time', () => {
    renderHook(() => usePlaylistMediaSearchQuery('beach'));

    expect(lastOptions().placeholderData).toBe(keepPreviousData);
    expect(lastOptions().staleTime).toBe(30_000);
  });

  it('fetches the encoded media-search URL with the forwarded signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => mediaSearchResponse })
    );

    renderHook(() => usePlaylistMediaSearchQuery('beach boys'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(mediaSearchResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/playlists/media-search?q=beach%20boys', {
      signal,
    });
  });

  it('throws when the media search request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => usePlaylistMediaSearchQuery('beach'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to search media');
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ groups: [{ key: 'bogus', label: 'Bogus', items: [] }] }),
      })
    );

    renderHook(() => usePlaylistMediaSearchQuery('beach'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('lets a caller-supplied enabled=false win over a valid query', () => {
    renderHook(() => usePlaylistMediaSearchQuery('beach', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
