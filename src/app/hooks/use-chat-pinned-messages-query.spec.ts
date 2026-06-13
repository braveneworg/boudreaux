// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { useChatPinnedMessagesQuery } from './use-chat-pinned-messages-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

beforeEach(() => {
  mockUseQuery.mockReturnValue({ data: undefined });
});

afterEach(() => vi.unstubAllGlobals());

describe('useChatPinnedMessagesQuery', () => {
  it('wires the query key, enabled flag, and cache settings', () => {
    renderHook(() => useChatPinnedMessagesQuery({ enabled: true }));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryKey: unknown[];
      enabled: boolean;
      staleTime: number;
      refetchOnWindowFocus: boolean;
    };
    expect(options.queryKey).toEqual(['chat', 'pinned']);
    expect(options.enabled).toBe(true);
    expect(options.staleTime).toBe(30_000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it('fetches /api/chat/pinned with no-store cache and returns the messages array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'msg-1' }] }),
      })
    );

    renderHook(() => useChatPinnedMessagesQuery({ enabled: true }));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual([{ id: 'msg-1' }]);
    expect(global.fetch).toHaveBeenCalledWith('/api/chat/pinned', { cache: 'no-store', signal });
  });

  it('throws when the endpoint returns a failure response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useChatPinnedMessagesQuery({ enabled: true }));

    const options = mockUseQuery.mock.calls[0]?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow('Failed to load pinned messages');
  });
});
