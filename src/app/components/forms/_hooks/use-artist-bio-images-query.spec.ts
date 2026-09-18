/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { fetchArtistBioImages, useArtistBioImagesQuery } from './use-artist-bio-images-query';

interface MockQueryConfig {
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  enabled: boolean;
  staleTime?: number;
}

const mockUseQueries = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQueries: (options: { queries: MockQueryConfig[] }) => mockUseQueries(options),
}));

const wireRow = {
  id: '665f1f77bcf86cd799439021',
  url: 'https://cdn.example/a.webp',
  attribution: null,
  isPrimary: true,
  displayOrder: 0,
  alt: 'Ceschi on stage',
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('fetchArtistBioImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the pool for the artist, forwarding the abort signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([wireRow])));
    const { signal } = new AbortController();

    const rows = await fetchArtistBioImages('a1', signal);

    expect(global.fetch).toHaveBeenCalledWith('/api/artists/a1/bio-images', { signal });
    expect(rows).toEqual([expect.objectContaining({ id: wireRow.id, displayOrder: 0 })]);
  });

  it('resolves to an empty pool when the artist is not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 404)));

    await expect(fetchArtistBioImages('missing')).resolves.toEqual([]);
  });

  it('rejects a malformed row instead of trusting the wire', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ id: 'x' }])));

    await expect(fetchArtistBioImages('a1')).rejects.toThrow();
  });
});

describe('useArtistBioImagesQuery', () => {
  it('builds one query per artist with the bio images key and gate', () => {
    mockUseQueries.mockReturnValue([
      { data: undefined, isPending: true },
      { data: undefined, isPending: true },
    ]);

    renderHook(() => useArtistBioImagesQuery(['a', '']));

    const { queries } = mockUseQueries.mock.calls[0]?.[0] as { queries: MockQueryConfig[] };

    expect(queries[0]?.queryKey).toEqual(['artists', 'bioImages', 'a']);
    expect(queries[0]?.enabled).toBe(true);
    expect(queries[1]?.enabled).toBe(false);
  });

  it('fetches a single pool through the shared helper, forwarding the signal', async () => {
    mockUseQueries.mockReturnValue([{ data: undefined, isPending: true }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([wireRow])));

    renderHook(() => useArtistBioImagesQuery(['a']));

    const { queries } = mockUseQueries.mock.calls[0]?.[0] as { queries: MockQueryConfig[] };
    const { signal } = new AbortController();

    await expect(queries[0]?.queryFn({ signal })).resolves.toEqual([
      expect.objectContaining({ id: wireRow.id }),
    ]);
    expect(global.fetch).toHaveBeenCalledWith('/api/artists/a/bio-images', { signal });
    vi.unstubAllGlobals();
  });

  it('maps each requested artist to its pool and reports pending', () => {
    mockUseQueries.mockReturnValue([
      { data: [wireRow], isPending: false },
      { data: undefined, isPending: true },
    ]);

    const { result } = renderHook(() => useArtistBioImagesQuery(['a', 'b']));

    expect(result.current.imagesByArtistId).toEqual({ a: [wireRow], b: undefined });
    expect(result.current.isPending).toBe(true);
  });

  it('spreads caller overrides while keeping the non-empty-id gate', () => {
    mockUseQueries.mockReturnValue([{ data: [], isPending: false }]);

    renderHook(() => useArtistBioImagesQuery([''], { staleTime: 5_000, enabled: true }));

    const { queries } = mockUseQueries.mock.calls[0]?.[0] as { queries: MockQueryConfig[] };

    expect(queries[0]?.staleTime).toBe(5_000);
    expect(queries[0]?.enabled).toBe(false);
  });
});
