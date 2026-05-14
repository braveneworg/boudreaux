/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

/**
 * Admin patch payload for a ChatUser. The target User id is validated
 * up front so a malformed value surfaces as a structured `invalid`
 * error rather than a 500 from Prisma's ObjectId cast. Either toggle
 * the `disabled` flag or clear the abuse `flagged` marker — at least
 * one of those two must be set.
 */
export const updateChatUserSchema = z
  .object({
    userId: z.string().regex(OBJECT_ID_REGEX, 'Must be a valid ObjectId'),
    disabled: z.boolean().optional(),
    clearFlag: z.boolean().optional(),
  })
  .refine((data) => data.disabled !== undefined || data.clearFlag !== undefined, {
    message: 'Must provide at least one of: disabled, clearFlag',
  });

export type UpdateChatUserInput = z.infer<typeof updateChatUserSchema>;
