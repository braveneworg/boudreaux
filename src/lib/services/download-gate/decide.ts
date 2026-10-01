/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DOWNLOAD_RESET_HOURS, MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import {
  FREE_DOWNLOAD_CAP,
  FREE_DOWNLOAD_WINDOW_MS,
  isFreeFormatType,
  MAX_FREE_DOWNLOAD_QUOTA,
} from '@/lib/constants/digital-formats';
import { isUserSubject } from '@/types/download-subject';

import type {
  Decision,
  DownloadFacts,
  GateFormat,
  PurchaseThrottleFacts,
  WindowFacts,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The download gate's policy, as one pure function over gathered facts
 * (ADR-0018). Everything the gate enforces is a row in `decide.spec.ts`:
 *
 * 1. Formats that exist on the release are delivered; none → NO_FILES.
 * 2. Entitlement picks the mode: a non-refunded purchase → `purchased`, which
 *    allows any format (withdrawn included) under the purchase throttle;
 *    anything else → `free`.
 * 3. Free mode: free formats only, never a withdrawn one; the lifetime cap
 *    (users only) is checked before the free throttle.
 */
export const decide = (facts: DownloadFacts): Decision => {
  const formats = facts.available.filter(({ formatType }) => facts.requested.includes(formatType));
  if (formats.length === 0) {
    return { kind: 'denial', reason: 'NO_FILES' };
  }

  return facts.entitled
    ? decidePurchased(formats, facts.purchaseThrottle, facts.now)
    : decideFree(formats, facts);
};

const decidePurchased = (
  formats: GateFormat[],
  throttle: PurchaseThrottleFacts | null,
  now: Date
): Decision => {
  const resetInHours = purchaseThrottleResetInHours(throttle, now);
  if (resetInHours !== null) {
    return { kind: 'denial', reason: 'DOWNLOAD_LIMIT', resetInHours };
  }
  return {
    kind: 'grant',
    mode: 'purchased',
    formats,
    charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
  };
};

const decideFree = (formats: GateFormat[], facts: DownloadFacts): Decision => {
  const paidOnly = formats.filter(({ formatType }) => !isFreeFormatType(formatType));
  if (paidOnly.length > 0) {
    return {
      kind: 'denial',
      reason: 'PURCHASE_REQUIRED',
      formats: paidOnly.map(({ formatType }) => formatType),
    };
  }

  const withdrawn = formats.filter((format) => format.withdrawn);
  if (withdrawn.length > 0) {
    return {
      kind: 'denial',
      reason: 'DELETED',
      formats: withdrawn.map(({ formatType }) => formatType),
    };
  }

  const chargeLifetime =
    isUserSubject(facts.subject) && facts.lifetime !== null && !facts.lifetime.includesThisRelease;
  if (
    chargeLifetime &&
    facts.lifetime !== null &&
    facts.lifetime.distinctReleases >= MAX_FREE_DOWNLOAD_QUOTA
  ) {
    return { kind: 'denial', reason: 'LIFETIME_CAP' };
  }

  if (facts.freeThrottle.count >= FREE_DOWNLOAD_CAP) {
    return {
      kind: 'denial',
      reason: 'THROTTLED',
      resetsAt: freeThrottleResetsAt(facts.freeThrottle, facts.now),
    };
  }

  return {
    kind: 'grant',
    mode: 'free',
    formats,
    charge: { lifetime: chargeLifetime, freeThrottle: true, purchaseThrottle: false },
  };
};

/** When the oldest counted download leaves the rolling window. */
export const freeThrottleResetsAt = (window: WindowFacts, now: Date): Date =>
  new Date((window.oldestInWindow ?? now).getTime() + FREE_DOWNLOAD_WINDOW_MS);

/**
 * Whole hours until the purchase throttle resets, or null when it is not
 * limiting: fewer than the cap, no last download, or the idle window elapsed.
 */
export const purchaseThrottleResetInHours = (
  throttle: PurchaseThrottleFacts | null,
  now: Date
): number | null => {
  if (throttle === null || throttle.count < MAX_RELEASE_DOWNLOAD_COUNT) {
    return null;
  }
  if (throttle.lastDownloadedAt === null) {
    return null;
  }
  const remainingMs =
    DOWNLOAD_RESET_HOURS * HOUR_MS - (now.getTime() - throttle.lastDownloadedAt.getTime());
  if (remainingMs <= 0) {
    return null;
  }
  return Math.min(DOWNLOAD_RESET_HOURS, Math.max(1, Math.ceil(remainingMs / HOUR_MS)));
};
