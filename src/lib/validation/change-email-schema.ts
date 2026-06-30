/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

import { isValidEmailFormat } from '@/lib/utils/auth/auth-utils';

const emailRegex = z
  .string()
  .refine((value) => isValidEmailFormat(value), { message: 'Invalid email address' });
export const changeEmailSchema = z
  .object({
    email: emailRegex,
    confirmEmail: emailRegex,
    previousEmail: z.string().optional(),
    // Email opt-in is surfaced next to the change-email controls so this form
    // can persist it too (the profile Save persists it as well).
    allowEmailNotifications: z.boolean().optional(),
  })
  .refine((data) => data.email === data.confirmEmail, {
    message: 'Email addresses do not match',
    path: ['confirmEmail'],
  });

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
