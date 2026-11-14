/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHmac } from 'node:crypto';

import { truncateIp } from '@/lib/utils/visitor-fingerprint';

/**
 * The two keys a view is counted by (ADR-0029). The view key is what is
 * stored: it makes a second opening on the same day a duplicate without
 * recording who opened anything. The address key is never stored: it is
 * handed to the daily allowance that bounds a guest's views.
 */

/** Who a view is counted for: an account, or a guest by visitor id. */
export interface ViewerRef {
  kind: 'user' | 'guest';
  id: string;
}

export interface ViewKeyInput {
  submissionId: string;
  viewer: ViewerRef;
  /** The UTC day, as `YYYY-MM-DD`. */
  day: string;
  /** The server's secret the key is made under ({@link resolveViewKeySecret}). */
  secret: string;
}

/**
 * What the HMAC is told it is keying, so a view key can never equal another
 * value the same secret signs (the Turnstile gate cookie signs a timestamp).
 */
const VIEW_KEY_LABEL = 'submission-view';

/**
 * The secret a view key is made under. better-auth's own `AUTH_SECRET` is
 * reused, as the Turnstile gate does, so there is one secret to rotate;
 * `auth.ts` already refuses to boot without it. It throws when there is
 * none: a view stored under an unkeyed hash would name its viewer to anyone
 * who holds the database.
 *
 * A rotation changes every key from then on. The only effect is that a
 * viewer already counted that day can be counted once more.
 */
export const resolveViewKeySecret = (): string => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to key a view');
  }

  return secret;
};

/**
 * The key one viewer's view of one submission on one UTC day is stored
 * under: an HMAC-SHA-256, in hex, of the three, under the server's secret.
 * The kind is part of the viewer, so a guest can never collide with an
 * account.
 *
 * Every other input sits in the database: the submission, the account or
 * visitor id, the day. Without the secret, someone who holds only the
 * database cannot work out which rows are whose, however many guesses they
 * hash. The secret is not in the database.
 */
export const viewKeyFor = ({ submissionId, viewer, day, secret }: ViewKeyInput): string =>
  createHmac('sha256', secret)
    .update(`${VIEW_KEY_LABEL}|${submissionId}|${viewer.kind}:${viewer.id}|${day}`)
    .digest('hex');

const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/**
 * What a guest's views are bounded by: an IPv4 address whole, or the `/64`
 * of an IPv6 address, since one subscriber holds a whole `/64` and could
 * otherwise take a fresh address for every view. A value that is not an
 * address (the proxy sent none) is kept as it is, so those callers share one
 * allowance.
 */
export const guestAddressKey = (ip: string): string => {
  const address = ip.trim().replace(IPV4_MAPPED_PREFIX, '');

  return address.includes(':') ? truncateIp(address) : address;
};
