/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { passTurnstileChallenge } from '@/lib/auth/pass-turnstile-challenge';
import { setSignupConsentCookie } from '@/lib/auth/signup-consent';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';

export interface StashSignupConsentInput {
  /** Cloudflare Turnstile token captured by the widget. */
  turnstileToken: string;
  allowSmsNotifications: boolean;
  allowEmailNotifications: boolean;
}

export interface StashSignupConsentResult {
  success: boolean;
  error?: string;
}

/**
 * Called from the signup card right before `authClient.signIn.social`. Passes
 * the Turnstile challenge server-side — consuming the token and issuing the
 * gate cookie better-auth's before hook requires on `/sign-in/social` — and,
 * on success, stashes the chosen opt-ins in the consent cookie so better-auth's
 * `user.create.before` hook can persist them onto the new OAuth user. The
 * caller only invokes this once terms are accepted, so the consent cookie
 * always implies terms acceptance.
 */
export const stashSignupConsent = async (
  input: StashSignupConsentInput
): Promise<StashSignupConsentResult> => {
  const headersList = await headers();
  const ip = extractClientIpFromHeaders(headersList);

  const challenge = await passTurnstileChallenge({ turnstileToken: input.turnstileToken, ip });
  if (!challenge.success) {
    return challenge;
  }

  await setSignupConsentCookie({
    allowSmsNotifications: input.allowSmsNotifications,
    allowEmailNotifications: input.allowEmailNotifications,
  });

  return { success: true };
};
