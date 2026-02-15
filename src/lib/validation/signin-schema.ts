/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

import { EMAIL_REGEX } from '@/lib/utils/auth/auth-utils';

const formSchema = z.object({
  email: z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' }),
  general: z.string().optional(),
});

export type FormSchemaType = z.infer<typeof formSchema>;

export default formSchema;
