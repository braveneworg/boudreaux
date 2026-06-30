// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { useSignupStatusQuery } from './use-signup-status-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

describe('useSignupStatusQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { paused: false },
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the signupStatus.status query key', () => {
    renderHook(() => useSignupStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as { queryKey: unknown[] };

    expect(options.queryKey).toEqual(['signupStatus', 'status']);
  });

  it('fetches /api/auth/signup-status with no-store cache mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ paused: false }),
      })
    );

    renderHook(() => useSignupStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual({ paused: false });
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup-status', {
      cache: 'no-store',
      signal,
    });
  });

  it('throws when the signup-status endpoint returns a failure response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useSignupStatusQuery());

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to fetch signup status');
  });

  it('forwards caller options (e.g. enabled) to useQuery', () => {
    renderHook(() => useSignupStatusQuery({ enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };

    expect(options.enabled).toBe(false);
  });

  it('returns paused data from the query', () => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: { paused: true },
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useSignupStatusQuery());

    expect(result.current.data).toEqual({ paused: true });
  });
});
