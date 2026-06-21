/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export interface SetFormErrorsResult {
  /** The non-field 'general' error message, if present, for the caller to toast. */
  generalError?: string;
}

/**
 * Map a Server Action {@link FormState}'s field-keyed errors onto a React Hook
 * Form instance via its `setError`. Each field receives its first message with a
 * `'server'` error type; the reserved `'general'` key is not mapped to a field
 * but returned so the caller can surface it (e.g. a toast).
 */
export const setFormErrors = <TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  formState: Pick<FormState, 'errors'>
): SetFormErrorsResult => {
  const { errors } = formState;
  if (!errors) {
    return {};
  }

  let generalError: string | undefined;

  for (const [field, messages] of Object.entries(errors)) {
    const message = messages?.[0];
    if (!message) {
      continue;
    }

    if (field === 'general') {
      generalError = message;
      continue;
    }

    setError(field as Path<TFieldValues>, { type: 'server', message });
  }

  return { generalError };
};
