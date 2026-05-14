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
          select: { id: true, username: true, email: true },
        },
      },
    });
  }

  /**
   * Page through the message history. Returns up to `limit` rows in
   * descending chronological order; the caller is responsible for
   * reversing into chat order.
   */
  static async findRecent({ limit, cursor }: FindRecentParams) {
    return prisma.chatMessage.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, email: true },
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
          select: { id: true, username: true, email: true },
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
}
