/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';

export interface DownloadAccess {
  allowed: boolean;
  reason: 'no_purchase' | 'download_limit_reached' | null;
  downloadCount: number;
}

/**
 * Business logic for release purchases and download gating.
 */
export class PurchaseService {
  /**
   * Returns true if the user has an existing purchase for the given release.
   */
  static async checkExistingPurchase(userId: string, releaseId: string): Promise<boolean> {
    const purchase = await PurchaseRepository.findByUserAndRelease(userId, releaseId);
    return purchase !== null;
  }

  /**
   * Determines whether the user is permitted to download the release.
   * Checks purchase existence and download cap.
   */
  static async getDownloadAccess(userId: string, releaseId: string): Promise<DownloadAccess> {
    const purchase = await PurchaseRepository.findByUserAndRelease(userId, releaseId);
    if (!purchase) {
      return { allowed: false, reason: 'no_purchase', downloadCount: 0 };
    }

    const downloadRecord = await PurchaseRepository.getDownloadRecord(userId, releaseId);
    const downloadCount = downloadRecord?.downloadCount ?? 0;

    if (downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT) {
      return { allowed: false, reason: 'download_limit_reached', downloadCount };
    }

    return { allowed: true, reason: null, downloadCount };
  }

  /**
   * Increments the download counter for a user+release pair.
   * Delegates to PurchaseRepository.upsertDownloadCount.
   */
  static async incrementDownloadCount(userId: string, releaseId: string) {
    return PurchaseRepository.upsertDownloadCount(userId, releaseId);
  }
}
