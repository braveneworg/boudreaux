/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { backfillUsername, type UsernameBackfillInput } from '@/lib/auth/backfill-username-hook';
import { readAndClearSignupConsent } from '@/lib/auth/signup-consent';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';

/**
 * better-auth `user.create.before` hook. Aborts creation (returns `false`) when
 * signups are paused — the only enforcement point for OAuth first sign-in and
 * `/signin` unknown-email auto-create. Otherwise backfills a unique username.
 *
 * For a social OAuth signup, the agreements the user accepted on the signup card
 * were stashed in the consent cookie before the redirect (see
 * `stashSignupConsent`); apply them here so terms acceptance and the SMS/email
 * opt-ins persist the same way they do on the magic-link path. The magic-link
 * `/signin` auto-create and returning users carry no cookie, so consent is
 * `null` and nothing is applied.
 */
export const userCreateBeforeHook = async <InputType extends UsernameBackfillInput>(
  user: InputType
): Promise<false | { data: Record<string, unknown> }> => {
  if (await SignupSettingsService.areSignupsPaused()) {
    return false;
  }

  const { data } = backfillUsername(user);

  const consent = await readAndClearSignupConsent();
  if (!consent) {
    return { data };
  }

  return {
    data: {
      ...data,
      termsAndConditions: true,
      termsAcceptedAt: consent.termsAcceptedAt,
      allowSmsNotifications: consent.allowSmsNotifications,
      allowEmailNotifications: consent.allowEmailNotifications,
    },
  };
};
