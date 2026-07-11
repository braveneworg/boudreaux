// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ChatMessageDto } from '@/lib/services/chat-service';

import { useOptimisticChat } from './use-optimistic-chat';

interface CachedPages {
  pages: { messages: ChatMessageDto[] }[];
  pageParams: unknown[];
}

// useOptimisticChat writes received echoes, reaction updates, and
// deletions into the chat infinite-query cache, so every render needs a
// QueryClient the test can also read back from.
const buildHarness = (): {
  client: QueryClient;
  wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;
} => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
};

const makeMsg = (id: string, body: string, userId = 'user-1'): ChatMessageDto => ({
  id,
  body,
  reactions: [],
  createdAt: '2026-05-01T12:00:00Z',
  user: { id: userId, username: 'octo', gravatarHash: 'abc' },
});

/** Seed the infinite-query cache with one page per inner array (newest page first). */
const seedPages = (client: QueryClient, pages: ChatMessageDto[][]): void => {
  client.setQueryData(['chat', 'messages'], {
    pages: pages.map((messages) => ({ messages })),
    pageParams: pages.map(() => null),
  });
};

const getCached = (client: QueryClient): CachedPages | undefined =>
  client.getQueryData<CachedPages>(['chat', 'messages']);

describe('useOptimisticChat', () => {
  it('returns base messages on first render', () => {
    const base = [makeMsg('msg-1', 'hi')];
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: base }), {
      wrapper: buildHarness().wrapper,
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-1']);
  });

  it('appends optimistic placeholders at the tail', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });
    act(() => {
      result.current.appendOptimistic({
        ...makeMsg('temp-id', 'hello'),
        tempId: 'tmp-1',
      });
    });
    expect(result.current.messages.map((m) => m.tempId)).toEqual(['tmp-1']);
  });

  describe('addReceivedMessage → cache append', () => {
    it('drops the placeholder and appends the tempId-matched echo to the newest page tail', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[makeMsg('persisted-1', 'historic')]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() =>
        result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' })
      );
      act(() =>
        result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-1' })
      );

      // Placeholder reconciled away; persisted echo lives in the cache.
      expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(false);
      const cached = getCached(client);
      expect(cached?.pages[0].messages.map((m) => m.id)).toEqual(['persisted-1', 'msg-1']);
    });

    it('strips the client tempId from the cached copy', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() =>
        result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-1' })
      );

      const cached = getCached(client);
      expect(cached?.pages[0].messages[0].id).toBe('msg-1');
      expect(cached?.pages[0].messages[0].tempId).toBeUndefined();
    });

    it('does NOT drop a placeholder when the server echo carries a different tempId', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() =>
        result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' })
      );
      // A second user sends the same body — echo has tempId 'tmp-other'.
      // Under tempId-precise matching, our placeholder must survive.
      act(() =>
        result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-other' })
      );

      expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(true);
      expect(getCached(client)?.pages[0].messages.map((m) => m.id)).toEqual(['msg-1']);
    });

    it('drops the optimistic placeholder when the server echo matches user+body', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => {
        result.current.appendOptimistic({
          ...makeMsg('temp-id', 'hello'),
          tempId: 'tmp-1',
        });
      });
      act(() => {
        result.current.addReceivedMessage(makeMsg('msg-1', 'hello'));
      });

      expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(false);
      expect(getCached(client)?.pages[0].messages.map((m) => m.id)).toEqual(['msg-1']);
    });

    it('keeps a failed placeholder around even after an echo lands', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => {
        result.current.appendOptimistic({
          ...makeMsg('temp-id', 'hello'),
          tempId: 'tmp-1',
        });
      });
      act(() => result.current.markFailed('tmp-1'));
      act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hello')));

      expect(result.current.messages.some((m) => m.tempId === 'tmp-1' && m.failed)).toBe(true);
    });

    it('leaves the cache untouched (same reference) when the id exists in an older page', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[makeMsg('newest-1', 'a')], [makeMsg('older-1', 'b')]]);
      const before = getCached(client);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => result.current.addReceivedMessage(makeMsg('older-1', 'b')));

      expect(getCached(client)).toBe(before);
    });

    it('deduplicates duplicate live broadcasts of the same id', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[]]);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));
      act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));

      expect(getCached(client)?.pages[0].messages.filter((m) => m.id === 'msg-1')).toHaveLength(1);
    });

    it('is safe (and still reconciles) when the cache is empty', () => {
      const { client, wrapper } = buildHarness();
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() =>
        result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' })
      );
      expect(() =>
        act(() =>
          result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-1' })
        )
      ).not.toThrow();

      expect(getCached(client)).toBeUndefined();
      expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(false);
    });

    it('leaves a pageless cache entry untouched (same reference)', () => {
      const { client, wrapper } = buildHarness();
      client.setQueryData(['chat', 'messages'], { pages: [], pageParams: [] });
      const before = getCached(client);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));

      expect(getCached(client)).toBe(before);
    });

    it('appends to the end of the newest page and leaves older pages by reference', () => {
      const { client, wrapper } = buildHarness();
      seedPages(client, [[makeMsg('new-1', 'a'), makeMsg('new-2', 'b')], [makeMsg('old-1', 'z')]]);
      const before = getCached(client);
      const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

      act(() => result.current.addReceivedMessage(makeMsg('msg-3', 'c')));

      const cached = getCached(client);
      expect(cached?.pages[0].messages.map((m) => m.id)).toEqual(['new-1', 'new-2', 'msg-3']);
      expect(cached).not.toBe(before);
      expect(cached?.pages[0]).not.toBe(before?.pages[0]);
      expect(cached?.pages[1]).toBe(before?.pages[1]);
      expect(cached?.pageParams).toBe(before?.pageParams);
    });
  });

  it('removeByTempId clears the placeholder (used for retry/dismiss)', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' }));
    act(() => result.current.removeByTempId('tmp-1'));

    expect(result.current.messages).toHaveLength(0);
  });

  it('removeMessage drops appended, local, and historic rows across layers', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[makeMsg('persisted-1', 'historic')]]);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() => result.current.addReceivedMessage(makeMsg('live-1', 'live')));
    act(() => result.current.appendOptimistic({ ...makeMsg('local-1', 'local'), tempId: 'tmp-1' }));

    act(() => result.current.removeMessage('live-1'));
    act(() => result.current.removeMessage('local-1'));
    act(() => result.current.removeMessage('persisted-1'));

    expect(result.current.messages.some((m) => m.id === 'local-1')).toBe(false);
    expect(getCached(client)?.pages[0].messages).toEqual([]);
  });

  it('removeMessage is a no-op when the id is not in any layer', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[makeMsg('persisted-1', 'historic')]]);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() => result.current.removeMessage('does-not-exist'));

    expect(getCached(client)?.pages[0].messages.map((m) => m.id)).toEqual(['persisted-1']);
  });

  it('updateMessage patches a previously appended echo in the cache', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[]]);
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));
    act(() =>
      result.current.updateMessage({
        ...makeMsg('msg-1', 'hi'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const updated = getCached(client)?.pages[0].messages.find((m) => m.id === 'msg-1');
    expect(updated?.reactions).toEqual([{ emoji: '🔥', userIds: ['user-2'] }]);
  });

  it('updateMessage patches a row inside the persisted infinite-query cache', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[makeMsg('persisted-1', 'historic')]]);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('persisted-1', 'historic'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const cached = getCached(client);
    expect(cached?.pages[0].messages[0].reactions).toEqual([{ emoji: '🔥', userIds: ['user-2'] }]);
  });

  it('updateMessage leaves the cache untouched when no page contains the id', () => {
    const { client, wrapper } = buildHarness();
    const initial = {
      pages: [{ messages: [makeMsg('persisted-1', 'historic')] }],
      pageParams: [null],
    };
    client.setQueryData(['chat', 'messages'], initial);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('elsewhere', 'historic'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    // Same reference returned when `changed` stays false.
    expect(getCached(client)).toBe(initial);
  });

  it('updateMessage is a no-op when the infinite-query cache is empty', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });

    expect(() => act(() => result.current.updateMessage(makeMsg('msg-1', 'hi')))).not.toThrow();
  });

  it('markFailed only flips the matching placeholder when multiple are queued', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('t1', 'a'), tempId: 'tmp-1' }));
    act(() => result.current.appendOptimistic({ ...makeMsg('t2', 'b'), tempId: 'tmp-2' }));
    act(() => result.current.markFailed('tmp-2'));

    expect(result.current.messages.find((m) => m.tempId === 'tmp-1')?.failed).toBeUndefined();
    expect(result.current.messages.find((m) => m.tempId === 'tmp-2')?.failed).toBe(true);
  });

  it('updateMessage leaves other appended echoes untouched', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[]]);
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() => result.current.addReceivedMessage(makeMsg('keep-1', 'a')));
    act(() => result.current.addReceivedMessage(makeMsg('target', 'b')));

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'b'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const cached = getCached(client);
    const keep = cached?.pages[0].messages.find((m) => m.id === 'keep-1');
    const updated = cached?.pages[0].messages.find((m) => m.id === 'target');
    expect(keep?.reactions).toEqual([]);
    expect(updated?.reactions).toEqual([{ emoji: '🔥', userIds: ['user-2'] }]);
  });

  it('updateMessage leaves sibling messages in the same page untouched', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[makeMsg('sibling', 'a'), makeMsg('target', 'b')]]);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'b'),
        reactions: [{ emoji: '🔥', userIds: ['x'] }],
      })
    );

    const [sibling, target] = getCached(client)?.pages[0].messages ?? [];
    expect(sibling?.reactions).toEqual([]);
    expect(target?.reactions).toEqual([{ emoji: '🔥', userIds: ['x'] }]);
  });

  it('updateMessage only patches pages that actually contain the updated id', () => {
    const { client, wrapper } = buildHarness();
    seedPages(client, [[makeMsg('other', 'historic')], [makeMsg('target', 'historic')]]);

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'historic'),
        reactions: [{ emoji: '🔥', userIds: ['x'] }],
      })
    );

    const cached = getCached(client);
    expect(cached?.pages[0].messages[0].reactions).toEqual([]);
    expect(cached?.pages[1].messages[0].reactions).toEqual([{ emoji: '🔥', userIds: ['x'] }]);
  });

  it('reconcileEcho keeps a placeholder when the body differs even though the user matches', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });

    act(() =>
      result.current.appendOptimistic({
        ...makeMsg('temp-id', 'pending body', 'user-1'),
        tempId: 'tmp-1',
      })
    );
    // Echo from same user but different body — placeholder must survive.
    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'different body', 'user-1')));

    expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(true);
  });

  it('reconcileEcho keeps a placeholder when the echo carries no tempId and differs by user', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildHarness().wrapper,
    });

    act(() =>
      result.current.appendOptimistic({
        ...makeMsg('temp-id', 'hello', 'user-1'),
        tempId: 'tmp-1',
      })
    );
    // Server echo: different author, no tempId — should not drop the placeholder.
    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hello', 'user-2')));

    expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(true);
  });
});
