/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  BannerNotificationRecord,
  BannerNotificationSearchRecord,
  UpsertBannerNotificationData,
} from '@/lib/types/domain/banner-notification';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// Compile-time drift guard: fail `pnpm run typecheck` if the hand-written
// domain record diverges from the Prisma payload the queries actually return.
type _BannerNotificationDrift = AssertExact<
  BannerNotificationRecord,
  Prisma.BannerNotificationGetPayload<Record<never, never>>
>;
const _bannerNotificationDrift: _BannerNotificationDrift = true;

/** Build the search `where` from an optional query (case-insensitive contains). */
const buildSearchWhere = (query: string): Prisma.BannerNotificationWhereInput =>
  query ? { content: { contains: query, mode: 'insensitive' } } : { content: { not: null } };

/**
 * Data-access layer for `BannerNotification` records. The only layer that touches
 * Prisma for the homepage banner carousel: it owns the query shapes, wraps every
 * call in `runQuery` so callers see vendor-neutral `DataError`s, and returns
 * hand-written domain types. Business logic (sanitization, caching,
 * ServiceResponse wrapping) stays in the service.
 */
export class BannerNotificationRepository {
  /**
   * Find all banner notifications ordered by slot number ascending.
   * Used by both the public carousel and the admin management view.
   */
  static async findAllOrderedBySlot(): Promise<BannerNotificationRecord[]> {
    return runQuery(() =>
      prisma.bannerNotification.findMany({
        orderBy: { slotNumber: 'asc' },
      })
    );
  }

  /** Count banner slots that have content (used by the admin dashboard). */
  static async countActive(): Promise<number> {
    return runQuery(() =>
      prisma.bannerNotification.count({
        where: { content: { not: null } },
      })
    );
  }

  /**
   * Search past notifications for the repost combobox.
   * When `query` is provided, performs a case-insensitive `contains` match;
   * otherwise returns all notifications that have non-null content.
   */
  static async searchByContent(
    query: string,
    take: number
  ): Promise<BannerNotificationSearchRecord[]> {
    return runQuery(() =>
      prisma.bannerNotification.findMany({
        where: buildSearchWhere(query),
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
      })
    );
  }

  /**
   * Upsert a notification for a given banner slot, keyed by `slotNumber`.
   */
  static async upsertBySlot(
    slotNumber: number,
    data: UpsertBannerNotificationData
  ): Promise<BannerNotificationRecord> {
    return runQuery(() =>
      prisma.bannerNotification.upsert({
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
      })
    );
  }

  /**
   * Delete the notification occupying a given banner slot. The repository wraps
   * Prisma's `P2025` (no record) as a `NOT_FOUND` `DataError`.
   */
  static async deleteBySlot(slotNumber: number): Promise<BannerNotificationRecord> {
    return runQuery(() =>
      prisma.bannerNotification.delete({
        where: { slotNumber },
      })
    );
  }
}
