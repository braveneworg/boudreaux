/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';

import { ensureFormErrors, setGeneralFormError } from './form-state-helpers';

/**
 * True when the failure is a MongoDB timeout. The repository normalizes
 * ETIMEOUT to a `TIMEOUT` DataError; other timeout-shaped failures surface as
 * an `UNKNOWN` DataError that still carries the original message.
 */
const isTimeoutDataError = (error: unknown): boolean =>
  error instanceof DataError &&
  (error.code === 'TIMEOUT' ||
    error.message.includes('ETIMEOUT') ||
    error.message.includes('timeout') ||
    error.message.includes('timed out'));

/**
 * True when the failure is a duplicate-key violation. The only unique field
 * this action writes is the email, so a duplicate can only be an email
 * collision.
 */
const isDuplicateDataError = (error: unknown): boolean =>
  error instanceof DataError && error.code === 'DUPLICATE';

/**
 * Classify a thrown error from the change-email flow and mutate `formState`
 * accordingly. Mirrors the previous inline `try/catch` branches exactly:
 * timeout → `hasTimeout` + general message, duplicate → email field error,
 * everything else → unknown error.
 */
export const applyChangeEmailError = (formState: FormState, error: unknown): void => {
  if (isTimeoutDataError(error)) {
    formState.hasTimeout = true;
    setGeneralFormError(formState, ['Connection timed out. Please try again.']);
    return;
  }

  if (isDuplicateDataError(error)) {
    ensureFormErrors(formState).email = ['Email address is already in use'];
    return;
  }

  setUnknownError(formState);
};
