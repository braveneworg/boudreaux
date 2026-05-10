/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { MAX_FREE_DOWNLOAD_QUOTA } from '@/lib/constants/digital-formats';
import { UserDownloadQuotaRepository } from '@/lib/repositories/user-download-quota-repository';
import type { DownloadSubject } from '@/types/download-subject';

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
   * Check if the subject is allowed to perform a free download of the given
   * release.
   *
   * Rules:
   * - If the subject has already downloaded this release for free, allow
   *   (no extra quota consumed).
   * - If the subject has not yet reached the quota limit, allow.
   * - Otherwise, deny (QUOTA_EXCEEDED).
   */
  async checkFreeDownloadQuota(
    subject: DownloadSubject,
    releaseId: string
  ): Promise<QuotaCheckResult> {
    const quota = await this.quotaRepo.findOrCreateBySubject(subject);
    const uniqueDownloads = quota.uniqueReleaseIds.length;
    const remainingQuota = Math.max(0, this.maxQuota - uniqueDownloads);

    if (quota.uniqueReleaseIds.includes(releaseId)) {
      return {
        allowed: true,
        reason: 'ALREADY_DOWNLOADED',
        remainingQuota,
        uniqueDownloads,
      };
    }

    if (uniqueDownloads >= this.maxQuota) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        remainingQuota: 0,
        uniqueDownloads,
      };
    }

    return {
      allowed: true,
      reason: 'WITHIN_QUOTA',
      remainingQuota: remainingQuota - 1,
      uniqueDownloads,
    };
  }

  /**
   * Increment the subject's quota by adding a release to their unique
   * downloads. Only call after `checkFreeDownloadQuota` returns
   * `{ allowed: true, reason: 'WITHIN_QUOTA' }`.
   */
  async incrementQuota(subject: DownloadSubject, releaseId: string): Promise<void> {
    await this.quotaRepo.addUniqueRelease(subject, releaseId);
  }

  /**
   * Get the current quota status for the subject.
   */
  async getQuotaStatus(subject: DownloadSubject): Promise<{
    remainingQuota: number;
    uniqueDownloads: number;
    maxQuota: number;
    downloadedReleaseIds: string[];
  }> {
    const quota = await this.quotaRepo.findOrCreateBySubject(subject);

    return {
      remainingQuota: Math.max(0, this.maxQuota - quota.uniqueReleaseIds.length),
      uniqueDownloads: quota.uniqueReleaseIds.length,
      maxQuota: this.maxQuota,
      downloadedReleaseIds: quota.uniqueReleaseIds,
    };
  }
}
