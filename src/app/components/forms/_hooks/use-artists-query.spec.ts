/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useArtistsQuery } from './use-artists-query';

interface MockQueryConfig {
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  enabled: boolean;
}

const mockUseQueries = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQueries: (options: { queries: MockQueryConfig[] }) => mockUseQueries(options),
}));

describe('useArtistsQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds one query per id with the artist detail key and gate', () => {
    mockUseQueries.mockReturnValue([
      { data: undefined, isPending: true },
      { data: undefined, isPending: true },
    ]);

    renderHook(() => useArtistsQuery(['a', '']));

    const { queries } = mockUseQueries.mock.calls[0]?.[0] as { queries: MockQueryConfig[] };

    expect(queries[0]?.queryKey).toEqual(['artists', 'detail', 'a']);
    expect(queries[0]?.enabled).toBe(true);
    expect(queries[1]?.enabled).toBe(false);
  });

  it('fetches a single artist via the shared helper', async () => {
    mockUseQueries.mockReturnValue([{ data: undefined, isPending: true }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useArtistsQuery(['a']));

    const { queries } = mockUseQueries.mock.calls[0]?.[0] as { queries: MockQueryConfig[] };
    const { signal } = new AbortController();

    await expect(queries[0]?.queryFn({ signal })).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/artists/a', { signal });
  });

  it('maps each requested id to its data in artistsById', () => {
    mockUseQueries.mockReturnValue([
      { data: { id: 'a' }, isPending: false },
      { data: null, isPending: false },
    ]);

    const { result } = renderHook(() => useArtistsQuery(['a', 'b']));

    expect(result.current.artistsById).toEqual({ a: { id: 'a' }, b: null });
  });

  it('reports isPending when any query is still pending', () => {
    mockUseQueries.mockReturnValue([
      { data: { id: 'a' }, isPending: false },
      { data: undefined, isPending: true },
    ]);

    const { result } = renderHook(() => useArtistsQuery(['a', 'b']));

    expect(result.current.isPending).toBe(true);
  });

  it('reports not pending when every query has resolved', () => {
    mockUseQueries.mockReturnValue([
      { data: { id: 'a' }, isPending: false },
      { data: { id: 'b' }, isPending: false },
    ]);

    const { result } = renderHook(() => useArtistsQuery(['a', 'b']));

    expect(result.current.isPending).toBe(false);
  });
});
