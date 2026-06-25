/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { backfillUsername, type UsernameBackfillInput } from '@/lib/auth/backfill-username-hook';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';

/**
 * better-auth `user.create.before` hook. Aborts creation (returns `false`) when
 * signups are paused — the only enforcement point for OAuth first sign-in and
 * `/signin` unknown-email auto-create. Otherwise backfills a unique username.
 */
export const userCreateBeforeHook = async <InputType extends UsernameBackfillInput>(
  user: InputType
): Promise<false | { data: Omit<InputType, 'username'> & { username: string } }> =>
  (await SignupSettingsService.areSignupsPaused()) ? false : backfillUsername(user);
