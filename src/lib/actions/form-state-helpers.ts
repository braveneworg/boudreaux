/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

/**
 * Ensure `formState.errors` exists and return it, so callers can assign
 * literal-keyed field errors without repeating the
 * `if (!formState.errors) formState.errors = {}` guard at a fourth nesting
 * level (which tripped `max-depth`). Returning the bag keeps every write a
 * string-literal member access, staying object-injection-safe.
 */
export const ensureFormErrors = (formState: FormState): Record<string, string[]> => {
  const errors = formState.errors ?? {};
  formState.errors = errors;
  return errors;
};

/**
 * Assign a top-level `general` error, lazily creating the `errors` bag.
 */
export const setGeneralFormError = (formState: FormState, messages: string[]): void => {
  ensureFormErrors(formState).general = messages;
};
