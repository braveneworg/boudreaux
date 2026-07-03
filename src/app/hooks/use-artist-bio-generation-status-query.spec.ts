/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useArtistBioGenerationStatusQuery } from './use-artist-bio-generation-status-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  refetchInterval: (query: { state: { data?: { status?: string | null } } }) => number | false;
}

describe('useArtistBioGenerationStatusQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { status: 'processing', error: null, content: null },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the artist bio-generation query key', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.queryKey).toEqual(['artists', 'bioGeneration', 'artist-1']);
  });

  it('enables the query by default for a non-empty artist id', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(true);
  });

  it('disables the query when the artist id is empty', () => {
    renderHook(() => useArtistBioGenerationStatusQuery(''));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('keeps the query disabled when the caller passes enabled false', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1', { enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('defaults the returned error when the query has none', () => {
    const { result } = renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    expect(result.current.error).toEqual(Error('Unknown error'));
  });

  it('fetches and parses the status on a 200 response', async () => {
    const payload = { status: 'succeeded', error: null, content: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));

    renderHook(() => useArtistBioGenerationStatusQuery('artist 1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api/artists/artist%201/bio-generation', { signal });
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow(
      'Failed to fetch bio generation status'
    );
  });

  it('stops polling once the job reaches a terminal state', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'succeeded' } } })).toBe(false);
  });

  it('keeps polling on the configured interval while the job is in progress', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'processing' } } })).toBe(2500);
  });

  it('does not poll when the artist has never generated (status null)', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: null } } })).toBe(false);
  });

  it('does not poll before any status data is fetched', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: {} })).toBe(false);
  });

  it('polls on the configured interval while the job is pending', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'pending' } } })).toBe(2500);
  });

  it('stops polling once the job has failed', () => {
    renderHook(() => useArtistBioGenerationStatusQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'failed' } } })).toBe(false);
  });
});
