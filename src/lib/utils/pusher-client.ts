/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Pusher from 'pusher-js';

let cachedClient: Pusher | null = null;

/**
 * Lightweight no-op stand-in for the Pusher client used in E2E. The
 * presence channel never receives events, member rosters stay empty,
 * and `trigger` is a no-op — the UI still functions for single-page
 * tests without needing real Pusher credentials.
 */
const buildNoopPusher = (): Pusher => {
  const noopChannel = {
    bind: () => undefined,
    unbind: () => undefined,
    trigger: () => undefined,
  };
  return {
    subscribe: () => noopChannel,
    unsubscribe: () => undefined,
    disconnect: () => undefined,
  } as unknown as Pusher;
};

/**
 * Lazy singleton Pusher browser client. Reused across drawer mount/unmount
 * cycles in the same tab so we don't burn through the free-tier
 * concurrent-connection quota on hot reloads or re-opens.
 *
 * Throws if NEXT_PUBLIC_PUSHER_KEY/_CLUSTER are not set; callers should
 * gate construction behind an authenticated session so anonymous visitors
 * never open a socket.
 */
export const getPusherClient = (): Pusher => {
  if (cachedClient) return cachedClient;

  if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
    cachedClient = buildNoopPusher();
    return cachedClient;
  }

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    throw Error(
      'Pusher client is not configured. Set NEXT_PUBLIC_PUSHER_KEY and NEXT_PUBLIC_PUSHER_CLUSTER.'
    );
  }

  cachedClient = new Pusher(key, {
    cluster,
    authEndpoint: '/api/chat/pusher-auth',
    forceTLS: true,
  });

  return cachedClient;
};

/**
 * Tear down the singleton. Used when the user signs out (so the next
 * authenticated session re-authorises via /api/chat/pusher-auth) and in
 * tests.
 */
export const disconnectPusherClient = (): void => {
  if (cachedClient) {
    cachedClient.disconnect();
    cachedClient = null;
  }
};
