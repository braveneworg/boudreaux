/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import type { ZodType } from 'zod';

type ParsedFormValue = FormDataEntryValue | unknown[];

/** Working copy of the form data, keyed by field name. */
type FormDataMap = Map<string, ParsedFormValue>;

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

/**
 * Decode a JSON-stringified array back into a real array; every other value
 * passes through untouched.
 *
 * Deliberately nothing more. Numbers and booleans are NOT converted here: a
 * blanket conversion cannot know the schema, so it turned string fields that
 * merely look numeric ('1999', '001', '7.99') into numbers and failed them
 * (#790). Each numeric or boolean field converts for itself instead —
 * `z.coerce.number()`, or `formBoolean()` from
 * `@/lib/validation/form-boolean` for switches.
 */
const decodeFormValue = (val: ParsedFormValue): ParsedFormValue => {
  if (typeof val !== 'string' || !val.startsWith('[')) return val;
  return parseJsonArray(val) ?? val;
};

/**
 * Field names an action accepts from `FormData`. Anything not listed is
 * stripped before validation, so this is a deliberate policy allowlist, **not**
 * a restatement of the schema — several actions intentionally permit a subset
 * (release creation permits 10 of ~24 schema fields, and neither release action
 * permits `createdBy`, which must never be client-settable).
 *
 * Typed as `keyof TForm` so a typo or a renamed schema field is a compile
 * error. It cannot catch an *omission*: leaving a field out is how the subset
 * policy is expressed, so only the author knows whether a new field belongs
 * here. When adding a field to a form schema, add it here too — otherwise it is
 * silently dropped from every submission.
 */
type PermittedFieldNames<TForm> = readonly (keyof TForm & string)[];

const getActionState = <TForm>(
  data: FormData,
  permittedFieldNames: PermittedFieldNames<TForm>,
  formSchema: ZodType<TForm>
) => {
  // Preserve the values entered into the fields
  const fields = new Map<string, string>();
  // Working copy of the form data, keyed by field name. A Map keeps dynamic
  // string keys off of a plain object (avoids object-injection sinks).
  const formData: FormDataMap = new Map(Object.entries(Object.fromEntries(data)));

  // A Set, not `permittedFieldNames.includes(key)`: the keys being filtered are
  // arbitrary client-supplied strings, so they cannot be narrowed to
  // `keyof TForm` for the membership test that decides whether they belong.
  const permitted = new Set<string>(permittedFieldNames);

  for (const key of [...formData.keys()]) {
    if (!permitted.has(key)) {
      formData.delete(key);
    }
  }

  // Populate the formState fields with the submitted strings, and decode the
  // JSON-stringified arrays the client sends (`objectToFormData`) so array
  // fields validate against real arrays.
  for (const [key, rawValue] of formData) {
    if (rawValue === undefined || rawValue === null) continue;
    fields.set(key, rawValue.toString());
    formData.set(key, decodeFormValue(rawValue));
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
