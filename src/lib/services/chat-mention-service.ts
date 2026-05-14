/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { sendChatMentionEmail } from '@/lib/email/send-chat-mention';
import { prisma } from '@/lib/prisma';
import { loggers } from '@/lib/utils/logger';
import { extractMentionUsernames } from '@/lib/utils/mention-parsing';
import { getRedisClient } from '@/lib/utils/upstash-redis';

const logger = loggers.chat;

/** Cap how many usernames we surface from the autocomplete search. */
const SEARCH_LIMIT = 8;

/**
 * Suppression window between mention emails from the same author to the
 * same recipient. Keeps a chatty conversation from generating an email
 * per @mention while still notifying on fresh mentions across sessions.
 */
const MENTION_EMAIL_THROTTLE_SECONDS = 300;

export interface MentionUser {
  id: string;
  username: string;
  email: string;
}

export interface MentionMatch {
  id: string;
  username: string;
}

export class ChatMentionService {
  /**
   * Username autocomplete for the chat composer. Prefix search; returns
   * up to {@link SEARCH_LIMIT} non-null usernames excluding the caller.
   */
  static async searchByPrefix(prefix: string, excludeUserId: string): Promise<MentionMatch[]> {
    const trimmed = prefix.trim();
    if (trimmed.length === 0) return [];

    const rows = await prisma.user.findMany({
      where: {
        username: {
          startsWith: trimmed,
          mode: 'insensitive',
        },
        NOT: { id: excludeUserId },
      },
      select: { id: true, username: true },
      take: SEARCH_LIMIT,
      orderBy: { username: 'asc' },
    });

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

    const rows = await prisma.user.findMany({
      where: {
        username: { in: usernames, mode: 'insensitive' },
        NOT: { id: authorId },
      },
      select: { id: true, username: true, email: true },
    });

    return rows
      .filter(
        (row): row is { id: string; username: string; email: string } =>
          row.username !== null && row.email !== null
      )
      .map((row) => ({ id: row.id, username: row.username, email: row.email }));
  }

  /**
   * Dispatch mention notification emails for the supplied recipients,
   * respecting the per-author/per-recipient throttle so a single chatty
   * thread can't fan out into an email storm.
   */
  static async notifyMentions(params: {
    authorId: string;
    authorUsername: string | null;
    messageBody: string;
    recipients: MentionUser[];
  }): Promise<void> {
    if (params.recipients.length === 0) return;

    const redis = getRedisClient();

    await Promise.all(
      params.recipients.map(async (recipient) => {
        const key = `chat:mention-throttle:${params.authorId}:${recipient.id}`;
        // SET key value NX EX <ttl> — atomic "claim if absent".
        const claimed = await redis.set(key, '1', {
          nx: true,
          ex: MENTION_EMAIL_THROTTLE_SECONDS,
        });
        if (!claimed) {
          logger.info('Chat mention email throttled', {
            module: 'CHAT',
            operation: 'notifyMentions',
            userId: recipient.id,
          });
          return;
        }
        try {
          await sendChatMentionEmail({
            toEmail: recipient.email,
            recipientUsername: recipient.username,
            authorUsername: params.authorUsername ?? 'Someone',
            messageBody: params.messageBody,
          });
        } catch (error) {
          // Release the slot so the next mention has a chance to retry.
          await redis.del(key);
          logger.error('Chat mention email failed', {
            module: 'CHAT',
            operation: 'notifyMentions',
            userId: recipient.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  }
}
