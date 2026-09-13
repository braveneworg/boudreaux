/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { sendChatMentionEmail } from '@/lib/email/send-chat-mention';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import { loggers } from '@/lib/utils/logger';
import { extractMentionUsernames } from '@/lib/utils/mention-parsing';
import { getRedisClient } from '@/lib/utils/upstash-redis';

import type { Redis } from '@upstash/redis';

const logger = loggers.chat;

/** Cap how many usernames we surface from the autocomplete search. */
const SEARCH_LIMIT = 8;

/**
 * Hard ceiling on mention emails to the same recipient. After an email
 * goes out we refuse to send another one for this many seconds — any
 * further mentions inside the window are buffered and folded into the
 * next email as a digest.
 */
const MENTION_EMAIL_THROTTLE_SECONDS = 60 * 60;

/**
 * Don't email a recipient who has sent a chat message within this window
 * — they're actively watching the conversation and would just see the
 * mention live. Compared against {@link ChatUser.lastSeenAt}.
 */
const ACTIVE_RECIPIENT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Upper bound on how long a buffered (un-sent) mention sticks around in
 * Redis before being dropped. Generously longer than the throttle so a
 * chatty hour still produces a single digest, but short enough that
 * stale mentions don't linger across days.
 */
const MENTION_BUFFER_TTL_SECONDS = 60 * 60 * 24;

/** Hard cap on how many mention entries we'll digest in a single email. */
const MENTION_BUFFER_MAX_ENTRIES = 25;

export interface MentionUser {
  id: string;
  username: string;
  email: string;
}

export interface MentionMatch {
  id: string;
  username: string;
}

interface BufferedMention {
  authorUsername: string;
  body: string;
  createdAt: string;
}

const throttleKey = (recipientId: string): string => `chat:mention-throttle:${recipientId}`;
const bufferKey = (recipientId: string): string => `chat:mention-pending:${recipientId}`;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The Redis client, or `null` (after a warn) when Upstash is not configured.
 * Mention emails are best-effort; a missing client must never reject the
 * chat send that triggered them.
 */
const acquireRedis = (): Redis | null => {
  try {
    return getRedisClient();
  } catch (error) {
    logger.warn('Chat mention emails skipped — Redis unavailable', {
      module: 'CHAT',
      operation: 'notifyMentions',
      error: describeError(error),
    });
    return null;
  }
};

/** True when the recipient chatted within {@link ACTIVE_RECIPIENT_WINDOW_MS}. */
const isRecipientActive = async (recipientId: string): Promise<boolean> => {
  const recipientChatUser = await ChatUserRepository.findByUserId(recipientId);
  if (!recipientChatUser) return false;
  return Date.now() - recipientChatUser.lastSeenAt.getTime() < ACTIVE_RECIPIENT_WINDOW_MS;
};

/**
 * Throttle slot claimed: drain the buffer, append the current mention, and
 * send one email. If the send throws or returns false, push the entries
 * back and release the throttle so the next mention retries the flush.
 */
const flushAndEmail = async (
  redis: Redis,
  recipient: MentionUser,
  current: BufferedMention
): Promise<void> => {
  const tKey = throttleKey(recipient.id);
  const bKey = bufferKey(recipient.id);

  const buffered = await redis.lrange<string>(bKey, 0, -1);
  await redis.del(bKey);

  const previous = buffered
    .map((entry) => parseBufferedMention(entry))
    .filter((m): m is BufferedMention => m !== null);
  const mentions = [...previous, current].slice(-MENTION_BUFFER_MAX_ENTRIES);

  try {
    const sent = await sendChatMentionEmail({
      toEmail: recipient.email,
      recipientUsername: recipient.username,
      mentions,
    });
    if (!sent) {
      throw new Error('Chat mention email send returned false');
    }
  } catch (error) {
    // Re-buffer so the next mention can retry, and release the throttle so
    // the next mention is the one that flushes. `mentions` always contains
    // the current mention, so the push is unconditional.
    await redis.del(tKey);
    await redis.rpush(bKey, ...mentions.map((m) => JSON.stringify(m)));
    await redis.expire(bKey, MENTION_BUFFER_TTL_SECONDS);
    logger.error('Chat mention email failed', {
      module: 'CHAT',
      operation: 'notifyMentions',
      userId: recipient.id,
      error: describeError(error),
    });
  }
};

/**
 * One recipient's notification: skip if active, claim the hourly slot,
 * then either buffer (slot held) or flush + email (slot claimed). Every
 * Redis call sits inside this function so the caller can catch a Redis
 * failure per recipient.
 */
const notifyRecipient = async (
  redis: Redis,
  recipient: MentionUser,
  current: BufferedMention
): Promise<void> => {
  if (await isRecipientActive(recipient.id)) {
    logger.info('Chat mention email suppressed — recipient active', {
      module: 'CHAT',
      operation: 'notifyMentions',
      userId: recipient.id,
    });
    return;
  }

  const claimed = await redis.set(throttleKey(recipient.id), '1', {
    nx: true,
    ex: MENTION_EMAIL_THROTTLE_SECONDS,
  });

  if (!claimed) {
    // Throttle is held — buffer this mention for the next flush.
    const bKey = bufferKey(recipient.id);
    await redis.rpush(bKey, JSON.stringify(current));
    await redis.expire(bKey, MENTION_BUFFER_TTL_SECONDS);
    logger.info('Chat mention buffered for digest', {
      module: 'CHAT',
      operation: 'notifyMentions',
      userId: recipient.id,
    });
    return;
  }

  await flushAndEmail(redis, recipient, current);
};

/**
 * Redis is the throttle and the digest buffer; without it we cannot bound
 * emails per recipient, so the safe failure is to send nothing. Emailing on
 * "could not claim the throttle" would turn an outage into unbounded SES
 * sends — a cost and harassment vector exactly when the control is gone.
 */
const skipRecipientOnRedisError = (recipientId: string, error: unknown): void => {
  logger.warn('Chat mention email skipped — Redis unavailable', {
    module: 'CHAT',
    operation: 'notifyMentions',
    userId: recipientId,
    error: describeError(error),
  });
};

export class ChatMentionService {
  /**
   * Username autocomplete for the chat composer. Prefix search; returns
   * up to {@link SEARCH_LIMIT} non-null usernames excluding the caller.
   */
  static async searchByPrefix(prefix: string, excludeUserId: string): Promise<MentionMatch[]> {
    const trimmed = prefix.trim();
    if (trimmed.length === 0) return [];

    const rows = await UserRepository.searchByUsernamePrefix(trimmed, excludeUserId, SEARCH_LIMIT);

    return rows
      .filter((row): row is { id: string; username: string } => row.username !== null)
      .map((row) => ({ id: row.id, username: row.username }));
  }

  /**
   * Resolve `@username` tokens in a message body to known users. Returns
   * the matching User rows; usernames with no matching account are
   * silently dropped (they'll render as styled `@text` for everyone but
   * produce no email).
   *
   * The author is excluded — self-mentions don't trigger a notification.
   */
  static async resolveMentions(body: string, authorId: string): Promise<MentionUser[]> {
    const usernames = extractMentionUsernames(body);
    if (usernames.length === 0) return [];

    const rows = await UserRepository.findByUsernames(usernames, authorId);

    return rows
      .filter(
        (row): row is { id: string; username: string; email: string } =>
          row.username !== null && row.email !== null
      )
      .map((row) => ({ id: row.id, username: row.username, email: row.email }));
  }

  /**
   * Dispatch mention notification emails for the supplied recipients.
   *
   * Per-recipient flow:
   *   1. Skip the whole recipient if `ChatUser.lastSeenAt` is within
   *      {@link ACTIVE_RECIPIENT_WINDOW_MS} — they're chatting now.
   *   2. Try to claim the 1-hour throttle slot.
   *      - Claimed: pop the buffer, append the current mention, send
   *        an email. If the email send throws, push the entries back
   *        and release the throttle so the next mention can retry.
   *      - Not claimed: append the current mention to the buffer so a
   *        later mention (after the throttle expires) can flush it as
   *        part of a digest.
   *
   * Never rejects. The message is already persisted and broadcast by the
   * time this runs, so a Redis or SES failure is logged and that
   * recipient's notification is dropped; other recipients still proceed.
   */
  static async notifyMentions(params: {
    authorId: string;
    authorUsername: string | null;
    messageBody: string;
    messageCreatedAt?: string;
    recipients: MentionUser[];
  }): Promise<void> {
    if (params.recipients.length === 0) return;

    const redis = acquireRedis();
    if (!redis) return;

    const authorUsername = params.authorUsername ?? 'Someone';
    const createdAt = params.messageCreatedAt ?? new Date().toISOString();
    const current: BufferedMention = {
      authorUsername,
      body: params.messageBody,
      createdAt,
    };

    await Promise.all(
      params.recipients.map((recipient) =>
        notifyRecipient(redis, recipient, current).catch((error: unknown) =>
          skipRecipientOnRedisError(recipient.id, error)
        )
      )
    );
  }
}

const parseBufferedMention = (raw: string): BufferedMention | null => {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as BufferedMention).authorUsername === 'string' &&
      typeof (parsed as BufferedMention).body === 'string' &&
      typeof (parsed as BufferedMention).createdAt === 'string'
    ) {
      return parsed as BufferedMention;
    }
    return null;
  } catch {
    return null;
  }
};
