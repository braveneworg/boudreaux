/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export type FormState = {
  errors?: Record<string, string[]>;
  fields: Record<string, boolean | string>;
  success: boolean;
  isSubmitted?: boolean;
  hasTimeout?: boolean;
  resolver?: 'zod' | 'yup' | 'custom';
  /** Optional data returned from successful form submission (e.g., created entity ID) */
  data?: Record<string, unknown>;
};

/**
 * The initial form state every form-backed Server Action receives. The actions
 * derive their own working state via `getActionState` and ignore this argument,
 * so a single shared empty value suffices for all `mutationFn` call sites.
 */
export const EMPTY_FORM_STATE: FormState = { fields: {}, success: false };
