/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

// More robust email validation
// Regex that prevents consecutive dots in local part and requires domain extension
const EMAIL_REGEX =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const emailRegex = z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' });
const changeEmailSchema = z
  .object({
    email: emailRegex,
    confirmEmail: emailRegex,
    previousEmail: z.string().optional(),
  })
  .refine((data) => data.email === data.confirmEmail, {
    message: 'Email addresses do not match',
    path: ['confirmEmail'],
  });

export default changeEmailSchema;

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
