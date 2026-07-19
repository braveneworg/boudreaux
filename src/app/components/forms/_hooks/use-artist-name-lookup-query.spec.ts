/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useArtistNameLookupQuery } from './use-artist-name-lookup-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const matchResult = {
  results: [
    {
      name: 'Ceschi',
      match: { id: 'a1', displayName: 'Ceschi', firstName: 'Ceschi', surname: '' },
    },
    { name: 'Unknown', match: null },
  ],
};

interface CapturedOptions {
  enabled: boolean;
  staleTime: number;
  retry: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

beforeEach(() => {
  mockUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    error: undefined,
    data: undefined,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockUseQuery.mockReset();
});

describe('useArtistNameLookupQuery', () => {
  it('fetches the correct URL with repeated name params and resolves parsed results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => matchResult })
    );

    renderHook(() => useArtistNameLookupQuery(['Ceschi', 'Unknown']));

    const { signal } = new AbortController();
    const result = await lastOptions().queryFn({ signal });

    expect(result).toEqual(matchResult);
    const fetchedUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(fetchedUrl).toContain('name=Ceschi');
    expect(fetchedUrl).toContain('name=Unknown');
    expect(fetchedUrl).toContain('/api/artists/name-lookup');
  });

  it('forwards the AbortSignal to fetch', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => matchResult })
    );

    renderHook(() => useArtistNameLookupQuery(['Ceschi']));

    await lastOptions().queryFn({ signal: controller.signal });

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), {
      signal: controller.signal,
    });
  });

  it('disables the query when names is an empty array', () => {
    renderHook(() => useArtistNameLookupQuery([]));

    expect(lastOptions().enabled).toBe(false);
  });

  it('respects options.enabled: false override even when names are present', () => {
    renderHook(() => useArtistNameLookupQuery(['Ceschi'], { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });

  it('sets retry to false', () => {
    renderHook(() => useArtistNameLookupQuery(['Ceschi']));

    expect(lastOptions().retry).toBe(false);
  });

  it('sets staleTime to 60_000', () => {
    renderHook(() => useArtistNameLookupQuery(['Ceschi']));

    expect(lastOptions().staleTime).toBe(60_000);
  });

  it('uses the nameLookup query key', () => {
    renderHook(() => useArtistNameLookupQuery(['Ceschi', 'Sole']));

    expect(lastOptions().queryKey).toEqual(['artists', 'nameLookup', 'ceschi', 'sole']);
  });

  it('throws on a malformed response body (Zod validation failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ bad: 'shape' }) })
    );

    renderHook(() => useArtistNameLookupQuery(['Ceschi']));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).rejects.toThrow();
  });
});
