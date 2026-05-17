// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ChatMessageDto } from '@/lib/services/chat-service';

import { useOptimisticChat } from './use-optimistic-chat';

// useOptimisticChat now patches the chat infinite-query cache on
// updateMessage, so it needs a QueryClient in scope.
const buildWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
};

const makeMsg = (id: string, body: string, userId = 'user-1'): ChatMessageDto => ({
  id,
  body,
  reactions: [],
  createdAt: '2026-05-01T12:00:00Z',
  user: { id: userId, username: 'octo', gravatarHash: 'abc' },
});

describe('useOptimisticChat', () => {
  it('returns base messages on first render', () => {
    const base = [makeMsg('msg-1', 'hi')];
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: base }), {
      wrapper: buildWrapper(),
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-1']);
  });

  it('appends optimistic placeholders at the tail', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });
    act(() => {
      result.current.appendOptimistic({
        ...makeMsg('temp-id', 'hello'),
        tempId: 'tmp-1',
      });
    });
    expect(result.current.messages.map((m) => m.tempId)).toEqual(['tmp-1']);
  });

  it('drops a placeholder when the server echo carries the matching tempId (precise)', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' }));
    act(() => result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-1' }));

    // The optimistic placeholder (id 'temp-id') should be gone; the
    // server-persisted message ('msg-1') replaces it. The server echo
    // itself carries the same tempId for matching, so we check the id
    // collection rather than presence of the tempId field.
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-1']);
    expect(result.current.messages.some((m) => m.id === 'temp-id')).toBe(false);
  });

  it('does NOT drop a placeholder when the server echo carries a different tempId', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' }));
    // A second user sends the same body — echo has tempId 'tmp-other'.
    // Under tempId-precise matching, our placeholder must survive.
    act(() =>
      result.current.addReceivedMessage({ ...makeMsg('msg-1', 'hello'), tempId: 'tmp-other' })
    );

    expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(true);
  });

  it('drops the optimistic placeholder when the server echo matches user+body', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => {
      result.current.appendOptimistic({
        ...makeMsg('temp-id', 'hello'),
        tempId: 'tmp-1',
      });
    });
    act(() => {
      result.current.addReceivedMessage(makeMsg('msg-1', 'hello'));
    });

    const ids = result.current.messages.map((m) => m.id);
    expect(ids).toContain('msg-1');
    expect(result.current.messages.some((m) => m.tempId === 'tmp-1')).toBe(false);
  });

  it('keeps a failed placeholder around even after an echo lands', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

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

  it('removeByTempId clears the placeholder (used for retry/dismiss)', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('temp-id', 'hello'), tempId: 'tmp-1' }));
    act(() => result.current.removeByTempId('tmp-1'));

    expect(result.current.messages).toHaveLength(0);
  });

  it('ignores a Pusher echo whose id is already in the persisted history', () => {
    const base = [makeMsg('msg-1', 'persisted')];
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: base }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'persisted')));

    expect(result.current.messages.filter((m) => m.id === 'msg-1')).toHaveLength(1);
  });

  it('deduplicates duplicate live broadcasts of the same id', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));
    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));

    expect(result.current.messages.filter((m) => m.id === 'msg-1')).toHaveLength(1);
  });

  it('removeMessage drops a live message, a local optimistic placeholder, and patches the infinite-query cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(['chat', 'messages'], {
      pages: [{ messages: [makeMsg('persisted-1', 'historic')] }],
      pageParams: [null],
    });

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper,
    });

    act(() => result.current.addReceivedMessage(makeMsg('live-1', 'live')));
    act(() =>
      result.current.appendOptimistic({ ...makeMsg('local-1', 'local'), tempId: 'tmp-1' })
    );

    act(() => result.current.removeMessage('live-1'));
    act(() => result.current.removeMessage('local-1'));
    act(() => result.current.removeMessage('persisted-1'));

    expect(result.current.messages.some((m) => m.id === 'live-1')).toBe(false);
    expect(result.current.messages.some((m) => m.id === 'local-1')).toBe(false);
    const cached = client.getQueryData<{ pages: { messages: ChatMessageDto[] }[] }>([
      'chat',
      'messages',
    ]);
    expect(cached?.pages[0].messages.some((m) => m.id === 'persisted-1')).toBe(false);
  });

  it('removeMessage is a no-op when the id is not in any layer', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(['chat', 'messages'], {
      pages: [{ messages: [makeMsg('persisted-1', 'historic')] }],
      pageParams: [null],
    });

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper,
    });

    act(() => result.current.removeMessage('does-not-exist'));

    const cached = client.getQueryData<{ pages: { messages: ChatMessageDto[] }[] }>([
      'chat',
      'messages',
    ]);
    expect(cached?.pages[0].messages.map((m) => m.id)).toEqual(['persisted-1']);
  });

  it('updateMessage swaps a live message in place', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.addReceivedMessage(makeMsg('msg-1', 'hi')));
    act(() =>
      result.current.updateMessage({
        ...makeMsg('msg-1', 'hi'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const updated = result.current.messages.find((m) => m.id === 'msg-1');
    expect(updated?.reactions).toEqual([{ emoji: '🔥', userIds: ['user-2'] }]);
  });

  it('updateMessage patches a row inside the persisted infinite-query cache', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(['chat', 'messages'], {
      pages: [{ messages: [makeMsg('persisted-1', 'historic')] }],
      pageParams: [null],
    });

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('persisted-1', 'historic'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const cached = client.getQueryData<{ pages: { messages: ChatMessageDto[] }[] }>([
      'chat',
      'messages',
    ]);
    expect(cached?.pages[0].messages[0].reactions).toEqual([
      { emoji: '🔥', userIds: ['user-2'] },
    ]);
  });

  it('updateMessage leaves the cache untouched when no page contains the id', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

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
    expect(client.getQueryData(['chat', 'messages'])).toBe(initial);
  });

  it('updateMessage is a no-op when the infinite-query cache is empty', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    expect(() =>
      act(() => result.current.updateMessage(makeMsg('msg-1', 'hi')))
    ).not.toThrow();
  });

  it('markFailed only flips the matching placeholder when multiple are queued', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.appendOptimistic({ ...makeMsg('t1', 'a'), tempId: 'tmp-1' }));
    act(() => result.current.appendOptimistic({ ...makeMsg('t2', 'b'), tempId: 'tmp-2' }));
    act(() => result.current.markFailed('tmp-2'));

    expect(result.current.messages.find((m) => m.tempId === 'tmp-1')?.failed).toBeUndefined();
    expect(result.current.messages.find((m) => m.tempId === 'tmp-2')?.failed).toBe(true);
  });

  it('updateMessage skips live messages whose ids do not match', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
    });

    act(() => result.current.addReceivedMessage(makeMsg('keep-1', 'a')));
    act(() => result.current.addReceivedMessage(makeMsg('target', 'b')));

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'b'),
        reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
      })
    );

    const keep = result.current.messages.find((m) => m.id === 'keep-1');
    const updated = result.current.messages.find((m) => m.id === 'target');
    expect(keep?.reactions).toEqual([]);
    expect(updated?.reactions).toEqual([{ emoji: '🔥', userIds: ['user-2'] }]);
  });

  it('updateMessage leaves sibling messages in the same page untouched', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(['chat', 'messages'], {
      pages: [
        {
          messages: [makeMsg('sibling', 'a'), makeMsg('target', 'b')],
        },
      ],
      pageParams: [null],
    });

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'b'),
        reactions: [{ emoji: '🔥', userIds: ['x'] }],
      })
    );

    const cached = client.getQueryData<{ pages: { messages: ChatMessageDto[] }[] }>([
      'chat',
      'messages',
    ]);
    const [sibling, target] = cached?.pages[0].messages ?? [];
    expect(sibling?.reactions).toEqual([]);
    expect(target?.reactions).toEqual([{ emoji: '🔥', userIds: ['x'] }]);
  });

  it('updateMessage only patches pages that actually contain the updated id', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(['chat', 'messages'], {
      pages: [
        { messages: [makeMsg('other', 'historic')] },
        { messages: [makeMsg('target', 'historic')] },
      ],
      pageParams: [null, null],
    });

    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), { wrapper });

    act(() =>
      result.current.updateMessage({
        ...makeMsg('target', 'historic'),
        reactions: [{ emoji: '🔥', userIds: ['x'] }],
      })
    );

    const cached = client.getQueryData<{ pages: { messages: ChatMessageDto[] }[] }>([
      'chat',
      'messages',
    ]);
    expect(cached?.pages[0].messages[0].reactions).toEqual([]);
    expect(cached?.pages[1].messages[0].reactions).toEqual([{ emoji: '🔥', userIds: ['x'] }]);
  });

  it('reconcileEcho keeps a placeholder when the body differs even though the user matches', () => {
    const { result } = renderHook(() => useOptimisticChat({ baseMessages: [] }), {
      wrapper: buildWrapper(),
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
      wrapper: buildWrapper(),
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
