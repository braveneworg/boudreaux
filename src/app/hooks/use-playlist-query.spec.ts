/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from './fetch-and-parse';
import { usePlaylistQuery } from './use-playlist-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const playlistDetailResponse = {
  id: 'p1',
  title: 'Late Night Mix',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 1,
  totalDuration: 213,
  items: [
    {
      id: 'i1',
      itemType: 'track',
      sortOrder: 0,
      title: 'Song',
      artistName: 'Artist',
      duration: 213,
      available: true,
      trackFileId: 'tf1',
      releaseId: 'r1',
      releaseTitle: 'Album',
      videoId: null,
      coverArt: null,
    },
  ],
};

interface CapturedOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('usePlaylistQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: playlistDetailResponse,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query when playlistId is null', () => {
    renderHook(() => usePlaylistQuery(null));

    expect(lastOptions().enabled).toBe(false);
    expect(lastOptions().queryKey).toEqual(['playlists', 'detail', '']);
  });

  it('enables the query and uses the detail key for a playlist id', () => {
    renderHook(() => usePlaylistQuery('p1'));

    expect(lastOptions().enabled).toBe(true);
    expect(lastOptions().queryKey).toEqual(['playlists', 'detail', 'p1']);
  });

  it('fetches the playlist detail with the forwarded signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => playlistDetailResponse })
    );

    renderHook(() => usePlaylistQuery('p1'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(playlistDetailResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/playlists/p1', { signal });
  });

  it('throws when the playlist request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => usePlaylistQuery('p1'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch playlist');
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    renderHook(() => usePlaylistQuery('p1'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('lets a caller-supplied enabled=false win over a valid id', () => {
    renderHook(() => usePlaylistQuery('p1', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
