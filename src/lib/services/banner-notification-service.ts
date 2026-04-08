/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import {
  BANNER_SLOTS,
  DEFAULT_ROTATION_INTERVAL,
  ROTATION_INTERVAL_SETTINGS_KEY,
} from '@/lib/constants/banner-slots';
import { prisma } from '@/lib/prisma';
import { cache, withCache } from '@/lib/utils/simple-cache';

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

const CACHE_TTL_SECONDS = 300; // 5 minutes

const getCacheKey = (): string => {
  const today = new Date().toISOString().split('T')[0];
  return `banner-notifications:${today}`;
};

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

          const notifications = await prisma.bannerNotification.findMany({
            orderBy: { slotNumber: 'asc' },
          });

          const rotationInterval = await BannerNotificationService.getRotationInterval();

          const banners: BannerSlotResponse[] = BANNER_SLOTS.map((slot) => {
            const notification = notifications.find((n) => n.slotNumber === slot.slotNumber);

            const isActive =
              notification?.content &&
              (!notification.displayFrom || notification.displayFrom <= now) &&
              (!notification.displayUntil || notification.displayUntil >= now);

            return {
              slotNumber: slot.slotNumber,
              imageFilename: slot.filename,
              notification: isActive
                ? {
                    id: notification.id,
                    content: notification.content as string,
                    textColor: notification.textColor,
                    backgroundColor: notification.backgroundColor,
                    displayFrom: notification.displayFrom?.toISOString() ?? null,
                    displayUntil: notification.displayUntil?.toISOString() ?? null,
                  }
                : null,
            };
          });

          return { banners, rotationInterval };
        },
        CACHE_TTL_SECONDS
      );

      return { success: true, data };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database connection failed' };
      }
      console.error('Failed to fetch active banners:', error);
      return { success: false, error: 'Failed to fetch active banners' };
    }
  }

  /**
   * Get all banner notifications (including inactive) for admin management.
   */
  static async getAllNotifications(): Promise<ServiceResponse<BannerNotificationData[]>> {
    try {
      const notifications = await prisma.bannerNotification.findMany({
        orderBy: { slotNumber: 'asc' },
      });
      return { success: true, data: notifications };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database connection failed' };
      }
      console.error('Failed to fetch all notifications:', error);
      return { success: false, error: 'Failed to fetch notifications' };
    }
  }

  /**
   * Upsert a notification for a given banner slot.
   */
  static async upsertNotification(
    slotNumber: number,
    data: {
      content?: string | null;
      textColor?: string | null;
      backgroundColor?: string | null;
      displayFrom?: Date | null;
      displayUntil?: Date | null;
      repostedFromId?: string | null;
      addedById: string;
    }
  ): Promise<ServiceResponse<BannerNotificationData>> {
    try {
      const notification = await prisma.bannerNotification.upsert({
        where: { slotNumber },
        update: {
          content: data.content,
          textColor: data.textColor,
          backgroundColor: data.backgroundColor,
          displayFrom: data.displayFrom,
          displayUntil: data.displayUntil,
          repostedFromId: data.repostedFromId,
          addedById: data.addedById,
        },
        create: {
          slotNumber,
          content: data.content,
          textColor: data.textColor,
          backgroundColor: data.backgroundColor,
          displayFrom: data.displayFrom,
          displayUntil: data.displayUntil,
          repostedFromId: data.repostedFromId,
          addedById: data.addedById,
        },
      });

      BannerNotificationService.invalidateCache();
      return { success: true, data: notification };
    } catch (error) {
      console.error('Failed to upsert notification:', error);
      return { success: false, error: 'Failed to save notification' };
    }
  }

  /**
   * Delete a notification for a given banner slot.
   */
  static async deleteNotification(slotNumber: number): Promise<ServiceResponse<{ deleted: true }>> {
    try {
      await prisma.bannerNotification.delete({
        where: { slotNumber },
      });
      BannerNotificationService.invalidateCache();
      return { success: true, data: { deleted: true } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Notification not found' };
      }
      console.error('Failed to delete notification:', error);
      return { success: false, error: 'Failed to delete notification' };
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
      const notifications = await prisma.bannerNotification.findMany({
        where: query
          ? { content: { contains: query, mode: 'insensitive' } }
          : { content: { not: null } },
        select: {
          id: true,
          content: true,
          textColor: true,
          backgroundColor: true,
          slotNumber: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      });

      return { success: true, data: notifications };
    } catch (error) {
      console.error('Failed to search notifications:', error);
      return { success: false, error: 'Failed to search notifications' };
    }
  }

  /**
   * Get the carousel rotation interval from SiteSettings.
   */
  static async getRotationInterval(): Promise<number> {
    try {
      const setting = await prisma.siteSettings.findUnique({
        where: { key: ROTATION_INTERVAL_SETTINGS_KEY },
      });
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
      await prisma.siteSettings.upsert({
        where: { key: ROTATION_INTERVAL_SETTINGS_KEY },
        update: { value: String(interval) },
        create: { key: ROTATION_INTERVAL_SETTINGS_KEY, value: String(interval) },
      });
      BannerNotificationService.invalidateCache();
      return { success: true, data: { interval } };
    } catch (error) {
      console.error('Failed to update rotation interval:', error);
      return { success: false, error: 'Failed to update rotation interval' };
    }
  }

  /**
   * Invalidate the banner notification cache.
   */
  static invalidateCache(): void {
    cache.delete(getCacheKey());
  }
}
