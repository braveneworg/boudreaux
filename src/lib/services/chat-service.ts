/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatRateLimitLogRepository } from '@/lib/repositories/chat-rate-limit-log-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import {
  CHAT_FLAG_THRESHOLD,
  CHAT_RATE_LIMIT_PER_MINUTE,
  checkChatRateLimit,
} from '@/lib/utils/chat-rate-limit';
import { gravatarHash } from '@/lib/utils/gravatar-hash';
import { loggers } from '@/lib/utils/logger';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';
import { chatReactionsArraySchema, type ChatReactions } from '@/lib/validation/chat-message-schema';

import { ChatMentionService } from './chat-mention-service';

const logger = loggers.chat;

/** Public-facing chat message shape. Emails are never exposed — only the Gravatar hash. */
export interface ChatMessageDto {
  id: string;
  body: string;
  reactions: ChatReactions;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    gravatarHash: string;
    role?: string | null;
  };
  /**
   * Client-generated id echoed back when this message originated from
   * an optimistic send. The recipient uses it to dedupe the placeholder
   * against the persisted echo without false negatives on duplicate
   * bodies. Absent for messages broadcast to peer clients or fetched
   * from history.
   */
  tempId?: string;
  /** ISO timestamp when an admin pinned this message; null/absent when not pinned. */
  pinnedAt?: string | null;
}

export type SendChatMessageResult =
  | { success: true; data: ChatMessageDto }
  | { success: false; error: 'rate_limited'; retryAfterSeconds: number }
  | { success: false; error: 'disabled' };

export type ToggleReactionResult =
  | { success: true; data: ChatMessageDto }
  | { success: false; error: 'not_found' | 'disabled' };

export const MAX_PINNED_CHAT_MESSAGES = 3;

export type TogglePinResult =
  | { success: true; data: ChatMessageDto; pinned: boolean }
  | { success: false; error: 'not_found' | 'limit_reached' };

export interface ListChatMessagesParams {
  limit: number;
  cursor?: { createdAt: Date; id: string };
}

interface UserRow {
  id: string;
  username: string | null;
  email: string;
  role?: string | null;
}

const toDto = (
  message: {
    id: string;
    body: string;
    reactions: unknown;
    createdAt: Date;
    pinnedAt?: Date | null;
  },
  user: UserRow,
  tempId?: string
): ChatMessageDto => {
  const parsedReactions = chatReactionsArraySchema.safeParse(message.reactions);
  return {
    id: message.id,
    body: message.body,
    reactions: parsedReactions.success ? parsedReactions.data : [],
    createdAt: message.createdAt.toISOString(),
    pinnedAt: message.pinnedAt ? message.pinnedAt.toISOString() : null,
    user: {
      id: user.id,
      username: user.username,
      gravatarHash: gravatarHash(user.email),
      role: user.role ?? null,
    },
    ...(tempId ? { tempId } : {}),
  };
};

/**
 * Orchestration layer for chat reads, sends, and reaction toggles.
 * Auth checks live in the calling Server Action; this service trusts
 * its inputs and focuses on business rules + side effects.
 */
export class ChatService {
  /** Page through chat history. Returns DTOs in chronological order. */
  static async listRecent({ limit, cursor }: ListChatMessagesParams): Promise<ChatMessageDto[]> {
    const rows = await ChatMessageRepository.findRecent({ limit, cursor });
    const messages = rows
      .slice()
      .reverse()
      .map((row) => toDto(row, row.user));
    return messages;
  }

  /** Currently pinned admin announcements (newest pin first). */
  static async listPinned(): Promise<ChatMessageDto[]> {
    const rows = await ChatMessageRepository.findPinned();
    return rows.map((row) => toDto(row, row.user));
  }

  /**
   * Pin or unpin a message. Toggles on the message's current state.
   * Enforces the per-channel cap of `MAX_PINNED_CHAT_MESSAGES`.
   */
  static async togglePin({
    messageId,
    adminId,
  }: {
    messageId: string;
    adminId: string;
  }): Promise<TogglePinResult> {
    const target = await ChatMessageRepository.findById(messageId);
    if (!target) {
      return { success: false, error: 'not_found' };
    }

    if (target.pinnedAt) {
      const row = await ChatMessageRepository.unpin(messageId);
      return { success: true, data: toDto(row, row.user), pinned: false };
    }

    const count = await ChatMessageRepository.countPinned();
    if (count >= MAX_PINNED_CHAT_MESSAGES) {
      return { success: false, error: 'limit_reached' };
    }

    const row = await ChatMessageRepository.pin({ messageId, adminId });
    return { success: true, data: toDto(row, row.user), pinned: true };
  }

  /**
   * Send a new message after rate-limit + disabled-gate checks. Auto-flags
   * the sender when they approach the rate-limit ceiling so the admin
   * panel surfaces likely abusers before they get blocked.
   */
  static async sendMessage(params: {
    userId: string;
    email: string;
    body: string;
    fingerprint: string;
    ip: string;
    /** Client-supplied placeholder id; echoed back on the DTO + broadcast. */
    tempId?: string;
    /**
     * Defense-in-depth: set to `true` when the caller knows the user has an
     * active account ban (better-auth admin plugin `banned` flag). A full
     * account ban already revokes sessions, but this gate handles the
     * temporary-ban edge case and provides layered enforcement.
     */
    banned?: boolean;
  }): Promise<SendChatMessageResult> {
    // Defense-in-depth: block account-banned users even when a session is
    // still technically valid (e.g. temporary ban with a recent cookie cache).
    if (params.banned) {
      return { success: false, error: 'disabled' };
    }

    const existing = await ChatUserRepository.findByUserId(params.userId);
    if (existing?.disabled) {
      return { success: false, error: 'disabled' };
    }

    const limitResult = await checkChatRateLimit(params.userId, params.fingerprint, params.ip);

    if (!limitResult.success) {
      await ChatRateLimitLogRepository.logBreach({
        fingerprint: params.fingerprint,
        ipAddress: params.ip,
      });
      logger.warn('Chat rate limit exceeded', {
        module: 'CHAT',
        operation: 'sendMessage',
        userId: params.userId,
      });
      return {
        success: false,
        error: 'rate_limited',
        retryAfterSeconds: limitResult.retryAfterSeconds,
      };
    }

    await ChatUserRepository.upsert({
      userId: params.userId,
      fingerprint: params.fingerprint,
      ipAddress: params.ip,
    });

    const sendsInWindow = CHAT_RATE_LIMIT_PER_MINUTE - limitResult.remaining;
    if (sendsInWindow >= CHAT_FLAG_THRESHOLD && !existing?.flagged) {
      await ChatUserRepository.setFlagged(params.userId, true);
      logger.info('Chat user auto-flagged for review', {
        module: 'CHAT',
        operation: 'flag',
        userId: params.userId,
      });
    }

    const created = await ChatMessageRepository.create({
      userId: params.userId,
      body: params.body,
    });
    await ChatUserRepository.incrementMessageCount(params.userId);

    const dto = toDto(created, { ...created.user, email: params.email }, params.tempId);

    await triggerChatEvent(CHAT_EVENTS.newMessage, dto);

    // Fan out mention emails after persisting + broadcasting so a slow
    // SES dispatch can't delay the message hitting the channel. Errors
    // are swallowed inside notifyMentions — chat is the source of truth,
    // the email is best-effort.
    const recipients = await ChatMentionService.resolveMentions(params.body, params.userId);
    if (recipients.length > 0) {
      await ChatMentionService.notifyMentions({
        authorId: params.userId,
        authorUsername: created.user.username,
        messageBody: params.body,
        messageCreatedAt: created.createdAt.toISOString(),
        recipients,
      });
    }

    return { success: true, data: dto };
  }

  /**
   * Toggle the current user's reaction with the given emoji. Returns the
   * updated message.
   *
   * **Concurrency model**: Prisma's `update` is atomic at the *document*
   * level, but the read (`findById`) and the write (`setReactions`) are
   * separate round-trips, so two concurrent toggles on the same message
   * can interleave and the later writer's view of the array clobbers
   * any change the earlier writer made between read and write. The
   * outcome is at most one lost toggle per race; the array shape stays
   * valid. Acceptable for emoji reactions where every toggle is
   * idempotent at the user level (the same user retrying produces the
   * same final state) and aggregate counts are advisory rather than
   * load-bearing.
   *
   * If reaction integrity ever needs to be strict (e.g., paid voting),
   * move reactions into a separate `ChatReaction` model with a unique
   * `(messageId, userId, emoji)` index and toggle with `upsert` /
   * `deleteMany` — both are single-document operations.
   */
  static async toggleReaction(params: {
    messageId: string;
    userId: string;
    emoji: string;
  }): Promise<ToggleReactionResult> {
    const chatUser = await ChatUserRepository.findByUserId(params.userId);
    if (chatUser?.disabled) {
      return { success: false, error: 'disabled' };
    }

    const message = await ChatMessageRepository.findById(params.messageId);
    if (!message) {
      return { success: false, error: 'not_found' };
    }

    const parsed = chatReactionsArraySchema.safeParse(message.reactions);
    const current = parsed.success ? parsed.data : [];

    const existing = current.find((r) => r.emoji === params.emoji);
    let next: ChatReactions;

    if (existing) {
      const without = existing.userIds.filter((id) => id !== params.userId);
      if (without.length === existing.userIds.length) {
        // Add this user's vote
        next = current.map((r) =>
          r.emoji === params.emoji ? { ...r, userIds: [...r.userIds, params.userId] } : r
        );
      } else if (without.length === 0) {
        // Removed the last vote — drop the entry
        next = current.filter((r) => r.emoji !== params.emoji);
      } else {
        next = current.map((r) => (r.emoji === params.emoji ? { ...r, userIds: without } : r));
      }
    } else {
      next = [...current, { emoji: params.emoji, userIds: [params.userId] }];
    }

    await ChatMessageRepository.setReactions(params.messageId, next);

    const dto = toDto({ ...message, reactions: next }, message.user);
    await triggerChatEvent(CHAT_EVENTS.reactionUpdated, dto);

    return { success: true, data: dto };
  }
}
