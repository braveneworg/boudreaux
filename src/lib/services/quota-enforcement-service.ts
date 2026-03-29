/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { MAX_FREE_DOWNLOAD_QUOTA } from '@/lib/constants/digital-formats';
import { UserDownloadQuotaRepository } from '@/lib/repositories/user-download-quota-repository';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'ALREADY_DOWNLOADED' | 'WITHIN_QUOTA' | 'QUOTA_EXCEEDED';
  remainingQuota: number;
  uniqueDownloads: number;
}

/**
 * Service for enforcing freemium download quota rules.
 *
 * Centralizes quota logic: check whether a free download is allowed,
 * and increment quota when a free download occurs.
 */
export class QuotaEnforcementService {
  private quotaRepo: UserDownloadQuotaRepository;
  private maxQuota: number;

  constructor(quotaRepo?: UserDownloadQuotaRepository, maxQuota: number = MAX_FREE_DOWNLOAD_QUOTA) {
    this.quotaRepo = quotaRepo ?? new UserDownloadQuotaRepository();
    this.maxQuota = maxQuota;
  }

  /**
   * Check if a user is allowed to perform a free download of the given release.
   *
   * Rules:
   * - If the user has already downloaded this release for free, allow (no extra quota consumed).
   * - If the user has not yet reached the quota limit, allow.
   * - Otherwise, deny (QUOTA_EXCEEDED).
   */
  async checkFreeDownloadQuota(userId: string, releaseId: string): Promise<QuotaCheckResult> {
    const quota = await this.quotaRepo.findOrCreateByUserId(userId);
    const uniqueDownloads = quota.uniqueReleaseIds.length;
    const remainingQuota = Math.max(0, this.maxQuota - uniqueDownloads);

    // Already downloaded this release — re-download doesn't consume quota
    if (quota.uniqueReleaseIds.includes(releaseId)) {
      return {
        allowed: true,
        reason: 'ALREADY_DOWNLOADED',
        remainingQuota,
        uniqueDownloads,
      };
    }

    // New release but quota exceeded
    if (uniqueDownloads >= this.maxQuota) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        remainingQuota: 0,
        uniqueDownloads,
      };
    }

    // New release and within quota
    return {
      allowed: true,
      reason: 'WITHIN_QUOTA',
      remainingQuota: remainingQuota - 1, // After this download
      uniqueDownloads,
    };
  }

  /**
   * Increment the user's quota by adding a release to their unique downloads.
   *
   * Should only be called after `checkFreeDownloadQuota` returns `allowed: true`
   * with reason `WITHIN_QUOTA` (not `ALREADY_DOWNLOADED`).
   */
  async incrementQuota(userId: string, releaseId: string): Promise<void> {
    await this.quotaRepo.addUniqueRelease(userId, releaseId);
  }

  /**
   * Get the current quota status for a user.
   */
  async getQuotaStatus(userId: string): Promise<{
    remainingQuota: number;
    uniqueDownloads: number;
    maxQuota: number;
    downloadedReleaseIds: string[];
  }> {
    const quota = await this.quotaRepo.findOrCreateByUserId(userId);

    return {
      remainingQuota: Math.max(0, this.maxQuota - quota.uniqueReleaseIds.length),
      uniqueDownloads: quota.uniqueReleaseIds.length,
      maxQuota: this.maxQuota,
      downloadedReleaseIds: quota.uniqueReleaseIds,
    };
  }
}
