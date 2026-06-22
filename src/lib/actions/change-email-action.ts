/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { redirect } from 'next/navigation';

import { auth, signOut } from '@/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { changeEmailSchema } from '@/lib/validation/change-email-schema';

export const changeEmailAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const permittedFieldNames = ['email', 'confirmEmail', 'previousEmail'];
  const { formState, parsed } = getActionState(payload, permittedFieldNames, changeEmailSchema);

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id) {
        formState.success = false;
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.general = ['You must be logged in to change your email'];
        return formState;
      }

      // Use the current email from session as previousEmail if not provided
      const previousEmail = parsed.data.previousEmail || session.user.email || '';

      formState.hasTimeout = false;

      await UserRepository.updateEmail(session.user.id, parsed.data.email, previousEmail);

      // Log email change for security audit
      await logSecurityEvent({
        event: 'user.email.changed',
        userId: session.user.id,
        metadata: {
          previousEmail,
          newEmail: parsed.data.email,
        },
      });

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
        // The only unique field this action writes is the email, so a
        // duplicate-key violation can only be an email collision.
        if (!formState.errors) {
          formState.errors = {};
        }
        formState.errors.email = ['Email address is already in use'];
      } else {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    // Sign the user out to force re-authentication with new email
    await signOut({ redirect: false }); // User is redirected

    return redirect(
      `/success/change-email?email=${encodeURIComponent(formState.fields.email as string)}`
    );
  }

  return formState;
};
