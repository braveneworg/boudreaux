/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ActionGateRefusal } from '@/lib/auth/action-gate';
import type { DataErrorCode } from '@/lib/types/domain/errors';
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

/**
 * The `FormState` a form-backed Server Action resolves with when the action
 * gate refuses: the refusal copy as the form's `general` error.
 */
export const refusedFormState = ({ error }: ActionGateRefusal): FormState => ({
  fields: {},
  success: false,
  errors: { general: [error] },
});

/**
 * The copy for a gate refusal on a self-service form: the form's own sign-in
 * prompt when there is no session, otherwise the gate's copy.
 */
export const refusalCopy = ({ code, error }: ActionGateRefusal, signInPrompt: string): string =>
  code === 'UNAUTHENTICATED' ? signInPrompt : error;

/** Where one failure code lands on a form: the field it marks and the copy shown there. */
export interface FailureField {
  /** A form field name, or `'general'` for a form-level error. */
  field: string;
  message: string;
}

/**
 * How one form-backed Server Action puts a service failure on its form.
 * `fields` maps a {@link DataErrorCode} to the field it marks; every other code
 * becomes a `general` error carrying `fallback`, or the service's own copy when
 * there is no fallback.
 */
export interface FailureFieldTable {
  fields: ReadonlyMap<DataErrorCode, FailureField>;
  fallback?: string;
}

/** The service failure arm an action hands over: its copy and its code. */
interface ServiceFailure {
  code: DataErrorCode;
  error: string;
}

/**
 * Put a failed service write on the form through the action's
 * {@link FailureFieldTable}. Branches on the code, never on the copy
 * (ADR-0001), so rewording a service message cannot move an error off its
 * field. The failure replaces any errors already on the form.
 */
export const applyServiceFailure = (
  formState: FormState,
  { code, error }: ServiceFailure,
  { fields, fallback }: FailureFieldTable
): void => {
  const mapped = fields.get(code) ?? { field: 'general', message: fallback ?? error };
  formState.success = false;
  formState.errors = Object.fromEntries([[mapped.field, [mapped.message]]]);
};

/** A unique title is taken: the copy release forms show on their title field. */
export const DUPLICATE_TITLE: FailureField = {
  field: 'title',
  message: 'This title is already in use. Please choose a different one.',
};

/** A unique slug is taken: the copy artist forms show on their slug field. */
export const DUPLICATE_SLUG: FailureField = {
  field: 'slug',
  message: 'This slug is already in use. Please choose a different one.',
};
