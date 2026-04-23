/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { headers } from 'next/headers';

import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
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
export async function checkGuestPurchaseAction(
  email: string,
  releaseId: string
): Promise<GuestPurchaseStatus> {
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

  const access = await PurchaseService.getDownloadAccess(user.id, releaseId);
  return {
    hasPurchase: true,
    downloadCount: access.downloadCount,
    atCap: access.downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT,
    resetInHours: access.resetInHours,
  };
}
