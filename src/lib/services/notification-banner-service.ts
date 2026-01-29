import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { withCache } from '@/lib/utils/simple-cache';

import type { ServiceResponse } from './service.types';

export type NotificationBanner = {
  id: string;
  message: string;
  secondaryMessage: string | null;
  notes: string | null;
  originalImageUrl: string | null; // Original cropped image without text overlay
  imageUrl: string | null; // Processed image URL with text overlay burned in
  linkUrl: string | null;
  backgroundColor: string | null;
  isOverlayed: boolean;
  // Font styling for message
  messageFont: string | null;
  messageFontSize: number | null;
  messageContrast: number | null;
  // Font styling for secondary message
  secondaryMessageFont: string | null;
  secondaryMessageFontSize: number | null;
  secondaryMessageContrast: number | null;
  // Text color settings
  messageTextColor: string | null;
  secondaryMessageTextColor: string | null;
  // Text shadow settings
  messageTextShadow: boolean | null;
  messageTextShadowDarkness: number | null;
  secondaryMessageTextShadow: boolean | null;
  secondaryMessageTextShadowDarkness: number | null;
  // Text position settings
  messagePositionX: number | null;
  messagePositionY: number | null;
  secondaryMessagePositionX: number | null;
  secondaryMessagePositionY: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  displayFrom: Date | null;
  displayUntil: Date | null;
  addedById: string;
  publishedAt: Date | null;
  publishedBy: string | null;
};

export class NotificationBannerService {
  /**
   * Create a new notification banner
   */
  static async createNotificationBanner(
    data: Prisma.NotificationCreateInput
  ): Promise<ServiceResponse<NotificationBanner>> {
    try {
      const notification = await prisma.notification.create({
        data,
      });
      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create notification banner' };
    }
  }

  /**
   * Get active notification banners for public display
   * Filters by isActive, displayFrom, displayUntil
   */
  static async getActiveNotificationBanners(
    currentDate: Date = new Date()
  ): Promise<ServiceResponse<NotificationBanner[]>> {
    const cacheKey = `notification-banners:active:${currentDate.toISOString().split('T')[0]}`;

    return withCache(
      cacheKey,
      async () => {
        try {
          const notifications = await prisma.notification.findMany({
            where: {
              isActive: true,
              publishedAt: {
                not: null,
              },
              OR: [{ displayFrom: null }, { displayFrom: { lte: currentDate } }],
              AND: [
                {
                  OR: [{ displayUntil: null }, { displayUntil: { gte: currentDate } }],
                },
              ],
            },
            orderBy: {
              publishedAt: 'desc',
            },
          });

          return { success: true as const, data: notifications };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error('Database connection failed:', error);
            return { success: false as const, error: 'Database unavailable' };
          }

          console.error('Unexpected error:', error);
          return { success: false as const, error: 'Failed to fetch notification banners' };
        }
      },
      process.env.NODE_ENV === 'development' ? 0 : 300 // Cache for 5 minutes
    );
  }

  /**
   * Get all notification banners for admin (no filters)
   */
  static async getAllNotificationBanners(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<NotificationBanner[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.NotificationWhereInput = {
        ...(search && {
          OR: [
            { message: { contains: search, mode: 'insensitive' } },
            { secondaryMessage: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const notifications = await prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return { success: true, data: notifications };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve notification banners' };
    }
  }

  /**
   * Get a notification banner by ID
   */
  static async getNotificationBannerById(
    id: string
  ): Promise<ServiceResponse<NotificationBanner | null>> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to fetch notification banner' };
    }
  }

  /**
   * Update a notification banner
   */
  static async updateNotificationBanner(
    id: string,
    data: Prisma.NotificationUpdateInput
  ): Promise<ServiceResponse<NotificationBanner>> {
    try {
      const notification = await prisma.notification.update({
        where: { id },
        data,
      });

      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return { success: false, error: 'Notification banner not found' };
        }
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update notification banner' };
    }
  }

  /**
   * Delete a notification banner
   */
  static async deleteNotificationBanner(id: string): Promise<ServiceResponse<NotificationBanner>> {
    try {
      const notification = await prisma.notification.delete({
        where: { id },
      });

      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return { success: false, error: 'Notification banner not found' };
        }
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete notification banner' };
    }
  }

  /**
   * Publish a notification banner
   */
  static async publishNotificationBanner(
    id: string,
    publishedBy: string
  ): Promise<ServiceResponse<NotificationBanner>> {
    try {
      const notification = await prisma.notification.update({
        where: { id },
        data: {
          publishedAt: new Date(),
          publishedBy,
        },
      });

      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return { success: false, error: 'Notification banner not found' };
        }
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to publish notification banner' };
    }
  }

  /**
   * Unpublish a notification banner
   */
  static async unpublishNotificationBanner(
    id: string
  ): Promise<ServiceResponse<NotificationBanner>> {
    try {
      const notification = await prisma.notification.update({
        where: { id },
        data: {
          publishedAt: null,
          publishedBy: null,
        },
      });

      return { success: true, data: notification };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          return { success: false, error: 'Notification banner not found' };
        }
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to unpublish notification banner' };
    }
  }
}
