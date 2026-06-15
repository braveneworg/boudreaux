/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type { ChatMessageDto } from '@/lib/services/chat-service';

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const CHAT_BODY_MIN = 1;
const CHAT_BODY_MAX = 2000;
const FINGERPRINT_MIN = 8;
const FINGERPRINT_MAX = 64;
const EMOJI_MIN = 1;
const EMOJI_MAX = 16;

/**
 * Payload for sending a chat message. Fingerprint is captured client-side
 * via FingerprintJS and forwarded so the server can compose the rate-limit
 * key (`chat:{fingerprint}:{ip}`).
 */
export const sendChatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(CHAT_BODY_MIN, 'Message cannot be empty')
    .max(CHAT_BODY_MAX, `Message must be ${CHAT_BODY_MAX} characters or fewer`),
  fingerprint: z
    .string()
    .min(FINGERPRINT_MIN, 'Invalid device fingerprint')
    .max(FINGERPRINT_MAX, 'Invalid device fingerprint'),
  /**
   * Optional client-generated id for the optimistic placeholder. The
   * server echoes it back on the broadcast DTO so the client can match
   * the persisted message to its placeholder precisely — falls back to
   * user+body matching only when the field is absent (e.g., other tabs).
   */
  tempId: z.string().min(1).max(64).optional(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

/**
 * Payload for toggling an emoji reaction. Emoji is bounded to 16 chars
 * to admit ZWJ-joined sequences (e.g., family emojis) without admitting
 * pasted text blobs.
 */
export const chatReactionSchema = z.object({
  messageId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId'),
  emoji: z.string().min(EMOJI_MIN, 'Emoji cannot be empty').max(EMOJI_MAX, 'Emoji is too long'),
});

export type ChatReactionInput = z.infer<typeof chatReactionSchema>;

/**
 * Shape of the embedded `reactions` JSON column on ChatMessage.
 * Validated on every read because Prisma types JSON columns as `unknown`.
 * userIds are bound only to be non-empty — public input that becomes a
 * userId is already constrained by the auth layer (real session id) or
 * by `chatReactionSchema` on the way in.
 */
export const chatReactionsArraySchema = z.array(
  z.object({
    emoji: z.string().min(EMOJI_MIN).max(EMOJI_MAX),
    userIds: z.array(z.string().min(1)),
  })
);

export type ChatReactions = z.infer<typeof chatReactionsArraySchema>;

/**
 * Response shape for a single chat message as returned by the read API routes
 * (`ChatMessageDto`). Dates are ISO strings over the wire. Kept in sync with
 * `ChatMessageDto` via the `satisfies` guard below.
 */
export const chatMessageDtoSchema = z.object({
  id: z.string(),
  body: z.string(),
  reactions: chatReactionsArraySchema,
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string().nullable(),
    gravatarHash: z.string(),
    role: z.string().nullish(),
  }),
  tempId: z.string().optional(),
  pinnedAt: z.string().nullish(),
}) satisfies z.ZodType<ChatMessageDto>;
