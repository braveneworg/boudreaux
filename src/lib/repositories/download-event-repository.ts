/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';

import type { DownloadEvent, Prisma } from '@prisma/client';

/**
 * Repository for managing download event records and analytics
 */
export class DownloadEventRepository {
  /**
   * Log a download event with user, release, and format information
   *
   * @param data - Download event details
   * @returns Created download event record
   */
  async logDownloadEvent(data: {
    userId: string | null;
    releaseId: string;
    formatType: DigitalFormatType;
    success: boolean;
    errorCode?: string | null;
    ipAddress: string;
    userAgent: string;
  }): Promise<DownloadEvent> {
    return prisma.downloadEvent.create({
      data: {
        userId: data.userId,
        releaseId: data.releaseId,
        formatType: data.formatType,
        success: data.success,
        errorCode: data.errorCode ?? null,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  /**
   * Get download analytics grouped by format for a specific release
   *
   * @param releaseId - Release ID to get analytics for
   * @param options - Optional date range filter
   * @returns Array of format counts
   */
  async getAnalyticsByRelease(
    releaseId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<Array<{ formatType: DigitalFormatType; count: number }>> {
    const where: Prisma.DownloadEventWhereInput = {
      releaseId,
      success: true,
      ...(options?.startDate || options?.endDate
        ? {
            downloadedAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const aggregations = await prisma.downloadEvent.groupBy({
      by: ['formatType'],
      where,
      _count: {
        id: true,
      },
    });

    return aggregations.map((agg) => ({
      formatType: agg.formatType as DigitalFormatType,
      count: agg._count.id,
    }));
  }

  /**
   * Get download analytics for a specific user
   *
   * @param userId - User ID to get analytics for
   * @param options - Optional date range filter
   * @returns Total downloads count
   */
  async getAnalyticsByUser(
    userId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{ totalDownloads: number }> {
    const where: Prisma.DownloadEventWhereInput = {
      userId,
      success: true,
      ...(options?.startDate || options?.endDate
        ? {
            downloadedAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const count = await prisma.downloadEvent.count({ where });

    return {
      totalDownloads: count,
    };
  }

  /**
   * Get count of unique users who downloaded a release
   *
   * @param releaseId - Release ID to get unique users for
   * @param options - Optional date range filter
   * @returns Count of unique users (excludes anonymous downloads)
   */
  async getUniqueUsers(
    releaseId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<number> {
    const where: Prisma.DownloadEventWhereInput = {
      releaseId,
      success: true,
      userId: { not: null },
      ...(options?.startDate || options?.endDate
        ? {
            downloadedAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    const uniqueUsers = await prisma.downloadEvent.findMany({
      where,
      select: {
        userId: true,
      },
      distinct: ['userId'],
    });

    return uniqueUsers.length;
  }

  /**
   * Get total successful download count for a release
   *
   * @param releaseId - Release ID to get total downloads for
   * @param options - Optional date range filter
   * @returns Total download count
   */
  async getTotalDownloads(
    releaseId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<number> {
    const where: Prisma.DownloadEventWhereInput = {
      releaseId,
      success: true,
      ...(options?.startDate || options?.endDate
        ? {
            downloadedAt: {
              ...(options.startDate && { gte: options.startDate }),
              ...(options.endDate && { lte: options.endDate }),
            },
          }
        : {}),
    };

    return prisma.downloadEvent.count({ where });
  }
}
