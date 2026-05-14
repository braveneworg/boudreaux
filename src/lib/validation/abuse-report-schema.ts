/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const USERNAME_MAX = 64;

/**
 * Payload for the public "Report abuse (anonymously)" submission.
 *
 * Anonymity is enforced server-side: the action ignores any client-
 * supplied reporter identity and uses the auth session instead. We
 * accept only the target username here.
 */
export const submitAbuseReportSchema = z.object({
  reportedUsername: z
    .string()
    .trim()
    .min(1, 'Username is required')
    .max(USERNAME_MAX, `Username must be ${USERNAME_MAX} characters or fewer`),
});

export type SubmitAbuseReportInput = z.infer<typeof submitAbuseReportSchema>;

/**
 * Admin action: disable a user from chat with audit metadata. The
 * `reason` is optional but encouraged — it shows up in the admin
 * audit log and is hashed into the disable record for future review.
 */
export const disableChatUserSchema = z.object({
  userId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId'),
  reason: z.string().trim().max(500).optional(),
});

export type DisableChatUserInput = z.infer<typeof disableChatUserSchema>;

export const enableChatUserSchema = z.object({
  userId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId'),
});

export type EnableChatUserInput = z.infer<typeof enableChatUserSchema>;

/** Admin action: per-message hide/unhide. */
export const toggleMessageHiddenSchema = z.object({
  messageId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId'),
  hidden: z.boolean(),
});

export type ToggleMessageHiddenInput = z.infer<typeof toggleMessageHiddenSchema>;

/** Admin action: ban an identity (email + optional fingerprint). */
export const banIdentitySchema = z.object({
  userId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId').nullish(),
  email: z.string().trim().toLowerCase().email('Must be a valid email'),
  fingerprintHash: z.string().min(1).max(128).nullish(),
  reason: z.string().trim().max(500).optional(),
});

export type BanIdentityInput = z.infer<typeof banIdentitySchema>;
