/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Pusher from 'pusher';

import { loggers } from '@/lib/utils/logger';

import {
  CHAT_CHANNEL,
  CHAT_EVENTS,
  getPusherServer,
  resetPusherServerForTesting,
  triggerChatEvent,
} from './pusher-server';

vi.mock('server-only', () => ({}));

const triggerMock = vi.fn();

vi.mock('pusher', () => {
  function PusherCtor(this: { trigger: typeof triggerMock }) {
    this.trigger = triggerMock;
  }
  return { default: vi.fn(PusherCtor) };
});

const PusherCtor = vi.mocked(Pusher);

describe('pusher-server', () => {
  beforeEach(() => {
    resetPusherServerForTesting();
    PusherCtor.mockClear();
    triggerMock.mockReset();
    vi.stubEnv('PUSHER_APP_ID', 'app-1');
    vi.stubEnv('PUSHER_KEY', 'key-1');
    vi.stubEnv('PUSHER_SECRET', 'secret-1');
    vi.stubEnv('PUSHER_CLUSTER', 'us2');
    vi.stubEnv('E2E_MODE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPusherServerForTesting();
  });

  it('exposes the presence channel name and event constants', () => {
    expect(CHAT_CHANNEL).toBe('presence-fake-four-chat');
    expect(CHAT_EVENTS.newMessage).toBe('new-message');
    expect(CHAT_EVENTS.reactionUpdated).toBe('reaction-updated');
  });

  it('constructs the Pusher client with env credentials and TLS', () => {
    getPusherServer();
    expect(PusherCtor).toHaveBeenCalledWith({
      appId: 'app-1',
      key: 'key-1',
      secret: 'secret-1',
      cluster: 'us2',
      useTLS: true,
    });
  });

  it('caches the singleton across calls', () => {
    getPusherServer();
    getPusherServer();
    expect(PusherCtor).toHaveBeenCalledTimes(1);
  });

  it('throws when any Pusher env var is missing', () => {
    vi.stubEnv('PUSHER_SECRET', '');
    expect(() => getPusherServer()).toThrow(/Pusher is not configured/);
  });

  describe('triggerChatEvent', () => {
    it('broadcasts on the chat channel with the given event name and payload', async () => {
      triggerMock.mockResolvedValue(undefined);

      await triggerChatEvent('new-message', { id: 'msg-1' });

      expect(triggerMock).toHaveBeenCalledWith(CHAT_CHANNEL, 'new-message', { id: 'msg-1' });
    });

    it('swallows trigger errors so persistence is not blocked by a Pusher outage', async () => {
      const errorSpy = vi.spyOn(loggers.chat, 'error').mockImplementation(() => {});
      triggerMock.mockRejectedValue(Error('upstream down'));

      await expect(triggerChatEvent('new-message', { id: 'msg-1' })).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('is a no-op in E2E_MODE so Pusher creds are not required for E2E', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await triggerChatEvent('new-message', { id: 'msg-1' });

      expect(triggerMock).not.toHaveBeenCalled();
    });

    it('logs and resolves when the trigger times out', async () => {
      vi.useFakeTimers();
      const errorSpy = vi.spyOn(loggers.chat, 'error').mockImplementation(() => {});
      // Never-resolving trigger forces the timeout path.
      triggerMock.mockImplementation(() => new Promise(() => undefined));

      const pending = triggerChatEvent('new-message', { id: 'msg-1' });
      await vi.advanceTimersByTimeAsync(3001);
      await expect(pending).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        'Pusher trigger failed',
        expect.objectContaining({ message: expect.stringContaining('timed out') }),
        { event: 'new-message' }
      );
      errorSpy.mockRestore();
      vi.useRealTimers();
    });
  });
});
