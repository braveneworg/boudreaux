/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  BANNER_SLOTS,
  DEFAULT_ROTATION_INTERVAL,
  ROTATION_INTERVAL_SETTINGS_KEY,
} from '@/lib/constants/banner-slots';
import { BannerNotificationRepository } from '@/lib/repositories/banner-notification-repository';
import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import type {
  BannerNotificationRecord,
  UpsertBannerNotificationData,
} from '@/lib/types/domain/banner-notification';
import { DataError } from '@/lib/types/domain/errors';
import { sanitizeBannerHtmlServer } from '@/lib/utils/sanitize-banner-html';
import { cache, withCache } from '@/lib/utils/simple-cache';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

export interface BannerNotificationData {
  id: string;
  slotNumber: number;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  displayFrom: Date | null;
  displayUntil: Date | null;
  repostedFromId: string | null;
  addedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BannerSlotResponse {
  slotNumber: number;
  imageFilename: string;
  notification: {
    id: string;
    content: string;
    textColor: string | null;
    backgroundColor: string | null;
    displayFrom: string | null;
    displayUntil: string | null;
  } | null;
}

export interface BannersApiResponse {
  banners: BannerSlotResponse[];
  rotationInterval: number;
}

export interface SearchNotificationResult {
  id: string;
  content: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  slotNumber: number;
  createdAt: Date;
}

// Cache for 5 minutes; disabled in development and E2E. In E2E, Playwright's
// webServer readiness probe GETs `/` BEFORE globalSetup seeds the database
// (plugin setup precedes global setup), and `loading.tsx` streaming lets that
// pre-seed render race the seed — caching an empty-notifications payload for
// longer than the whole suite. Same pattern as FeaturedArtistsService.
const getCacheTtlSeconds = (): number =>
  process.env.NODE_ENV === 'development' || process.env.E2E_MODE === 'true' ? 0 : 300;

const getCacheKey = (): string => {
  const today = new Date().toISOString().split('T')[0];
  return `banner-notifications:${today}`;
};

/**
 * A slot is active when it has content and `now` falls within its optional
 * display window. Narrows `notification` to a defined record so callers can read
 * its fields without re-checking for `undefined`.
 */
const isNotificationActive = (
  notification: BannerNotificationRecord | undefined,
  now: Date
): notification is BannerNotificationRecord =>
  Boolean(
    notification?.content &&
    (!notification.displayFrom || notification.displayFrom <= now) &&
    (!notification.displayUntil || notification.displayUntil >= now)
  );

/**
 * Build the API response for a single banner slot. When the slot's notification
 * is active its content is re-sanitized at the read boundary (parser-based) so
 * the public carousel always receives robustly-sanitized HTML, regardless of
 * how the content entered the DB (write action, seed, migration). The client
 * carousel keeps its regex pass as an extra defense-in-depth layer.
 */
const toBannerSlotResponse = (
  slot: (typeof BANNER_SLOTS)[number],
  notification: BannerNotificationRecord | undefined,
  now: Date
): BannerSlotResponse => ({
  slotNumber: slot.slotNumber,
  imageFilename: slot.filename,
  notification: isNotificationActive(notification, now)
    ? {
        id: notification.id,
        content: sanitizeBannerHtmlServer(notification.content as string),
        textColor: notification.textColor,
        backgroundColor: notification.backgroundColor,
        displayFrom: notification.displayFrom?.toISOString() ?? null,
        displayUntil: notification.displayUntil?.toISOString() ?? null,
      }
    : null,
});

export class BannerNotificationService {
  /**
   * Get all 5 banner slots with their active notifications for the current date.
   * Cached for 5 minutes with day-granularity key.
   */
  static async getActiveBanners(): Promise<ServiceResponse<BannersApiResponse>> {
    try {
      const data = await withCache<BannersApiResponse>(
        getCacheKey(),
        async () => {
          const now = new Date();

          const notifications = await BannerNotificationRepository.findAllOrderedBySlot();

          const rotationInterval = await BannerNotificationService.getRotationInterval();

          const banners: BannerSlotResponse[] = BANNER_SLOTS.map((slot) =>
            toBannerSlotResponse(
              slot,
              notifications.find((n) => n.slotNumber === slot.slotNumber),
              now
            )
          );

          return { banners, rotationInterval };
        },
        getCacheTtlSeconds()
      );

      return { success: true, data };
    } catch (error) {
      return failFromError(error, {
        UNAVAILABLE: 'Database connection failed',
        UNKNOWN: 'Failed to fetch active banners',
      });
    }
  }

  /**
   * Get all banner notifications (including inactive) for admin management.
   */
  static async getAllNotifications(): Promise<ServiceResponse<BannerNotificationData[]>> {
    try {
      const notifications = await BannerNotificationRepository.findAllOrderedBySlot();
      return { success: true, data: notifications };
    } catch (error) {
      return failFromError(error, {
        UNAVAILABLE: 'Database connection failed',
        UNKNOWN: 'Failed to fetch notifications',
      });
    }
  }

  /**
   * Upsert a notification for a given banner slot.
   */
  static async upsertNotification(
    slotNumber: number,
    data: UpsertBannerNotificationData
  ): Promise<ServiceResponse<BannerNotificationData>> {
    try {
      const notification = await BannerNotificationRepository.upsertBySlot(slotNumber, data);

      BannerNotificationService.invalidateCache();
      return { success: true, data: notification };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to save notification' });
    }
  }

  /**
   * Delete a notification for a given banner slot.
   */
  static async deleteNotification(slotNumber: number): Promise<ServiceResponse<{ deleted: true }>> {
    try {
      await BannerNotificationRepository.deleteBySlot(slotNumber);
      BannerNotificationService.invalidateCache();
      return { success: true, data: { deleted: true } };
    } catch (error) {
      if (error instanceof DataError && error.code === 'NOT_FOUND') {
        return { success: false, error: 'Notification not found' };
      }
      return failFromError(error, { UNKNOWN: 'Failed to delete notification' });
    }
  }

  /**
   * Search past notifications for the repost combobox.
   */
  static async searchNotifications(
    query: string,
    take = 20
  ): Promise<ServiceResponse<SearchNotificationResult[]>> {
    try {
      const notifications = await BannerNotificationRepository.searchByContent(query, take);

      return { success: true, data: notifications };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to search notifications' });
    }
  }

  /**
   * Get the carousel rotation interval from SiteSettings.
   */
  static async getRotationInterval(): Promise<number> {
    try {
      const setting = await SiteSettingsRepository.findByKey(ROTATION_INTERVAL_SETTINGS_KEY);
      if (setting) {
        const parsed = parseFloat(setting.value);
        if (!isNaN(parsed) && parsed >= 3 && parsed <= 15) {
          return parsed;
        }
      }
      return DEFAULT_ROTATION_INTERVAL;
    } catch {
      return DEFAULT_ROTATION_INTERVAL;
    }
  }

  /**
   * Update the carousel rotation interval in SiteSettings.
   */
  static async updateRotationInterval(
    interval: number
  ): Promise<ServiceResponse<{ interval: number }>> {
    try {
      await SiteSettingsRepository.upsertByKey(ROTATION_INTERVAL_SETTINGS_KEY, String(interval));
      BannerNotificationService.invalidateCache();
      return { success: true, data: { interval } };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to update rotation interval' });
    }
  }

  /**
   * Invalidate the banner notification cache.
   */
  static invalidateCache(): void {
    cache.delete(getCacheKey());
  }
}
