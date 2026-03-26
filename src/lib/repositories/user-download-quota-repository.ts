/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { prisma } from '@/lib/prisma';

import type { UserDownloadQuota } from '@prisma/client';

/**
 * Repository for managing user download quota records
 *
 * Enforces freemium download limit using atomic operations to track unique releases
 */
export class UserDownloadQuotaRepository {
  /**
   * Find existing quota record or create a new one for a user
   *
   * @param userId - User ID
   * @returns Quota record with uniqueReleaseIds array
   */
  async findOrCreateByUserId(userId: string): Promise<UserDownloadQuota> {
    // Try to find existing quota record
    let quota = await prisma.userDownloadQuota.findUnique({
      where: { userId },
    });

    // Create if doesn't exist
    if (!quota) {
      quota = await prisma.userDownloadQuota.create({
        data: {
          userId,
          uniqueReleaseIds: [],
        },
      });
    }

    return quota;
  }

  /**
   * Atomically add a unique release ID to user's download quota
   *
   * Uses MongoDB $addToSet to prevent duplicates and ensure atomic operation
   *
   * @param userId - User ID
   * @param releaseId - Release ID to add
   * @returns Updated quota record
   */
  async addUniqueRelease(userId: string, releaseId: string): Promise<UserDownloadQuota> {
    // Use findOrCreate to ensure quota record exists first
    await this.findOrCreateByUserId(userId);

    // Atomic update using MongoDB $addToSet (prevents duplicates)
    const updatedQuota = await prisma.userDownloadQuota.update({
      where: { userId },
      data: {
        uniqueReleaseIds: {
          push: releaseId,
        },
      },
    });

    return updatedQuota;
  }

  /**
   * Check if user has exceeded free download quota
   *
   * @param userId - User ID
   * @param maxQuota - Maximum allowed unique releases (default: 5)
   * @returns True if quota exceeded, false otherwise
   */
  async checkQuotaExceeded(userId: string, maxQuota = 5): Promise<boolean> {
    const quota = await this.findOrCreateByUserId(userId);

    return quota.uniqueReleaseIds.length >= maxQuota;
  }

  /**
   * Get remaining quota count for a user
   *
   * @param userId - User ID
   * @param maxQuota - Maximum allowed unique releases (default: 5)
   * @returns Number of remaining free downloads
   */
  async getRemainingQuota(userId: string, maxQuota = 5): Promise<number> {
    const quota = await this.findOrCreateByUserId(userId);
    const remaining = maxQuota - quota.uniqueReleaseIds.length;

    return Math.max(0, remaining); // Ensure non-negative
  }

  /**
   * Check if user has already downloaded a specific release for free
   *
   * @param userId - User ID
   * @param releaseId - Release ID to check
   * @returns True if release has been downloaded, false otherwise
   */
  async hasDownloadedRelease(userId: string, releaseId: string): Promise<boolean> {
    const quota = await this.findOrCreateByUserId(userId);

    return quota.uniqueReleaseIds.includes(releaseId);
  }

  /**
   * Get all unique release IDs downloaded by a user
   *
   * @param userId - User ID
   * @returns Array of release IDs
   */
  async getDownloadedReleaseIds(userId: string): Promise<string[]> {
    const quota = await this.findOrCreateByUserId(userId);

    return quota.uniqueReleaseIds;
  }
}
