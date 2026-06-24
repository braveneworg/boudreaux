/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import type { ZodType } from 'zod';

type ParsedFormValue = FormDataEntryValue | boolean | number | unknown[];

/** Working copy of the form data, keyed by field name. */
type FormDataMap = Map<string, ParsedFormValue>;

/**
 * Coerce a checkbox/switch string to a boolean, leaving every other string as
 * its original value. `'true'`/`'on'` → `true`; `'false'`/`'off'` → `false`.
 */
const coerceBooleanString = (stringValue: string): boolean | string => {
  if (stringValue === 'true' || stringValue === 'on') return true;
  if (stringValue === 'false' || stringValue === 'off') return false;
  return stringValue;
};

/**
 * Parse a JSON-stringified array (e.g. '["a","b"]') into a real array. Returns
 * the array on success or `null` when the value is not a valid JSON array — the
 * caller then keeps the original string.
 */
const parseJsonArray = (val: string): unknown[] | null => {
  try {
    const jsonParsed = JSON.parse(val);
    return Array.isArray(jsonParsed) ? jsonParsed : null;
  } catch {
    // Not valid JSON, keep as string
    return null;
  }
};

/** Whether a string should be coerced to a number for Zod `z.number()` fields. */
const isNumericString = (val: string): boolean =>
  val !== '' && !isNaN(Number(val)) && isFinite(Number(val));

/**
 * Convert a single post-boolean string value to its richer form for schema
 * validation: a JSON array, a number, or the unchanged value. Non-string
 * values pass through untouched.
 */
const coerceValueForSchema = (val: ParsedFormValue): ParsedFormValue => {
  if (typeof val !== 'string') return val;
  if (val.startsWith('[')) {
    return parseJsonArray(val) ?? val;
  }
  // Convert numeric strings to numbers so Zod z.number() fields validate correctly.
  // Non-numeric fields (URLs, dates, ObjectIds) contain non-numeric characters
  // and won't match this check.
  return isNumericString(val) ? Number(val) : val;
};

const getActionState = <TForm>(
  data: FormData,
  permittedFieldNames: string[],
  formSchema: ZodType<TForm>
) => {
  // Preserve the values entered into the fields
  const fields = new Map<string, boolean | string>();
  // Working copy of the form data, keyed by field name. A Map keeps dynamic
  // string keys off of a plain object (avoids object-injection sinks).
  const formData: FormDataMap = new Map(Object.entries(Object.fromEntries(data)));

  for (const key of [...formData.keys()]) {
    if (!permittedFieldNames.includes(key)) {
      formData.delete(key);
    }
  }

  // Populate the formState fields with form data
  for (const [key, rawValue] of formData) {
    if (rawValue === undefined || rawValue === null) continue;
    const stringValue = rawValue.toString();

    // Store original string values in fields for form state
    fields.set(key, stringValue);

    // Update formData with converted boolean values for schema validation
    formData.set(key, coerceBooleanString(stringValue));
  }

  // Parse JSON-stringified arrays back to actual arrays before validation.
  // The client serializes arrays via JSON.stringify() when appending to FormData,
  // so they arrive as strings like '["value1","value2"]'. Zod expects real arrays.
  // Also coerce numeric strings to numbers (FormData sends all values as strings).
  for (const [key, val] of formData) {
    formData.set(key, coerceValueForSchema(val));
  }

  // Every form in this application should follow this formState initial state
  const formState: FormState = {
    errors: {},
    fields: Object.fromEntries(fields),
    success: false,
    hasTimeout: false,
  };

  // Validate the form data
  const parsed = formSchema.safeParse(Object.fromEntries(formData));

  return { formState, parsed };
};

export { getActionState };
