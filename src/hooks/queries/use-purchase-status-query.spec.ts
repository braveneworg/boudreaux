/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { usePurchaseStatusQuery } from './use-purchase-status-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe('usePurchaseStatusQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { confirmed: false },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query when the session id is null', () => {
    renderHook(() => usePurchaseStatusQuery('release-1', null));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('keeps the query disabled when the caller passes enabled false', () => {
    renderHook(() => usePurchaseStatusQuery('release-1', 'sess-1', { enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('uses the by-session purchase status query key', () => {
    renderHook(() => usePurchaseStatusQuery('release-1', 'sess-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[]; enabled: boolean };

    expect(options.queryKey).toEqual(['purchaseStatus', 'release-1', 'sess-1']);
    expect(options.enabled).toBe(true);
  });

  it('fetches and parses the purchase status on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ confirmed: true }) })
    );

    renderHook(() => usePurchaseStatusQuery('release-1', 'sess-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual({ confirmed: true });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/releases/release-1/purchase-status?sessionId=sess-1',
      { signal }
    );
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => usePurchaseStatusQuery('release-1', 'sess-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch purchase status');
  });
});
