/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { EMAIL_REGEX } from '@/lib/utils/auth/auth-utils';

const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;

export const CONTACT_REASONS = [
  { value: 'new-opportunity', label: 'New opportunity' },
  { value: 'licensing', label: 'Licensing & sync' },
  { value: 'press', label: 'Press & media inquiry' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'demo-submission', label: 'Demo submission' },
  { value: 'collaboration', label: 'Collaboration' },
  { value: 'question', label: 'Question' },
  { value: 'concern', label: 'Concern' },
  { value: 'general-feedback', label: 'General feedback' },
  { value: 'merchandise', label: 'Merchandise' },
  { value: 'other', label: 'Other' },
] as const;

const contactSchema = z.object({
  reason: z
    .string()
    .min(1, { message: 'Please select a reason for contacting us' })
    .refine((val) => CONTACT_REASONS.some((reason) => reason.value === val), {
      message: 'Please select a valid reason for contacting us',
    }),
  firstName: z
    .string()
    .min(1, { message: 'First name is required' })
    .max(50, { message: 'First name must be 50 characters or less' }),
  lastName: z
    .string()
    .min(1, { message: 'Last name is required' })
    .max(50, { message: 'Last name must be 50 characters or less' }),
  email: z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' }),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || PHONE_REGEX.test(val), {
      message: 'Invalid phone number',
    }),
  message: z
    .string()
    .min(10, { message: 'Please provide more detail (at least 10 characters)' })
    .max(5000, { message: 'Message must be 5000 characters or less' }),
  general: z.string().optional(),
});

export type ContactFormSchemaType = z.infer<typeof contactSchema>;

export default contactSchema;
