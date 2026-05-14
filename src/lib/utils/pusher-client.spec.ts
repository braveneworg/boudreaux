/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Pusher from 'pusher-js';

import { disconnectPusherClient, getPusherClient } from './pusher-client';

const disconnectMock = vi.fn();

vi.mock('pusher-js', () => {
  function PusherCtor(this: { disconnect: typeof disconnectMock }) {
    this.disconnect = disconnectMock;
  }
  return { default: vi.fn(PusherCtor) };
});

const PusherCtor = vi.mocked(Pusher);

beforeEach(() => {
  disconnectPusherClient();
  PusherCtor.mockClear();
  disconnectMock.mockClear();
  vi.stubEnv('NEXT_PUBLIC_PUSHER_KEY', 'public-key');
  vi.stubEnv('NEXT_PUBLIC_PUSHER_CLUSTER', 'us2');
  vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  disconnectPusherClient();
});

describe('getPusherClient', () => {
  it('constructs the Pusher client with the public env credentials, TLS, and auth endpoint', () => {
    getPusherClient();
    expect(PusherCtor).toHaveBeenCalledWith('public-key', {
      cluster: 'us2',
      authEndpoint: '/api/chat/pusher-auth',
      forceTLS: true,
    });
  });

  it('reuses the singleton across calls', () => {
    getPusherClient();
    getPusherClient();
    getPusherClient();
    expect(PusherCtor).toHaveBeenCalledTimes(1);
  });

  it('throws when NEXT_PUBLIC_PUSHER_KEY is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_PUSHER_KEY', '');
    expect(() => getPusherClient()).toThrow(/Pusher client is not configured/);
  });

  it('throws when NEXT_PUBLIC_PUSHER_CLUSTER is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_PUSHER_CLUSTER', '');
    expect(() => getPusherClient()).toThrow(/Pusher client is not configured/);
  });

  it('returns a no-op stand-in client in E2E mode without constructing real Pusher', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');

    const client = getPusherClient();

    expect(PusherCtor).not.toHaveBeenCalled();
    const channel = client.subscribe('presence-fake-four-chat');
    expect(() => channel.bind('x', () => undefined)).not.toThrow();
    expect(() => channel.unbind('x', () => undefined)).not.toThrow();
    expect(() => channel.trigger('y', {})).not.toThrow();
    expect(() => client.unsubscribe('presence-fake-four-chat')).not.toThrow();
    expect(() => client.disconnect()).not.toThrow();
  });
});

describe('disconnectPusherClient', () => {
  it('calls disconnect on the cached client and clears the cache', () => {
    getPusherClient();

    disconnectPusherClient();

    expect(disconnectMock).toHaveBeenCalledTimes(1);

    getPusherClient();
    expect(PusherCtor).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when no client has been constructed', () => {
    disconnectPusherClient();
    expect(disconnectMock).not.toHaveBeenCalled();
  });
});
