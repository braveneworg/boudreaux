/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import Pusher from 'pusher';

/** Single presence channel used for the global Fake Four Inc. chat. */
export const CHAT_CHANNEL = 'presence-fake-four-chat';

/** Wire-format event names broadcast on the channel. */
export const CHAT_EVENTS = {
  newMessage: 'new-message',
  reactionUpdated: 'reaction-updated',
  messageDeleted: 'message-deleted',
} as const;

let cachedPusher: Pusher | null = null;

/**
 * Singleton accessor for the server-side Pusher SDK. Lazy-initialized so
 * a missing config in build/test environments does not crash module load.
 */
export function getPusherServer(): Pusher {
  if (cachedPusher) return cachedPusher;

  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;

  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    throw Error(
      'Pusher is not configured. Set PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER.'
    );
  }

  cachedPusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return cachedPusher;
}

/**
 * Hard ceiling on how long we wait for Pusher's REST API before giving
 * up. The Node SDK has no built-in timeout, so a misconfigured cluster
 * (DNS failure) or a Pusher incident would otherwise stall the calling
 * Server Action indefinitely and the sender's optimistic placeholder
 * would spin forever. The message is already persisted by the time we
 * get here — broadcasting is best-effort.
 */
const PUSHER_TRIGGER_TIMEOUT_MS = 3000;

/**
 * Broadcast an event on the chat channel. Wraps trigger errors so a
 * Pusher outage cannot crash the calling Server Action — the message
 * is still persisted; clients will see it on the next fetch.
 */
export async function triggerChatEvent(event: string, payload: unknown): Promise<void> {
  // E2E web server doesn't have Pusher credentials. Persistence still
  // happens; we just skip the broadcast so the unit-tested paths work
  // end-to-end without requiring real Pusher infra.
  if (process.env.E2E_MODE === 'true') return;
  try {
    await Promise.race([
      getPusherServer().trigger(CHAT_CHANNEL, event, payload),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Error(`Pusher trigger timed out after ${PUSHER_TRIGGER_TIMEOUT_MS}ms`)),
          PUSHER_TRIGGER_TIMEOUT_MS
        )
      ),
    ]);
  } catch (error) {
    console.error('Pusher trigger failed', { event, error });
  }
}

/** Reset the singleton — testing aid only. */
export function resetPusherServerForTesting(): void {
  cachedPusher = null;
}
