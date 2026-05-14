/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';

export interface ChatUserAdminDto {
  id: string;
  userId: string;
  username: string | null;
  email: string;
  fingerprint: string;
  ipAddress: string;
  messageCount: number;
  flagged: boolean;
  disabled: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface ListChatUsersResult {
  rows: ChatUserAdminDto[];
  total: number;
  page: number;
  perPage: number;
}

export type ChatUsersSortBy = 'messageCount' | 'lastSeenAt';

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 100;

/** Admin-side service for moderating ChatUser records. */
export class ChatAdminService {
  /**
   * Page through ChatUser rows for the moderation table. Defaults to
   * `messageCount desc` so the highest-volume senders surface first.
   */
  static async listChatUsers({
    page,
    perPage,
    sortBy,
    sortDirection,
  }: {
    page: number;
    perPage: number;
    sortBy: ChatUsersSortBy;
    sortDirection: 'asc' | 'desc';
  }): Promise<ListChatUsersResult> {
    const safePerPage = Math.min(Math.max(perPage, 1), MAX_PER_PAGE);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safePerPage;

    const [rows, total] = await Promise.all([
      ChatUserRepository.findManyPaginated({
        skip,
        take: safePerPage,
        sortBy,
        sortDirection,
      }),
      ChatUserRepository.count(),
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        username: row.user.username,
        email: row.user.email,
        fingerprint: row.fingerprint,
        ipAddress: row.ipAddress,
        messageCount: row.messageCount,
        flagged: row.flagged,
        disabled: row.disabled,
        lastSeenAt: row.lastSeenAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: safePage,
      perPage: safePerPage,
    };
  }

  /** Toggle the disabled gate on a ChatUser. Bypasses the user via parent User id. */
  static async setDisabled(userId: string, disabled: boolean) {
    return ChatUserRepository.setDisabled(userId, disabled);
  }

  /** Clear the abuse flag after admin review. */
  static async clearFlag(userId: string) {
    return ChatUserRepository.setFlagged(userId, false);
  }
}

export { DEFAULT_PER_PAGE, MAX_PER_PAGE };
