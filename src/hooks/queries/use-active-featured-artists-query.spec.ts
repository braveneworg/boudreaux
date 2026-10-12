// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  SPOTLIGHT_LIMIT,
  useActiveFeaturedArtistsQuery,
} from './use-active-featured-artists-query';

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

interface ActiveOptions {
  queryKey: unknown[];
  enabled?: boolean;
  queryFn: (ctx: { signal?: AbortSignal }) => Promise<unknown>;
}

const getOptions = (options = {}): ActiveOptions => {
  useQueryMock.mockReturnValue({ isPending: true });
  renderHook(() => useActiveFeaturedArtistsQuery(options));
  return useQueryMock.mock.calls.at(-1)?.[0] as ActiveOptions;
};

beforeEach(() => {
  useQueryMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('useActiveFeaturedArtistsQuery', () => {
  it('caps the home grid at twelve spotlights', () => {
    expect(SPOTLIGHT_LIMIT).toBe(12);
  });

  it('keys the query under the active featured artists', () => {
    expect(getOptions().queryKey).toEqual(['featuredArtists', 'active']);
  });

  it('requests one grid of spotlights and forwards the signal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ featuredArtists: [], count: 0 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await getOptions().queryFn({ signal });

    expect(fetchMock.mock.calls).toEqual([
      ['/api/featured-artists?active=true&limit=12', { signal }],
    ]);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(getOptions().queryFn({})).rejects.toThrow('Failed to fetch featured artists');
  });

  it('lets the caller override options such as enabled', () => {
    expect(getOptions({ enabled: false }).enabled).toBe(false);
  });

  it('returns the query state', () => {
    useQueryMock.mockReturnValue({ isPending: false, data: { featuredArtists: [], count: 0 } });

    const { result } = renderHook(() => useActiveFeaturedArtistsQuery());

    expect(result.current.data).toEqual({ featuredArtists: [], count: 0 });
    expect(result.current.isPending).toBe(false);
  });
});
