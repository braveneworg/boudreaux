/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';

import { useArtistImageLinksQuery } from './use-artist-image-links-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  refetchInterval: (query: { state: { data?: { status?: string | null } } }) => number | false;
}

const optionsOf = (): QueryOptionsShape => mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

describe('useArtistImageLinksQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { status: null, error: null, addedCount: null, links: [] },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the artist image-links query key', () => {
    renderHook(() => useArtistImageLinksQuery('artist-1'));

    expect(optionsOf().queryKey).toEqual(['artists', 'imageLinks', 'artist-1']);
  });

  it('disables the query when the artist id is empty', () => {
    renderHook(() => useArtistImageLinksQuery(''));

    expect(optionsOf().enabled).toBe(false);
  });

  it('honours a caller enabled:false override', () => {
    renderHook(() => useArtistImageLinksQuery('artist-1', { enabled: false }));

    expect(optionsOf().enabled).toBe(false);
  });

  it('marks status data stale immediately', () => {
    renderHook(() => useArtistImageLinksQuery('artist-1'));

    expect(optionsOf().staleTime).toBe(0);
  });

  it('polls only while the job is in flight', () => {
    renderHook(() => useArtistImageLinksQuery('artist-1'));
    const { refetchInterval } = optionsOf();

    expect(refetchInterval({ state: { data: { status: 'pending' } } })).toBe(2500);
    expect(refetchInterval({ state: { data: { status: 'processing' } } })).toBe(2500);
    expect(refetchInterval({ state: { data: { status: 'succeeded' } } })).toBe(false);
    expect(refetchInterval({ state: { data: { status: null } } })).toBe(false);
    expect(refetchInterval({ state: {} })).toBe(false);
  });

  it('fetches the image-links route with the abort signal and parses the body', async () => {
    const payload = {
      status: 'succeeded',
      error: null,
      addedCount: 2,
      links: [{ id: 'l1', label: 'x.test', url: 'https://x.test/p' }],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useArtistImageLinksQuery('artist 1'));
    const controller = new AbortController();

    const result = await optionsOf().queryFn({ signal: controller.signal });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/artists/artist%201/image-links',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('defaults a missing error to an Error instance', () => {
    const { result } = renderHook(() => useArtistImageLinksQuery('artist-1'));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});
