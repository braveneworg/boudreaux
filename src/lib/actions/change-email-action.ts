/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { redirect } from 'next/navigation';

import { auth, signOut } from '@/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { changeEmailSchema } from '@/lib/validation/change-email-schema';

import { applyChangeEmailError } from './change-email-action-helpers';
import { setGeneralFormError } from './form-state-helpers';

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
        setGeneralFormError(formState, ['You must be logged in to change your email']);
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
      applyChangeEmailError(formState, error);
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
