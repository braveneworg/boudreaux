/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { isTimeoutDataError } from '@/lib/utils/data-error-helpers';
import { loggers } from '@/lib/utils/logger';
import { changeUsernameSchema } from '@/lib/validation/change-username-schema';

const logger = loggers.auth;

const logErrorDetails = (error: unknown): void => {
  const errorDetails = {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorCode: error instanceof DataError ? error.code : undefined,
    errorStack:
      process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined,
  };
  logger.error('[changeUsernameAction] Error updating username', undefined, errorDetails);
};

const applyDataErrorMessage = (error: DataError, errors: Record<string, string[]>): void => {
  if (error.code === 'DUPLICATE') {
    errors.username = ['Username is already taken.'];
  } else if (error.code === 'NOT_FOUND') {
    errors.general = ['User not found. Please refresh and try again.'];
  } else if (error.code === 'VALIDATION') {
    errors.general = ['There was a data validation issue. Please refresh and try again.'];
  } else {
    logger.error('[changeUsernameAction] Data error code', undefined, { code: error.code });
    errors.general = ['A database error occurred. Please try again or contact support.'];
  }
};

const applyUsernameError = (error: unknown, formState: FormState): void => {
  formState.success = false;
  logErrorDetails(error);

  if (!formState.errors) {
    formState.errors = {};
  }

  // Check for MongoDB timeout errors. The repository normalizes ETIMEOUT to
  // a `TIMEOUT` DataError; other timeout-shaped failures surface as an
  // `UNKNOWN` DataError that still carries the original message.
  if (isTimeoutDataError(error)) {
    formState.hasTimeout = true;
    formState.errors.general = ['Connection timed out. Please try again.'];
  } else if (error instanceof DataError) {
    applyDataErrorMessage(error, formState.errors);
  } else if (
    error instanceof Error &&
    error.message === 'You must be logged in to change your username'
  ) {
    // Specific error message for authentication issues
    formState.errors.general = [error.message];
  } else if (error instanceof Error) {
    // Handle general JavaScript errors
    logger.error('[changeUsernameAction] JavaScript error', error);
    formState.errors.general = ['Failed to update username. Please try again or contact support.'];
  } else {
    // Unknown error type
    logger.error('[changeUsernameAction] Unknown error type', error);
    formState.errors.general = [
      'An unexpected error occurred. Please try again or contact support.',
    ];
  }
};

const applyZodErrors = (
  formState: FormState,
  parsed: {
    success: false;
    error: {
      flatten: () => { fieldErrors: Record<string, string[] | undefined>; formErrors: string[] };
    };
  }
): void => {
  // Extract field-level errors from Zod, seeding from any pre-existing errors.
  const errors = new Map<string, string[]>(Object.entries(formState.errors ?? {}));
  for (const [field, error] of Object.entries(parsed.error.flatten().fieldErrors)) {
    errors.set(field, error ?? []);
  }
  formState.errors = Object.fromEntries(errors);

  // If there are general errors, add them as well
  const generalErrors = parsed.error.flatten().formErrors;
  if (generalErrors && generalErrors.length > 0) {
    formState.errors.general = generalErrors;
  }
};

export const changeUsernameAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const permittedFieldNames = ['username', 'confirmUsername'] as const;
  const { formState, parsed } = getActionState(payload, permittedFieldNames, changeUsernameSchema);

  // Handle Zod validation errors
  if (!parsed.success) {
    applyZodErrors(formState, parsed);
    return formState;
  }

  if (parsed.success) {
    try {
      // Get current user session
      const session = await auth();

      if (!session?.user?.id) {
        throw Error('You must be logged in to change your username');
      }

      formState.hasTimeout = false;

      const { id } = session.user;
      const { username } = parsed.data;
      const previousUsername = session.user.username;

      await UserRepository.updateUsername(id, username);

      // Log username change for security audit
      await logSecurityEvent({
        event: 'user.username.changed',
        userId: id,
        metadata: {
          previousUsername,
          newUsername: username,
        },
      });

      formState.success = true;

      // Revalidate the profile page to reflect the username change
      revalidatePath('/profile');
    } catch (error: unknown) {
      applyUsernameError(error, formState);
    }
  }

  return formState;
};
