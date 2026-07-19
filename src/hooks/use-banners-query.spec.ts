/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useBannersQuery } from './use-banners-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe('useBannersQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { banners: [], rotationInterval: 5 },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries the active-banners key', () => {
    renderHook(() => useBannersQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };
    expect(options.queryKey).toEqual(['banners', 'active']);
  });

  it('fetches the active banners from the notification-banners endpoint', async () => {
    const payload = {
      banners: [{ slotNumber: 1, imageFilename: 'one.webp', notification: null }],
      rotationInterval: 6,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));

    renderHook(() => useBannersQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api/notification-banners', { signal });
  });

  it('throws when the endpoint returns a failure response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useBannersQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch banners');
  });

  it('passes through the query data and refetch from the underlying query', () => {
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue({
      isPending: true,
      error: undefined,
      data: { banners: [], rotationInterval: 9 },
      refetch,
    });

    const { result } = renderHook(() => useBannersQuery());

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toEqual({ banners: [], rotationInterval: 9 });
    expect(result.current.refetch).toBe(refetch);
  });

  it('defaults the error to a generic Error when the query reports none', () => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: undefined,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useBannersQuery());

    const { error } = result.current;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('Unknown error');
  });

  it('surfaces the underlying query error when one is present', () => {
    const queryError = Error('boom');
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: queryError,
      data: undefined,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useBannersQuery());

    expect(result.current.error).toBe(queryError);
  });
});
