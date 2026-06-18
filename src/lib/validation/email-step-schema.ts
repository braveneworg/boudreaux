/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { isValidEmailFormat } from '@/lib/utils/auth/auth-utils';

export const emailStepSchema = z.object({
  email: z
    .string()
    .refine((value) => isValidEmailFormat(value), { message: 'Invalid email address' }),
  termsAndConditions: z
    .boolean({ message: 'You must accept the terms and conditions' })
    .refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
});

export type EmailStepFormSchemaType = z.infer<typeof emailStepSchema>;
