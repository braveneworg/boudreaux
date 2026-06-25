/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { auth } from '@/lib/auth';
import {
  AbuseReportRepository,
  type ReportedUserSummary,
} from '@/lib/repositories/abuse-report-repository';
import { BannedIdentityRepository } from '@/lib/repositories/banned-identity-repository';
import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { loggers } from '@/lib/utils/logger';

const logger = loggers.chat;

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

  /**
   * Disable a user with full audit metadata. Used by the abuse-reporting
   * flow so the admin who took the action and their stated reason are
   * captured. Re-enable later with {@link enableChatUser}.
   */
  static async disableChatUser({
    userId,
    adminId,
    reason,
  }: {
    userId: string;
    adminId: string;
    reason?: string;
  }) {
    return ChatUserRepository.disableWithAudit({ userId, adminId, reason });
  }

  /** Clear the disable. Messages hidden as a consequence of the disable
   * become visible again automatically (the public chat query filters
   * out messages whose author is currently disabled). Messages hidden
   * by `admin_flagged` stay hidden. */
  static async enableChatUser(userId: string) {
    return ChatUserRepository.enableWithAudit(userId);
  }

  /** Clear the abuse flag after admin review. */
  static async clearFlag(userId: string) {
    return ChatUserRepository.setFlagged(userId, false);
  }

  /**
   * Returns one skip/offset page of reported users for the moderation table's
   * default view, newest report first. Pass `windowDays: null` for all-time.
   *
   * The case-insensitive username/email `search` is pushed into the repository's
   * `groupBy` query (filtered via the `reportedUser` relation), so searching no
   * longer fetches the full reported-user set. The repository returns a grouped,
   * globally-sorted array — bounded by the number of distinct reported users —
   * which a MongoDB `groupBy` cannot page cleanly at the DB, so the skip/take
   * slice is applied here. Report volume is small, so this is acceptable.
   */
  static async listReportedUsers({
    windowDays = null,
    search,
    skip = 0,
    take = 24,
  }: {
    windowDays?: number | null;
    search?: string;
    skip?: number;
    take?: number;
  } = {}): Promise<{ rows: ReportedUserSummary[]; nextSkip: number | null }> {
    const matches = await AbuseReportRepository.listReportedUsers({ windowDays, search });

    const rows = matches.slice(skip, skip + take);
    const nextSkip = skip + take < matches.length ? skip + take : null;

    return { rows, nextSkip };
  }

  /** Per-message admin hide (stays hidden even after author re-enable). */
  static async hideMessage({ messageId, adminId }: { messageId: string; adminId: string }) {
    return ChatMessageRepository.hideAsAdminFlagged({ messageId, adminId });
  }

  /** Per-message admin unhide. */
  static async unhideMessage(messageId: string) {
    return ChatMessageRepository.unhide(messageId);
  }

  /**
   * Hide every visible message authored by `userId`. Returns the ids
   * that were hidden so the caller can broadcast a deletion event per
   * row to every connected chat client.
   */
  static async hideAllMessagesByUser({
    userId,
    adminId,
  }: {
    userId: string;
    adminId: string;
  }): Promise<string[]> {
    const visible = await ChatMessageRepository.findVisibleIdsByUser(userId);
    if (visible.length === 0) return [];
    await ChatMessageRepository.hideAllByUserAsAdminFlagged({ userId, adminId });
    return visible.map((row) => row.id);
  }

  /**
   * Paginated message history for the per-user admin detail view.
   * Returns messages newest-first regardless of hide status so admins
   * can review the full record.
   */
  static async listUserMessages({
    userId,
    skip,
    take,
  }: {
    userId: string;
    skip: number;
    take: number;
  }) {
    return ChatMessageRepository.findByUserIdForAdmin({ userId, skip, take });
  }

  /**
   * Ban an identity — creates a {@link BannedIdentity} evasion record AND, when a
   * `userId` is present, calls the better-auth admin plugin to block sign-in and
   * revoke existing sessions. When only email/fingerprint are known (no account to
   * target), the account-ban step is skipped and only the evasion record is stored.
   *
   * @param banDurationSeconds - Optional temporary ban duration in seconds.
   *   Omitted = permanent. Forwarded as `banExpiresIn` to the admin plugin.
   * @param adminHeaders - The admin's request headers, required by the
   *   better-auth admin API to authenticate the caller.
   */
  static async banIdentity({
    userId,
    email,
    fingerprintHash,
    adminId,
    reason,
    banDurationSeconds,
    adminHeaders,
  }: {
    userId?: string | null;
    email: string;
    fingerprintHash?: string | null;
    adminId: string;
    reason?: string;
    banDurationSeconds?: number;
    adminHeaders: Headers;
  }) {
    const ban = await BannedIdentityRepository.create({
      userId: userId ?? null,
      email,
      fingerprintHash: fingerprintHash ?? null,
      bannedByAdminId: adminId,
      reason: reason ?? null,
    });

    // Account-ban via the better-auth admin plugin: blocks sign-in + revokes
    // existing sessions. Skipped when there is no userId (email/fingerprint-only
    // ban — no account to target).
    if (userId) {
      await auth.api.banUser({
        body: {
          userId,
          banReason: reason,
          ...(banDurationSeconds !== undefined ? { banExpiresIn: banDurationSeconds } : {}),
        },
        headers: adminHeaders,
      });
      logger.info('Account ban applied via admin plugin', {
        module: 'CHAT',
        operation: 'banIdentity',
        userId,
        adminId,
        banDurationSeconds,
      });
    }

    return ban;
  }

  /** Lift a ban. */
  static async unbanIdentity(banId: string) {
    return BannedIdentityRepository.unban(banId);
  }
}

export { DEFAULT_PER_PAGE, MAX_PER_PAGE };
