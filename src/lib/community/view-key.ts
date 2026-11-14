/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash } from 'node:crypto';

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
}

/**
 * The key one viewer's view of one submission on one UTC day is stored
 * under: a SHA-256, in hex, of the three. The kind is part of the viewer, so
 * a guest can never collide with an account.
 *
 * Not a secret: someone who holds an account's id can compute its keys. What
 * it keeps out of the database is a table that lists who viewed what.
 */
export const viewKeyFor = ({ submissionId, viewer, day }: ViewKeyInput): string =>
  createHash('sha256').update(`${submissionId}|${viewer.kind}:${viewer.id}|${day}`).digest('hex');

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
