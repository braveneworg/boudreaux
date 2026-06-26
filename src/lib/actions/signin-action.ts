/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import type { FormState } from '@/lib/types/form-state';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { rateLimit } from '@/lib/utils/rate-limit';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import { signinSchema } from '@/lib/validation/signin-schema';

import { logSigninError, resolveClientIp } from './signin-action-helpers';

// Rate limiter: 5 signin attempts per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500,
});

export const signinAction = async (_initialState: FormState, payload: FormData) => {
  // Get IP address for rate limiting
  const headersList = await headers();
  const ip = resolveClientIp(headersList);

  // Check rate limit. Skipped under E2E (shards share one IP, same opt-out as
  // `withRateLimit`) so the suite isn't tripped by the 5/min/IP limit.
  if (process.env.E2E_MODE !== 'true') {
    try {
      await limiter.check(5, ip); // 5 requests per minute per IP
    } catch {
      return {
        success: false,
        errors: { general: ['Too many signin attempts. Please try again later.'] },
        fields: {},
      };
    }
  }

  // Verify Turnstile token
  const turnstileToken = payload.get('cf-turnstile-response') as string | null;
  if (!turnstileToken) {
    return {
      success: false,
      errors: { general: ['CAPTCHA verification required. Please complete the verification.'] },
      fields: {},
    };
  }

  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return {
      success: false,
      errors: {
        general: [turnstileResult.error || 'CAPTCHA verification failed. Please try again.'],
      },
      fields: {},
    };
  }

  const permittedFieldNames = ['email'];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, signinSchema);
  if (parsed.success) {
    try {
      const { email } = formState.fields;

      // Trigger better-auth's magic-link send. `callbackURL` is the post-verify
      // landing page. The redirect happens below — `next` throws if you redirect
      // inside a try/catch.
      await auth.api.signInMagicLink({
        body: { email: email as string, callbackURL: '/', errorCallbackURL: '/signin' },
        headers: headersList,
      });

      formState.success = true;
    } catch (error) {
      formState.success = false;
      // Log the error for debugging (only in development to avoid exposing details)
      logSigninError(error);
      // Set a generic error message for the user
      setUnknownError(formState);
    }
  }

  if (formState.success) {
    return redirect(
      `/success/signin?email=${encodeURIComponent(formState.fields.email as string)}`
    );
  }

  return formState;
};
