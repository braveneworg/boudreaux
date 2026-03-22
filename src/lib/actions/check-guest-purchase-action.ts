/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { PurchaseService } from '@/lib/services/purchase-service';

interface GuestPurchaseStatus {
  userId: string | null;
  hasPurchase: boolean;
  downloadCount: number;
  atCap: boolean;
}

/**
 * Server Action: Checks whether a guest user (identified by email)
 * has already purchased a given release, and if so, how many downloads
 * they have used. Used in the email-step callback to route returning
 * purchasers to the correct dialog step.
 */
export async function checkGuestPurchaseAction(
  email: string,
  releaseId: string
): Promise<GuestPurchaseStatus> {
  const user = await PurchaseRepository.findUserByEmail(email);
  if (!user) {
    return { userId: null, hasPurchase: false, downloadCount: 0, atCap: false };
  }

  const hasPurchase = await PurchaseService.checkExistingPurchase(user.id, releaseId);
  if (!hasPurchase) {
    return { userId: user.id, hasPurchase: false, downloadCount: 0, atCap: false };
  }

  const access = await PurchaseService.getDownloadAccess(user.id, releaseId);
  return {
    userId: user.id,
    hasPurchase: true,
    downloadCount: access.downloadCount,
    atCap: access.downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT,
  };
}
