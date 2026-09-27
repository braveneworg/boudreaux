/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

import { isValidEmailFormat } from '@/lib/utils/auth/auth-utils';
import { formBoolean } from '@/lib/validation/form-boolean';

const emailRegex = z
  .string()
  .refine((value) => isValidEmailFormat(value), { message: 'Invalid email address' });
const changeEmailShape = z.object({
  email: emailRegex,
  confirmEmail: emailRegex,
  previousEmail: z.string().optional(),
  // Email opt-in is surfaced next to the change-email controls so this form
  // can persist it too (the profile Save persists it as well).
  allowEmailNotifications: z.boolean().optional(),
});

const emailsMatch = ({ email, confirmEmail }: { email: string; confirmEmail: string }): boolean =>
  email === confirmEmail;

const emailsMatchIssue = { message: 'Email addresses do not match', path: ['confirmEmail'] };

export const changeEmailSchema = changeEmailShape.refine(emailsMatch, emailsMatchIssue);

/**
 * {@link changeEmailSchema} as `changeEmailAction` reads it from `FormData`,
 * where the opt-in switch arrives as `'true'`/`'false'`. The client schema
 * keeps plain `z.boolean()` because React Hook Form holds real booleans (#790).
 */
export const changeEmailActionSchema = changeEmailShape
  .extend({ allowEmailNotifications: formBoolean().optional() })
  .refine(emailsMatch, emailsMatchIssue);

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
