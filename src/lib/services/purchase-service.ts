/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { DOWNLOAD_RESET_HOURS, MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { computeResetInHours } from '@/lib/utils/download-reset';

export interface DownloadAccess {
  allowed: boolean;
  reason: 'no_purchase' | 'download_limit_reached' | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  /** Hours remaining until the download limit resets. null when no reset is pending. */
  resetInHours: number | null;
}

/**
 * Returns true if the given timestamp is more than DOWNLOAD_RESET_HOURS ago.
 */
function isResetWindowElapsed(lastDownloadedAt: Date | null): boolean {
  if (!lastDownloadedAt) return false;
  const resetMs = DOWNLOAD_RESET_HOURS * 60 * 60 * 1000;
  return Date.now() - new Date(lastDownloadedAt).getTime() > resetMs;
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
   * Checks purchase existence, download cap, and 6-hour reset window.
   *
   * If the download limit is reached but more than DOWNLOAD_RESET_HOURS have
   * passed since the last download, the counter is automatically reset to 0.
   */
  static async getDownloadAccess(userId: string, releaseId: string): Promise<DownloadAccess> {
    const purchase = await PurchaseRepository.findByUserAndRelease(userId, releaseId);
    if (!purchase) {
      return {
        allowed: false,
        reason: 'no_purchase',
        downloadCount: 0,
        lastDownloadedAt: null,
        resetInHours: null,
      };
    }

    const downloadRecord = await PurchaseRepository.getDownloadRecord(userId, releaseId);
    const downloadCount = downloadRecord?.downloadCount ?? 0;
    const lastDownloadedAt = downloadRecord?.lastDownloadedAt ?? null;

    if (downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT) {
      // If 6+ hours have passed since last download, reset the counter
      if (isResetWindowElapsed(lastDownloadedAt)) {
        await PurchaseRepository.resetDownloadCount(userId, releaseId);
        return {
          allowed: true,
          reason: null,
          downloadCount: 0,
          lastDownloadedAt,
          resetInHours: null,
        };
      }
      return {
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount,
        lastDownloadedAt,
        resetInHours: computeResetInHours(lastDownloadedAt),
      };
    }

    return { allowed: true, reason: null, downloadCount, lastDownloadedAt, resetInHours: null };
  }

  /**
   * Increments the download counter for a user+release pair.
   * Delegates to PurchaseRepository.upsertDownloadCount.
   */
  static async incrementDownloadCount(userId: string, releaseId: string) {
    return PurchaseRepository.upsertDownloadCount(userId, releaseId);
  }
}
