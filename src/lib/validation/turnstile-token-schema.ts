/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Cloudflare documents Turnstile tokens as at most 2048 characters; anything
 * longer never came from the widget.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

export const turnstileTokenSchema = z
  .string()
  .min(1, 'Complete the verification challenge first.')
  .max(TURNSTILE_TOKEN_MAX_LENGTH, 'Invalid verification. Please try again.');

export const confirmTurnstileInputSchema = z.object({
  turnstileToken: turnstileTokenSchema,
});

export type ConfirmTurnstileInput = z.infer<typeof confirmTurnstileInputSchema>;
