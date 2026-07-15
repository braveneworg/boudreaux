/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from './fetch-and-parse';
import { usePlaylistsQuery } from './use-playlists-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const playlistsResponse = {
  rows: [
    {
      id: 'p1',
      title: 'Late Night Mix',
      isPublic: false,
      coverImages: [],
      itemCount: 2,
      totalDuration: 371,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextSkip: null,
};

interface CapturedOptions {
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  staleTime?: number;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('usePlaylistsQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: playlistsResponse,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the my-playlists query key', () => {
    renderHook(() => usePlaylistsQuery());

    expect(lastOptions().queryKey).toEqual(['playlists', 'mine']);
  });

  it('fetches the first page of playlists with the forwarded signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => playlistsResponse })
    );

    renderHook(() => usePlaylistsQuery());

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(playlistsResponse);
    expect(global.fetch).toHaveBeenCalledWith('/api/playlists?skip=0&take=24', { signal });
  });

  it('throws when the playlists request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => usePlaylistsQuery());

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch playlists');
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [], nextSkip: 'oops' }) })
    );

    renderHook(() => usePlaylistsQuery());

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('passes caller overrides through to useQuery', () => {
    renderHook(() => usePlaylistsQuery({ staleTime: 5_000 }));

    expect(lastOptions().staleTime).toBe(5_000);
  });
});
