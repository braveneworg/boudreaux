/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

interface UpsertChatUserData {
  userId: string;
  fingerprint: string;
  ipAddress: string;
}

interface FindManyPaginatedParams {
  skip: number;
  take: number;
  sortBy: 'messageCount' | 'lastSeenAt';
  sortDirection: 'asc' | 'desc';
}

/**
 * Data-access layer for ChatUser records. One row per User; tracks the
 * last-known device fingerprint + IP and the abuse flags used by the
 * admin moderation panel.
 */
export class ChatUserRepository {
  /**
   * Upsert the ChatUser row for an author. Refreshes the latest fingerprint
   * and IP on every send so the admin view always reflects the most recent
   * client used to chat.
   */
  static async upsert({ userId, fingerprint, ipAddress }: UpsertChatUserData) {
    return prisma.chatUser.upsert({
      where: { userId },
      update: { fingerprint, ipAddress },
      create: { userId, fingerprint, ipAddress },
    });
  }

  /** Look up a ChatUser by its parent User id. */
  static async findByUserId(userId: string) {
    return prisma.chatUser.findUnique({ where: { userId } });
  }

  /** Atomically bump the lifetime message count. */
  static async incrementMessageCount(userId: string) {
    return prisma.chatUser.update({
      where: { userId },
      data: { messageCount: { increment: 1 } },
    });
  }

  /** Set the abuse flag (used when a user approaches the rate-limit ceiling). */
  static async setFlagged(userId: string, flagged: boolean) {
    return prisma.chatUser.update({
      where: { userId },
      data: { flagged },
    });
  }

  /** Toggle the disabled gate. Admin-only. */
  static async setDisabled(userId: string, disabled: boolean) {
    return prisma.chatUser.update({
      where: { userId },
      data: { disabled },
    });
  }

  /**
   * Disable a user with full audit metadata (admin + reason + timestamp).
   * Used by the abuse-reporting moderation flow (010-chat-abuse-reporting)
   * so the admin who took the action and their stated reason are captured
   * alongside the boolean flip.
   */
  static async disableWithAudit({
    userId,
    adminId,
    reason,
  }: {
    userId: string;
    adminId: string;
    reason?: string;
  }) {
    return prisma.chatUser.update({
      where: { userId },
      data: {
        disabled: true,
        disabledAt: new Date(),
        disabledByAdminId: adminId,
        disabledReason: reason ?? null,
      },
    });
  }

  /**
   * Re-enable a previously disabled user. Clears all disable-audit
   * fields so a future disable starts from a clean slate; the audit
   * trail is preserved on the {@link AuditLog} feed, not on the row.
   */
  static async enableWithAudit(userId: string) {
    return prisma.chatUser.update({
      where: { userId },
      data: {
        disabled: false,
        disabledAt: null,
        disabledByAdminId: null,
        disabledReason: null,
      },
    });
  }

  /**
   * Page through all ChatUser rows for the admin moderation panel.
   * Joins the parent User to expose username/email columns.
   */
  static async findManyPaginated({ skip, take, sortBy, sortDirection }: FindManyPaginatedParams) {
    return prisma.chatUser.findMany({
      orderBy: { [sortBy]: sortDirection },
      skip,
      take,
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
      },
    });
  }

  /** Total ChatUser row count, used for the admin paginator. */
  static async count() {
    return prisma.chatUser.count();
  }
}
