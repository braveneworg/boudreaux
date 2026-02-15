/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type changeEmailSchema from '@/lib/validation/change-email-schema';
import type changeUsernameSchema from '@/lib/validation/change-username-schema';
import type profileSchema from '@/lib/validation/profile-schema';

import type { z } from 'zod';

export type ProfileFormData = z.infer<typeof profileSchema>;
export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
export type ChangeUsernameFormData = z.infer<typeof changeUsernameSchema>;
