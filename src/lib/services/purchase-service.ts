/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { DOWNLOAD_RESET_HOURS, MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { GuestDownloadCountRepository } from '@/lib/repositories/guest-download-count-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { SubscriptionRepository } from '@/lib/repositories/subscription-repository';
import { computeResetInHours } from '@/lib/utils/download-reset';
import { isGuestSubject, isUserSubject } from '@/types/download-subject';
import type { DownloadSubject } from '@/types/download-subject';

export interface DownloadAccess {
  allowed: boolean;
  reason: 'no_purchase' | 'download_limit_reached' | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  /** Hours remaining until the download limit resets. null when no reset is pending. */
  resetInHours: number | null;
  /** True when access is granted via an active subscription rather than a per-release purchase. */
  isSubscriber?: boolean;
}

type PurchaseRecord = Awaited<ReturnType<typeof PurchaseRepository.findByUserAndRelease>>;

const guestRepo = new GuestDownloadCountRepository();

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
   * Determines whether the subject is permitted to download the release.
   *
   * - For authenticated users: checks for an existing purchase or active
   *   subscription, and enforces the per-release download cap with a
   *   `DOWNLOAD_RESET_HOURS` reset window.
   * - For anonymous guests: skips the purchase/subscription checks (the
   *   freemium quota check happens upstream in `QuotaEnforcementService`)
   *   and enforces the same per-release cap using
   *   `GuestDownloadCountRepository`.
   */
  static async getDownloadAccess(
    subject: DownloadSubject,
    releaseId: string
  ): Promise<DownloadAccess> {
    if (isGuestSubject(subject)) {
      return PurchaseService.getGuestDownloadAccess(subject.visitorId, releaseId);
    }

    const userId = subject.userId;
    const [purchase, hasActiveSubscription] = await Promise.all([
      PurchaseRepository.findByUserAndRelease(userId, releaseId),
      SubscriptionRepository.hasActiveSubscription(userId),
    ]);
    return PurchaseService.getDownloadAccessForPurchase(
      purchase,
      userId,
      releaseId,
      hasActiveSubscription
    );
  }

  /**
   * Determines whether the user is permitted to download the release
   * using an already-fetched purchase record.
   *
   * When `hasActiveSubscription` is true, the user is granted access
   * regardless of whether a per-release purchase exists. The per-release
   * download cap (MAX_RELEASE_DOWNLOAD_COUNT) still applies.
   */
  static async getDownloadAccessForPurchase(
    purchase: PurchaseRecord,
    userId: string,
    releaseId: string,
    hasActiveSubscription = false
  ): Promise<DownloadAccess> {
    if (!purchase && !hasActiveSubscription) {
      return {
        allowed: false,
        reason: 'no_purchase',
        downloadCount: 0,
        lastDownloadedAt: null,
        resetInHours: null,
      };
    }

    const isSubscriber = !purchase && hasActiveSubscription;

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
          isSubscriber,
        };
      }
      return {
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount,
        lastDownloadedAt,
        resetInHours: computeResetInHours(lastDownloadedAt),
        isSubscriber,
      };
    }

    return {
      allowed: true,
      reason: null,
      downloadCount,
      lastDownloadedAt,
      resetInHours: null,
      isSubscriber,
    };
  }

  /**
   * Determines whether an anonymous guest is permitted to download the
   * release. Enforces the same per-release cap as authenticated users via
   * `GuestDownloadCountRepository`. The freemium per-visitor quota is
   * enforced separately upstream by `QuotaEnforcementService`.
   */
  private static async getGuestDownloadAccess(
    visitorId: string,
    releaseId: string
  ): Promise<DownloadAccess> {
    const record = await guestRepo.find(visitorId, releaseId);
    const downloadCount = record?.downloadCount ?? 0;
    const lastDownloadedAt = record?.lastDownloadAt ?? null;

    if (downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT) {
      if (isResetWindowElapsed(lastDownloadedAt)) {
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

    return {
      allowed: true,
      reason: null,
      downloadCount,
      lastDownloadedAt,
      resetInHours: null,
    };
  }

  /**
   * Increments the download counter for a subject+release pair. For users
   * the counter lives on `PurchaseRepository`; for guests it lives on
   * `GuestDownloadCountRepository`.
   */
  static async incrementDownloadCount(subject: DownloadSubject, releaseId: string) {
    if (isUserSubject(subject)) {
      return PurchaseRepository.upsertDownloadCount(subject.userId, releaseId);
    }
    return guestRepo.incrementOrReset(subject.visitorId, releaseId);
  }
}
