/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import type { ZodType } from 'zod';

const getActionState = <TForm>(
  data: FormData,
  permittedFieldNames: string[],
  formSchema: ZodType<TForm>
) => {
  // Preserve the values entered into the fields
  const fields = new Map<string, boolean | string>();
  // Working copy of the form data, keyed by field name. A Map keeps dynamic
  // string keys off of a plain object (avoids object-injection sinks).
  const formData = new Map<string, FormDataEntryValue | boolean | number | unknown[]>(
    Object.entries(Object.fromEntries(data))
  );

  for (const key of [...formData.keys()]) {
    if (!permittedFieldNames.includes(key)) {
      formData.delete(key);
    }
  }

  // Populate the formState fields with form data
  for (const [key, rawValue] of formData) {
    if (rawValue === undefined || rawValue === null) continue;
    const stringValue = rawValue.toString();
    let value: boolean | string = stringValue;

    // Convert checkbox/switch "on" values to boolean
    if (value === 'true' || value === 'on') {
      value = true;
    } else if (value === 'false' || value === 'off') {
      value = false;
    }

    // Store original string values in fields for form state
    fields.set(key, stringValue);

    // Update formData with converted boolean values for schema validation
    formData.set(key, value);
  }

  // Parse JSON-stringified arrays back to actual arrays before validation.
  // The client serializes arrays via JSON.stringify() when appending to FormData,
  // so they arrive as strings like '["value1","value2"]'. Zod expects real arrays.
  // Also coerce numeric strings to numbers (FormData sends all values as strings).
  for (const [key, val] of formData) {
    if (typeof val === 'string') {
      if (val.startsWith('[')) {
        try {
          const jsonParsed = JSON.parse(val);
          if (Array.isArray(jsonParsed)) {
            formData.set(key, jsonParsed);
          }
        } catch {
          // Not valid JSON, keep as string
        }
      } else if (val !== '' && !isNaN(Number(val)) && isFinite(Number(val))) {
        // Convert numeric strings to numbers so Zod z.number() fields validate correctly.
        // Non-numeric fields (URLs, dates, ObjectIds) contain non-numeric characters
        // and won't match this check.
        formData.set(key, Number(val));
      }
    }
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
