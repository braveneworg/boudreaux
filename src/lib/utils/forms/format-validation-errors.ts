/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One line naming every field that failed client-side validation, for the
 * toast an entity form shows when `handleSubmit` refuses to submit.
 */
export const formatValidationErrors = (errors: Record<string, { message?: string }>): string => {
  const errorMessages = Object.entries(errors)
    .map(([field, err]) => `${field}: ${err.message || 'Invalid'}`)
    .join(', ');
  return errorMessages || 'Please check the form for errors.';
};
