/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { SignupSettingsService } from '@/lib/services/signup-settings-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { signupsPausedSchema } from '@/lib/validation/signups-paused-schema';

export type SetSignupsPausedActionResult =
  | { success: true }
  | { success: false; error: 'unauthorized' | 'invalid' };

export const setSignupsPausedAction = async (input: {
  paused: boolean;
}): Promise<SetSignupsPausedActionResult> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = signupsPausedSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: 'invalid' };
  }

  await SignupSettingsService.setSignupsPaused(parsed.data.paused);
  revalidatePath('/admin/settings');

  return { success: true };
};
