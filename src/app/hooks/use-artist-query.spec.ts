/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useArtistQuery } from './use-artist-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const artistResponse = {
  id: 'artist-1',
  firstName: 'Jane',
  middleName: null,
  surname: 'Doe',
  akaNames: null,
  displayName: null,
  title: null,
  suffix: null,
  phone: null,
  email: null,
  address1: null,
  address2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  bio: null,
  shortBio: null,
  altBio: null,
  bioGeneratedAt: null,
  bioModel: null,
  bioStatus: null,
  bioError: null,
  bioStartedAt: null,
  slug: 'jane-doe',
  genres: null,
  bornOn: null,
  diedOn: null,
  formedOn: null,
  publishedOn: null,
  publishedBy: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: null,
  updatedAt: null,
  updatedBy: null,
  deletedOn: null,
  deletedBy: null,
  deactivatedAt: null,
  deactivatedBy: null,
  reactivatedAt: null,
  reactivatedBy: null,
  notes: [],
  tags: null,
  isPseudonymous: false,
  isActive: true,
  instruments: null,
  featuredArtistId: null,
  images: [],
};

describe('useArtistQuery', () => {
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

  it('disables the query when no artist id is provided', () => {
    renderHook(() => useArtistQuery(''));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      enabled: boolean;
      queryKey: unknown[];
    };

    expect(options.enabled).toBe(false);
  });

  it('uses the artist detail query key', () => {
    renderHook(() => useArtistQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['artists', 'detail', 'artist-1']);
  });

  it('fetches and parses the artist on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => artistResponse })
    );

    renderHook(() => useArtistQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();
    const result = (await options.queryFn({ signal })) as { id: string };

    expect(result.id).toBe('artist-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/artists/artist-1', { signal });
  });

  it('returns null when the artist is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useArtistQuery('missing'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useArtistQuery('artist-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch artist');
  });

  it('defaults the error to a generic Error when the query reports none', () => {
    const { result } = renderHook(() => useArtistQuery('artist-1'));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Unknown error');
  });
});
