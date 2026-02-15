/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as z from 'zod';

const username = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Invalid username. You can only use letters, numbers, underscores, and dashes.',
  });
const changeUsernameSchema = z
  .object({
    username,
    confirmUsername: z.string(),
  })
  .refine((data) => data.username === data.confirmUsername, {
    message: 'Usernames do not match',
    path: ['confirmUsername'],
  });

export default changeUsernameSchema;

export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
