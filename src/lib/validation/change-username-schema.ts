/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

import { username } from './primitives';

export const changeUsernameSchema = z
  .object({
    username,
    confirmUsername: z.string(),
  })
  .refine((data) => data.username === data.confirmUsername, {
    message: 'Usernames do not match',
    path: ['confirmUsername'],
  });

export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
