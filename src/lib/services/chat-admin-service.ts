/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  AbuseReportRepository,
  type ReportedUserSummary,
} from '@/lib/repositories/abuse-report-repository';
import { BannedIdentityRepository } from '@/lib/repositories/banned-identity-repository';
import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
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
   * Group abuse reports by target for the moderation table's default
   * "reported users" view. Pass `windowDays: null` for all-time.
   */
  static async listReportedUsers(windowDays: number | null = null): Promise<ReportedUserSummary[]> {
    return AbuseReportRepository.listReportedUsers({ windowDays });
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

  /** Add a ban record (used after disabling repeat offenders). */
  static async banIdentity({
    userId,
    email,
    fingerprintHash,
    adminId,
    reason,
  }: {
    userId?: string | null;
    email: string;
    fingerprintHash?: string | null;
    adminId: string;
    reason?: string;
  }) {
    return BannedIdentityRepository.create({
      userId: userId ?? null,
      email,
      fingerprintHash: fingerprintHash ?? null,
      bannedByAdminId: adminId,
      reason: reason ?? null,
    });
  }

  /** Lift a ban. */
  static async unbanIdentity(banId: string) {
    return BannedIdentityRepository.unban(banId);
  }
}

export { DEFAULT_PER_PAGE, MAX_PER_PAGE };
