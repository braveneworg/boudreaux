/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface ObjectToFormDataOptions {
  /**
   * Field names whose array values are appended once per item (so the server
   * reads them with `FormData.getAll`) instead of being JSON-stringified.
   */
  repeatKeys?: string[];
  /**
   * Preserve empty-string values. Update flows set this so optional fields can
   * be explicitly cleared; create flows omit empty strings (the default).
   */
  keepEmptyStrings?: boolean;
}

/**
 * Serialize a plain object of React Hook Form values into a `FormData` whose
 * encoding matches what the Server Actions already parse:
 * - `null`/`undefined` are omitted; empty strings are omitted unless
 *   `keepEmptyStrings` is set.
 * - arrays are `JSON.stringify`-ed (decoded by `getActionState`'s `[`-prefix
 *   branch) unless their key is in `repeatKeys`, in which case each item is
 *   appended individually (decoded server-side via `FormData.getAll`).
 * - numbers and booleans are stringified (`getActionState` coerces them back).
 */
/**
 * Append an array value: each item individually when the key is in
 * `repeatKeys` (read server-side via `FormData.getAll`), otherwise a single
 * `JSON.stringify`-ed entry (decoded by `getActionState`'s `[`-prefix branch).
 */
const appendArrayValue = (
  formData: FormData,
  key: string,
  value: unknown[],
  repeatKeys: string[]
): void => {
  if (repeatKeys.includes(key)) {
    for (const item of value) {
      formData.append(key, String(item));
    }
    return;
  }
  formData.append(key, JSON.stringify(value));
};

/**
 * Append a single non-array, non-nullish value, honouring the empty-string
 * rule: an empty string is omitted unless `keepEmptyStrings` is set.
 */
const appendScalarValue = (
  formData: FormData,
  key: string,
  value: unknown,
  keepEmptyStrings: boolean
): void => {
  if (typeof value === 'string' && value === '' && !keepEmptyStrings) {
    return;
  }
  formData.append(key, String(value));
};

export const objectToFormData = (
  values: Record<string, unknown>,
  options: ObjectToFormDataOptions = {}
): FormData => {
  const { repeatKeys = [], keepEmptyStrings = false } = options;
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      appendArrayValue(formData, key, value, repeatKeys);
      continue;
    }

    appendScalarValue(formData, key, value, keepEmptyStrings);
  }

  return formData;
};
