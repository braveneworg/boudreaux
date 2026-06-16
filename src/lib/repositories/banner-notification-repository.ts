/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import type { BannerNotification } from '@prisma/client';

interface UpsertNotificationData {
  content?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
  displayFrom?: Date | null;
  displayUntil?: Date | null;
  repostedFromId?: string | null;
  addedById: string;
}

/**
 * Data-access layer for `BannerNotification` records.
 * All database logic for the homepage banner carousel lives here.
 * Methods return raw Prisma results; business logic (sanitization,
 * caching, ServiceResponse wrapping) stays in the service.
 */
export class BannerNotificationRepository {
  /**
   * Find all banner notifications ordered by slot number ascending.
   * Used by both the public carousel and the admin management view.
   */
  static async findAllOrderedBySlot(): Promise<BannerNotification[]> {
    return prisma.bannerNotification.findMany({
      orderBy: { slotNumber: 'asc' },
    });
  }

  /**
   * Search past notifications for the repost combobox.
   * When `query` is provided, performs a case-insensitive `contains` match;
   * otherwise returns all notifications that have non-null content.
   */
  static async searchByContent(
    query: string,
    take: number
  ): Promise<
    Pick<
      BannerNotification,
      'id' | 'content' | 'textColor' | 'backgroundColor' | 'slotNumber' | 'createdAt'
    >[]
  > {
    return prisma.bannerNotification.findMany({
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
  }

  /**
   * Upsert a notification for a given banner slot, keyed by `slotNumber`.
   */
  static async upsertBySlot(
    slotNumber: number,
    data: UpsertNotificationData
  ): Promise<BannerNotification> {
    return prisma.bannerNotification.upsert({
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
  }

  /**
   * Delete the notification occupying a given banner slot.
   * Throws Prisma's `P2025` known request error when no record exists.
   */
  static async deleteBySlot(slotNumber: number): Promise<BannerNotification> {
    return prisma.bannerNotification.delete({
      where: { slotNumber },
    });
  }
}

export type { UpsertNotificationData };
