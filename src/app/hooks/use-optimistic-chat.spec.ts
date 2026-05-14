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
});
