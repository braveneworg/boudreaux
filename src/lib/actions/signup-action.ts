/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { generateUsername } from 'unique-username-generator';

import { signIn } from '@/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { validateEmailSecurity } from '@/lib/utils/email-security';
import { loggers } from '@/lib/utils/logger';
import { rateLimit } from '@/lib/utils/rate-limit';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import { signupSchema } from '@/lib/validation/signup-schema';

// Rate limiter: 5 signup attempts per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500,
});

export const signupAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  // Get IP address for rate limiting
  const headersList = await headers();
  const ip =
    headersList.get('x-real-ip') ||
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous';

  // Check rate limit
  try {
    await limiter.check(5, ip); // 5 requests per minute per IP
  } catch {
    return {
      success: false,
      errors: { general: ['Too many signup attempts. Please try again later.'] },
      fields: {},
    };
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

  const permittedFieldNames = ['email', 'termsAndConditions', 'username'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, signupSchema);

  if (parsed.success) {
    // Validate email security (disposable email check)
    const emailValidation = validateEmailSecurity(parsed.data.email);
    if (!emailValidation.isValid) {
      return {
        success: false,
        errors: { email: [emailValidation.error || 'Invalid email address'] },
        fields: formState.fields,
      };
    }

    try {
      const { email } = formState.fields;

      formState.hasTimeout = false;

      const newUser = await UserRepository.create({
        email: parsed.data.email,
        emailVerified: null,
        name: null,
        image: null,
        username: generateUsername('', 4),
      });

      // Log successful user creation
      await logSecurityEvent({
        event: 'user.created',
        userId: newUser.id,
        metadata: {
          email: parsed.data.email,
          username: newUser.username,
        },
      });

      // Redirect happens way below because next throws an error if you redirect inside a try/catch
      // The property redirectTo is responsible for the magic link callback URL
      await signIn('nodemailer', { email, redirect: false, redirectTo: '/' });
      formState.success = true;
    } catch (error: unknown) {
      formState.success = false;
      // Check for MongoDB timeout errors. The repository normalizes ETIMEOUT to
      // a `TIMEOUT` DataError; other timeout-shaped failures surface as an
      // `UNKNOWN` DataError that still carries the original message.
      if (
        error instanceof DataError &&
        (error.code === 'TIMEOUT' ||
          error.message.includes('ETIMEOUT') ||
          error.message.includes('timeout') ||
          error.message.includes('timed out'))
      ) {
        formState.hasTimeout = true;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['Connection timed out. Please try again.'];
      } else if (error instanceof DataError && error.code === 'DUPLICATE') {
        // Account enumeration defense: do NOT reveal that the email is
        // already registered. The only unique field this action writes is the
        // email, so a duplicate-key violation means the address already exists.
        // Trigger the magic-link flow instead and return the same success state
        // as a brand-new signup. An attacker probing for registered emails
        // cannot distinguish the two cases.
        try {
          await signIn('nodemailer', {
            email: parsed.data.email,
            redirect: false,
            redirectTo: '/',
          });
        } catch (sendError) {
          // Log but do not surface — we must not reveal duplicate-email state.
          loggers.auth.error('Failed to send sign-in magic link on duplicate email', sendError);
        }

        await logSecurityEvent({
          event: 'user.signup.duplicate_email_silent_signin',
          metadata: { email: parsed.data.email },
        });

        formState.success = true;
      } else {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    return redirect(`/success/signup?email=${encodeURIComponent(formState.fields.email)}`);
  }

  return formState;
};
