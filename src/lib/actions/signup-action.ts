/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { generateUsername } from 'unique-username-generator';

import { auth } from '@/lib/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { isTimeoutDataError } from '@/lib/utils/data-error-helpers';
import { validateEmailSecurity } from '@/lib/utils/email-security';
import { loggers } from '@/lib/utils/logger';
import { checkPublicFormGuards } from '@/lib/utils/public-form-guards';
import { rateLimit } from '@/lib/utils/rate-limit';
import { signupSchema } from '@/lib/validation/signup-schema';

// Rate limiter: 5 signup attempts per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500,
});

/** Trigger better-auth's magic-link send for the given email. */
const sendMagicLink = async (email: string): Promise<void> => {
  const headersList = await headers();
  await auth.api.signInMagicLink({
    body: { email, callbackURL: '/', errorCallbackURL: '/signin' },
    headers: headersList,
  });
};

/**
 * Handles the catch-block error for the signup try/catch. Mutates formState
 * in place with the appropriate error information.
 */
const applySignupError = async (
  error: unknown,
  formState: FormState,
  email: string
): Promise<void> => {
  formState.success = false;

  if (isTimeoutDataError(error)) {
    // Check for MongoDB timeout errors. The repository normalizes ETIMEOUT to
    // a `TIMEOUT` DataError; other timeout-shaped failures surface as an
    // `UNKNOWN` DataError that still carries the original message.
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
      await sendMagicLink(email);
    } catch (sendError) {
      // Log but do not surface — we must not reveal duplicate-email state.
      loggers.auth.error('Failed to send sign-in magic link on duplicate email', sendError);
    }

    await logSecurityEvent({
      event: 'user.signup.duplicate_email_silent_signin',
      metadata: { email },
    });

    formState.success = true;
  } else {
    setUnknownError(formState);
  }
};

export const signupAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const guardResult = await checkPublicFormGuards({
    payload,
    limiter,
    maxRequests: 5,
    rateLimitMessage: 'Too many signup attempts. Please try again later.',
  });
  if (guardResult !== null) return guardResult;

  const permittedFieldNames = [
    'email',
    'termsAndConditions',
    'allowSmsNotifications',
    'allowEmailNotifications',
    'username',
  ];
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

    if (await SignupSettingsService.areSignupsPaused()) {
      return {
        success: false,
        errors: { general: ['Signups are temporarily paused. Please try again later.'] },
        fields: formState.fields,
      };
    }

    try {
      const { email } = parsed.data;

      formState.hasTimeout = false;

      const newUser = await UserRepository.create({
        email: parsed.data.email,
        // better-auth: users start unverified; the magic-link click flips this.
        emailVerified: false,
        // The signup schema requires terms acceptance, so capture the moment.
        termsAcceptedAt: new Date(),
        name: null,
        image: null,
        username: generateUsername('', 4),
        // Persist the SMS / email opt-ins chosen at signup (default off). Users
        // can change them anytime from their profile.
        allowSmsNotifications: parsed.data.allowSmsNotifications ?? false,
        allowEmailNotifications: parsed.data.allowEmailNotifications ?? false,
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

      // Trigger better-auth's magic-link send. Redirect happens below — `next`
      // throws if you redirect inside a try/catch.
      await sendMagicLink(email);
      formState.success = true;
    } catch (error: unknown) {
      await applySignupError(error, formState, parsed.data.email);
    }
  }

  if (formState.success) {
    return redirect(`/success/signup?email=${encodeURIComponent(formState.fields.email)}`);
  }

  return formState;
};
