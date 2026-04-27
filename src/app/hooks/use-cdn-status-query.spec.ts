/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useCdnStatusQuery } from './use-cdn-status-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe('useCdnStatusQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { status: 'ready', message: 'ok' },
      refetch: vi.fn(),
    });
  });

  it('uses polling while invalidation is in progress', () => {
    renderHook(() => useCdnStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryKey: unknown[];
      refetchInterval: (query: { state: { data?: { status?: string } } }) => number | false;
    };

    expect(options.queryKey).toEqual(['cdn', 'status']);
    expect(options.refetchInterval({ state: { data: { status: 'invalidating' } } })).toBe(30000);
    expect(options.refetchInterval({ state: { data: { status: 'ready' } } })).toBe(false);
    expect(options.refetchInterval({ state: {} })).toBe(false);
  });

  it('fetches CDN status with no-store cache mode', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', message: 'done' }),
    }) as unknown as typeof fetch;

    renderHook(() => useCdnStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: () => Promise<unknown>;
    };

    await expect(options.queryFn()).resolves.toEqual({ status: 'ready', message: 'done' });
    expect(global.fetch).toHaveBeenCalledWith('/api/cdn-status', { cache: 'no-store' });
  });

  it('throws when status endpoint returns a failure response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    renderHook(() => useCdnStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: () => Promise<unknown>;
    };

    await expect(options.queryFn()).rejects.toThrow('Failed to fetch CDN status');
  });
});
