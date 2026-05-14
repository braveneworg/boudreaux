// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import { getPusherClient } from '@/lib/utils/pusher-client';

import {
  CHAT_CHANNEL_NAME,
  CLIENT_TYPING_EVENT,
  SERVER_NEW_MESSAGE,
  SERVER_REACTION_UPDATED,
  useChatChannel,
} from './use-chat-channel';

interface ChannelHandler<T = unknown> {
  (payload: T): void;
}

interface FakeChannel {
  bind: (event: string, handler: ChannelHandler) => void;
  unbind: (event: string, handler: ChannelHandler) => void;
  trigger: (event: string, payload: unknown) => void;
  handlers: Map<string, Set<ChannelHandler>>;
  fire: (event: string, payload: unknown) => void;
}

interface FakeClient {
  subscribe: (channelName: string) => FakeChannel;
  unsubscribe: (channelName: string) => void;
  channels: Map<string, FakeChannel>;
  triggerMock: ReturnType<typeof vi.fn<(event: string, payload: unknown) => void>>;
}

const createFakeChannel = (
  triggerMock: ReturnType<typeof vi.fn<(event: string, payload: unknown) => void>>
): FakeChannel => {
  const handlers = new Map<string, Set<ChannelHandler>>();
  return {
    handlers,
    bind: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
    },
    unbind: (event, handler) => {
      handlers.get(event)?.delete(handler);
    },
    trigger: (event, payload) => triggerMock(event, payload),
    fire: (event, payload) => {
      handlers.get(event)?.forEach((cb) => cb(payload));
    },
  };
};

const fakeClient: FakeClient = (() => {
  const channels = new Map<string, FakeChannel>();
  const triggerMock = vi.fn();
  return {
    channels,
    triggerMock,
    subscribe: (channelName) => {
      const channel = createFakeChannel(triggerMock);
      channels.set(channelName, channel);
      return channel;
    },
    unsubscribe: (channelName) => {
      channels.delete(channelName);
    },
  };
})();

vi.mock('@/lib/utils/pusher-client', () => ({
  getPusherClient: vi.fn(() => fakeClient),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fakeClient.channels.clear();
  fakeClient.triggerMock.mockReset();
  vi.mocked(getPusherClient).mockReturnValue(fakeClient as unknown as never);
});

const fireSucceeded = (
  members: { id: string; info: { username: string; gravatarHash: string } }[]
) => {
  const channel = fakeClient.channels.get(CHAT_CHANNEL_NAME);
  channel?.fire('pusher:subscription_succeeded', {
    count: members.length,
    me: members[0] ?? null,
    each: (cb: (m: unknown) => void) => members.forEach(cb),
  });
};

describe('useChatChannel', () => {
  it('does not subscribe when disabled', () => {
    renderHook(() => useChatChannel({ enabled: false }));
    expect(getPusherClient).not.toHaveBeenCalled();
    expect(fakeClient.channels.size).toBe(0);
  });

  it('subscribes to the chat presence channel when enabled', () => {
    renderHook(() => useChatChannel({ enabled: true }));
    expect(fakeClient.channels.has(CHAT_CHANNEL_NAME)).toBe(true);
  });

  it('populates members from pusher:subscription_succeeded', () => {
    const { result } = renderHook(() => useChatChannel({ enabled: true }));

    act(() =>
      fireSucceeded([
        { id: 'user-1', info: { username: 'octo', gravatarHash: 'a' } },
        { id: 'user-2', info: { username: 'cat', gravatarHash: 'b' } },
      ])
    );

    expect(result.current.members.map((m) => m.id)).toEqual(['user-1', 'user-2']);
  });

  it('adds members on pusher:member_added without duplicating existing ids', () => {
    const { result } = renderHook(() => useChatChannel({ enabled: true }));
    act(() => fireSucceeded([{ id: 'user-1', info: { username: 'octo', gravatarHash: 'a' } }]));

    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire('pusher:member_added', {
        id: 'user-2',
        info: { username: 'cat', gravatarHash: 'b' },
      });
    });
    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire('pusher:member_added', {
        id: 'user-2',
        info: { username: 'cat', gravatarHash: 'b' },
      });
    });

    expect(result.current.members.map((m) => m.id)).toEqual(['user-1', 'user-2']);
  });

  it('removes members on pusher:member_removed', () => {
    const { result } = renderHook(() => useChatChannel({ enabled: true }));
    act(() =>
      fireSucceeded([
        { id: 'user-1', info: { username: 'octo', gravatarHash: 'a' } },
        { id: 'user-2', info: { username: 'cat', gravatarHash: 'b' } },
      ])
    );

    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire('pusher:member_removed', { id: 'user-1' });
    });

    expect(result.current.members.map((m) => m.id)).toEqual(['user-2']);
  });

  it('invokes onNewMessage when a new-message event arrives', () => {
    const onNewMessage = vi.fn();
    renderHook(() => useChatChannel({ enabled: true, onNewMessage }));

    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire(SERVER_NEW_MESSAGE, { id: 'msg-1' });
    });

    expect(onNewMessage).toHaveBeenCalledWith({ id: 'msg-1' });
  });

  it('invokes onReactionUpdated when a reaction-updated event arrives', () => {
    const onReactionUpdated = vi.fn();
    renderHook(() => useChatChannel({ enabled: true, onReactionUpdated }));

    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire(SERVER_REACTION_UPDATED, { id: 'msg-1' });
    });

    expect(onReactionUpdated).toHaveBeenCalledWith({ id: 'msg-1' });
  });

  it('forwards client-typing events to onTyping', () => {
    const onTyping = vi.fn();
    renderHook(() => useChatChannel({ enabled: true, onTyping }));

    act(() => {
      fakeClient.channels
        .get(CHAT_CHANNEL_NAME)
        ?.fire(CLIENT_TYPING_EVENT, { userId: 'user-2', username: 'cat' });
    });

    expect(onTyping).toHaveBeenCalledWith({ userId: 'user-2', username: 'cat' });
  });

  it('uses the latest callback prop without re-binding handlers', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useChatChannel({ enabled: true, onNewMessage: cb }),
      {
        initialProps: { cb: first },
      }
    );

    rerender({ cb: second });

    act(() => {
      fakeClient.channels.get(CHAT_CHANNEL_NAME)?.fire(SERVER_NEW_MESSAGE, { id: 'msg-1' });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: 'msg-1' });
  });

  it('unsubscribes from the channel on unmount', () => {
    const { unmount } = renderHook(() => useChatChannel({ enabled: true }));
    expect(fakeClient.channels.has(CHAT_CHANNEL_NAME)).toBe(true);

    unmount();

    expect(fakeClient.channels.has(CHAT_CHANNEL_NAME)).toBe(false);
  });

  describe('sendTyping', () => {
    it('broadcasts client-typing the first time it is called', () => {
      const { result } = renderHook(() => useChatChannel({ enabled: true }));

      act(() => {
        result.current.sendTyping({ userId: 'user-1', username: 'octo' });
      });

      expect(fakeClient.triggerMock).toHaveBeenCalledWith(CLIENT_TYPING_EVENT, {
        userId: 'user-1',
        username: 'octo',
      });
    });

    it('throttles repeat calls within the 1.5s window', () => {
      const { result } = renderHook(() => useChatChannel({ enabled: true }));

      act(() => {
        result.current.sendTyping({ userId: 'user-1', username: 'octo' });
        result.current.sendTyping({ userId: 'user-1', username: 'octo' });
        result.current.sendTyping({ userId: 'user-1', username: 'octo' });
      });

      expect(fakeClient.triggerMock).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the channel is not yet subscribed', () => {
      const { result } = renderHook(() => useChatChannel({ enabled: false }));

      act(() => result.current.sendTyping({ userId: 'user-1', username: 'octo' }));

      expect(fakeClient.triggerMock).not.toHaveBeenCalled();
    });
  });
});
