/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { useWatch } from 'react-hook-form';

import type { Control, FieldValues, Path, UseFormClearErrors } from 'react-hook-form';

interface MatchingFieldErrorClearOptions<T extends FieldValues> {
  control: Control<T>;
  clearErrors: UseFormClearErrors<T>;
  fieldName: Path<T>;
  confirmFieldName: Path<T>;
}

/**
 * Watches a value field and its confirmation field; when both are truthy and
 * equal, clears any validation error previously set on the confirmation field.
 * Shared by the email and username sub-forms so the matching logic lives in one
 * place. Behaviour mirrors the prior inline effects exactly.
 */
export const useMatchingFieldErrorClear = <T extends FieldValues>({
  control,
  clearErrors,
  fieldName,
  confirmFieldName,
}: MatchingFieldErrorClearOptions<T>): void => {
  const value = useWatch({ control, name: fieldName });
  const confirmValue = useWatch({ control, name: confirmFieldName });

  useEffect(() => {
    if (value && confirmValue && value === confirmValue) {
      clearErrors(confirmFieldName);
    }
  }, [value, confirmValue, clearErrors, confirmFieldName]);
};
