/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/** ~2 concatenated GSM-7 segments; pragmatic cost cap. */
export const SMS_BLAST_MESSAGE_MAX = 320;

export const smsBlastSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(SMS_BLAST_MESSAGE_MAX, `Message must be ${SMS_BLAST_MESSAGE_MAX} characters or fewer`),
});

export type SmsBlastFormData = z.infer<typeof smsBlastSchema>;
