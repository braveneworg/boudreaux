/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ChatReactions } from '@/lib/validation/chat-message-schema';

interface CreateChatMessageData {
  userId: string;
  body: string;
}

interface FindRecentParams {
  limit: number;
  cursor?: { createdAt: Date; id: string };
}

/**
 * Data-access layer for ChatMessage records.
 * Cursor pagination uses `createdAt` desc with `id` as a stable tiebreaker
 * so that millisecond-collision messages are not returned twice.
 */
export class ChatMessageRepository {
  /** Create a new chat message for the given author. */
  static async create(data: CreateChatMessageData) {
    return prisma.chatMessage.create({
      data: {
        userId: data.userId,
        body: data.body,
        reactions: [],
      },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
      },
    });
  }

  /**
   * Page through the message history for public chat. Returns up to
   * `limit` rows in descending chronological order; the caller is
   * responsible for reversing into chat order.
   *
   * Abuse-reporting filter (010): rows are excluded when either
   * (a) the message itself is hidden (`hiddenAt` is set), or
   * (b) the author is currently `disabled`. We rely on the
   * `disabled` relation rather than denormalizing into ChatMessage so
   * re-enabling a user automatically un-hides their messages with no
   * batch update — the soft-hide is a read-time predicate, not a write.
   * Messages with `hiddenReason: "admin_flagged"` stay hidden because
   * they have their own `hiddenAt` stamp.
   */
  static async findRecent({ limit, cursor }: FindRecentParams) {
    const cursorAnd = cursor
      ? [
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          },
        ]
      : [];

    // Active-ban predicate: a BannedIdentity is active when `unbannedAt`
    // is null OR the field is absent from the document. Prisma MongoDB
    // equality on `null` does not match missing fields, so both cases
    // must be enumerated.
    const activeBan = { OR: [{ unbannedAt: null }, { unbannedAt: { isSet: false } }] };

    return prisma.chatMessage.findMany({
      where: {
        AND: [
          ...cursorAnd,
          // hiddenAt may be absent on legacy rows; same null-vs-absent quirk.
          { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
          {
            user: {
              is: {
                chatUsers: { none: { disabled: true } },
                bannedIdentities: { none: activeBan },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
      },
    });
  }

  /**
   * Find a single message by id, including the author's chat-display
   * fields. Used by the reaction-toggle path so the service can build a
   * DTO without a second `User` lookup.
   */
  static async findById(id: string) {
    return prisma.chatMessage.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, email: true, role: true },
        },
      },
    });
  }

  /** Fetch all messages authored by a single user — used by admin moderation. */
  static async findByUserId({
    userId,
    skip,
    take,
  }: {
    userId: string;
    skip: number;
    take: number;
  }) {
    return prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Overwrite the reactions array. Last-write-wins; concurrent reacts
   * may clobber each other but the operation is idempotent at the
   * `toggle` level since the caller computes the new array first.
   */
  static async setReactions(id: string, reactions: ChatReactions) {
    return prisma.chatMessage.update({
      where: { id },
      data: { reactions },
    });
  }

  /**
   * Per-message hide flagged by an admin. Stamps `hiddenReason =
   * "admin_flagged"` so re-enabling the author does NOT unhide it
   * (only `user_disabled` hides clear automatically).
   */
  static async hideAsAdminFlagged({ messageId, adminId }: { messageId: string; adminId: string }) {
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        hiddenAt: new Date(),
        hiddenByAdminId: adminId,
        hiddenReason: 'admin_flagged',
      },
    });
  }

  /** Pin a message. The action layer enforces the 3-message cap. */
  static async pin({ messageId, adminId }: { messageId: string; adminId: string }) {
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedByAdminId: adminId },
      include: { user: { select: { id: true, username: true, email: true, role: true } } },
    });
  }

  /** Unpin a message. */
  static async unpin(messageId: string) {
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedByAdminId: null },
      include: { user: { select: { id: true, username: true, email: true, role: true } } },
    });
  }

  /**
   * Currently pinned messages, newest pin first. Excludes hidden rows so
   * a hide/unpin race resolves consistently for every client.
   */
  static async findPinned() {
    return prisma.chatMessage.findMany({
      where: {
        AND: [
          { OR: [{ pinnedAt: { not: null } }] },
          { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
        ],
      },
      orderBy: [{ pinnedAt: 'desc' }],
      include: { user: { select: { id: true, username: true, email: true, role: true } } },
    });
  }

  /** Count of currently pinned messages. Used to enforce the 3-pin cap. */
  static async countPinned(): Promise<number> {
    return prisma.chatMessage.count({
      where: {
        AND: [
          { pinnedAt: { not: null } },
          { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
        ],
      },
    });
  }

  /**
   * Bulk admin hide for every message authored by a single user. Used by
   * the in-chat "delete all messages by <user>" moderator action. Only
   * touches rows that are not already hidden so prior `admin_flagged`
   * stamps (with their own `hiddenByAdminId`) are preserved.
   */
  static async hideAllByUserAsAdminFlagged({
    userId,
    adminId,
  }: {
    userId: string;
    adminId: string;
  }) {
    return prisma.chatMessage.updateMany({
      where: {
        userId,
        OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }],
      },
      data: {
        hiddenAt: new Date(),
        hiddenByAdminId: adminId,
        hiddenReason: 'admin_flagged',
      },
    });
  }

  /**
   * Return the ids of every non-hidden message authored by a user. Used
   * after a bulk hide to tell connected clients which rows to drop.
   */
  static async findVisibleIdsByUser(userId: string) {
    return prisma.chatMessage.findMany({
      where: {
        userId,
        OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }],
      },
      select: { id: true },
    });
  }

  /** Clear an `admin_flagged` hide. Admin-initiated unhide. */
  static async unhide(messageId: string) {
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        hiddenAt: null,
        hiddenByAdminId: null,
        hiddenReason: null,
      },
    });
  }

  /**
   * Paginated, admin-only view of every message authored by a user,
   * including hidden ones. Newest first. Used by the per-user detail
   * page in the admin moderation panel.
   */
  static async findByUserIdForAdmin({
    userId,
    skip,
    take,
  }: {
    userId: string;
    skip: number;
    take: number;
  }) {
    return prisma.chatMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }
}
