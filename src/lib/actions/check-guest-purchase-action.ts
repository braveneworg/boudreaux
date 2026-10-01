/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { headers } from 'next/headers';

import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { downloadGate } from '@/lib/services/download-gate/download-gate';
import { PurchaseService } from '@/lib/services/purchase-service';
import { rateLimit } from '@/lib/utils/rate-limit';

interface GuestPurchaseStatus {
  hasPurchase: boolean;
  downloadCount: number;
  atCap: boolean;
  resetInHours: number | null;
}

// Rate limiter: 10 requests per minute per IP to prevent purchase/account enumeration
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/**
 * Server Action: Checks whether a guest user (identified by email)
 * has already purchased a given release, and if so, how many downloads
 * they have used. Used in the email-step callback to route returning
 * purchasers to the correct dialog step.
 *
 * Does not return userId to prevent account enumeration.
 */
export const checkGuestPurchaseAction = async (
  email: string,
  releaseId: string
): Promise<GuestPurchaseStatus> => {
  const headersList = await headers();
  const ip =
    headersList.get('x-real-ip') ||
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous';

  try {
    await limiter.check(10, ip);
  } catch {
    return { hasPurchase: false, downloadCount: 0, atCap: false, resetInHours: null };
  }

  const user = await PurchaseRepository.findUserByEmail(email);
  if (!user) {
    return { hasPurchase: false, downloadCount: 0, atCap: false, resetInHours: null };
  }

  const hasPurchase = await PurchaseService.checkExistingPurchase(user.id, releaseId);
  if (!hasPurchase) {
    return { hasPurchase: false, downloadCount: 0, atCap: false, resetInHours: null };
  }

  // The purchase throttle is the gate's to read (ADR-0018): at the cap means
  // the count is full AND the idle window has not passed.
  const status = await downloadGate.status({ kind: 'user', userId: user.id }, releaseId);
  return purchaseThrottleStatus(status?.purchaseThrottle ?? null);
};

const purchaseThrottleStatus = (
  throttle: { count: number; resetInHours: number | null } | null
): GuestPurchaseStatus => ({
  hasPurchase: true,
  downloadCount: throttle?.count ?? 0,
  atCap: throttle !== null && throttle.resetInHours !== null,
  resetInHours: throttle?.resetInHours ?? null,
});
