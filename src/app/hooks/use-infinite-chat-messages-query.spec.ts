// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { MAX_TOTAL_MESSAGES, useChatMessagesQuery } from './use-infinite-chat-messages-query';

const useInfiniteQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

const makeMsg = (id: string, createdAt: string) => ({
  id,
  body: id,
  reactions: [],
  createdAt,
  user: { id: 'u1', username: 'octo', gravatarHash: 'abc' },
});

beforeEach(() => useInfiniteQueryMock.mockReset());

describe('useChatMessagesQuery query config', () => {
  it('uses the chat messages query key and the dedicated fetcher', () => {
    useInfiniteQueryMock.mockReturnValue({ isPending: true });

    renderHook(() => useChatMessagesQuery());

    const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
      queryKey: unknown[];
      initialPageParam: unknown;
      queryFn: (ctx: { pageParam: unknown }) => unknown;
    };

    expect(opts.queryKey).toEqual(['chat', 'messages']);
    expect(opts.initialPageParam).toBeUndefined();
    expect(typeof opts.queryFn).toBe('function');
  });

  describe('queryFn', () => {
    it('fetches the first page without cursor params', async () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
        queryFn: (ctx: { pageParam: undefined }) => Promise<unknown>;
      };

      await opts.queryFn({ pageParam: undefined });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chat/messages?limit=20',
        expect.objectContaining({ cache: 'no-store' })
      );

      vi.unstubAllGlobals();
    });

    it('appends cursor params on subsequent pages', async () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
        queryFn: (ctx: { pageParam: unknown }) => Promise<unknown>;
      };

      await opts.queryFn({
        pageParam: { cursorCreatedAt: '2026-05-01T12:00:00.000Z', cursorId: 'cursor-1' },
      });

      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toContain('limit=20');
      expect(url).toContain('cursorCreatedAt=2026-05-01T12%3A00%3A00.000Z');
      expect(url).toContain('cursorId=cursor-1');

      vi.unstubAllGlobals();
    });

    it('throws when the response is not ok', async () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
        queryFn: (ctx: { pageParam: undefined }) => Promise<unknown>;
      };

      await expect(opts.queryFn({ pageParam: undefined })).rejects.toThrow(
        /Failed to load chat messages/
      );

      vi.unstubAllGlobals();
    });
  });

  describe('getNextPageParam', () => {
    it('returns undefined when the page is smaller than PAGE_SIZE', () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });

      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
        getNextPageParam: (page: { messages: unknown[] }) => unknown;
      };

      expect(
        opts.getNextPageParam({ messages: [makeMsg('a', '2026-05-01T00:00:00Z')] })
      ).toBeUndefined();
    });

    it('returns the oldest message as cursor when the page is full', () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });

      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as {
        getNextPageParam: (page: { messages: ReturnType<typeof makeMsg>[] }) => unknown;
      };

      const messages = Array.from({ length: 20 }, (_, i) =>
        makeMsg(`m-${i}`, new Date(2026, 0, i + 1).toISOString())
      );

      expect(opts.getNextPageParam({ messages })).toEqual({
        cursorCreatedAt: messages[0].createdAt,
        cursorId: messages[0].id,
      });
    });
  });

  describe('flattened output', () => {
    it('returns an empty list before the first fetch resolves', () => {
      useInfiniteQueryMock.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
      });

      const { result } = renderHook(() => useChatMessagesQuery());
      expect(result.current.messages).toEqual([]);
    });

    it('flattens pages oldest-first, with older pages preceding newer pages', () => {
      const newerPage = {
        messages: [
          makeMsg('newer-1', '2026-05-01T12:00:00Z'),
          makeMsg('newer-2', '2026-05-01T12:01:00Z'),
        ],
      };
      const olderPage = {
        messages: [
          makeMsg('older-1', '2026-04-01T12:00:00Z'),
          makeMsg('older-2', '2026-04-01T12:01:00Z'),
        ],
      };
      useInfiniteQueryMock.mockReturnValue({
        data: { pages: [newerPage, olderPage] },
        isPending: false,
        isError: false,
        hasNextPage: true,
        isFetchingNextPage: false,
      });

      const { result } = renderHook(() => useChatMessagesQuery());

      expect(result.current.messages.map((m) => m.id)).toEqual([
        'older-1',
        'older-2',
        'newer-1',
        'newer-2',
      ]);
    });

    it('reports hasNextPage=false once the cap is reached', () => {
      const flooded = Array.from({ length: MAX_TOTAL_MESSAGES }, (_, i) =>
        makeMsg(`m-${i}`, new Date(2026, 0, i + 1).toISOString())
      );
      useInfiniteQueryMock.mockReturnValue({
        data: { pages: [{ messages: flooded }] },
        isPending: false,
        isError: false,
        hasNextPage: true,
        isFetchingNextPage: false,
      });

      const { result } = renderHook(() => useChatMessagesQuery());
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('enabled flag', () => {
    it('defaults to enabled=true', () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });
      renderHook(() => useChatMessagesQuery());
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as { enabled: boolean };
      expect(opts.enabled).toBe(true);
    });

    it('forwards an explicit enabled=false', () => {
      useInfiniteQueryMock.mockReturnValue({ isPending: true });
      renderHook(() => useChatMessagesQuery({ enabled: false }));
      const opts = useInfiniteQueryMock.mock.calls[0]?.[0] as { enabled: boolean };
      expect(opts.enabled).toBe(false);
    });
  });
});
