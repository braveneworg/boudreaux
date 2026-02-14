import type { FormState } from '../../types/form-state';
import type { ZodType } from 'zod';

const getActionState = <TForm>(
  data: FormData,
  permittedFieldNames: string[],
  formSchema: ZodType<TForm>
) => {
  // Preserve the values entered into the fields
  const fields: Record<string, boolean | string> = {};
  // Every form in this application should follow this formState initial state
  const formState: FormState = { errors: {}, fields, success: false, hasTimeout: false };
  const formData = Object.fromEntries(data);

  for (const key in formData) {
    if (!permittedFieldNames.includes(key)) {
      delete formData[key];
    }
  }

  // Populate the formState fields with form data
  for (const key of Object.keys(formData)) {
    // We limit the keys to the permitted field names above, so no danger here
    let value: boolean | string = formData[key]!.toString();

    // Convert checkbox/switch "on" values to boolean
    if (value === 'true' || value === 'on') {
      value = true;
    } else if (value === 'false' || value === 'off') {
      value = false;
    }

    // Store original string values in fields for form state
    fields[key] = formData[key]!.toString();

    // Update formData with converted boolean values for schema validation
    formData[key] = value as FormDataEntryValue;
  }

  formState.fields = fields;

  // Parse JSON-stringified arrays back to actual arrays before validation.
  // The client serializes arrays via JSON.stringify() when appending to FormData,
  // so they arrive as strings like '["value1","value2"]'. Zod expects real arrays.
  // Also coerce numeric strings to numbers (FormData sends all values as strings).
  for (const key of Object.keys(formData)) {
    const val = formData[key];
    if (typeof val === 'string') {
      if (val.startsWith('[')) {
        try {
          const jsonParsed = JSON.parse(val);
          if (Array.isArray(jsonParsed)) {
            formData[key] = jsonParsed as unknown as FormDataEntryValue;
          }
        } catch {
          // Not valid JSON, keep as string
        }
      } else if (val !== '' && !isNaN(Number(val)) && isFinite(Number(val))) {
        // Convert numeric strings to numbers so Zod z.number() fields validate correctly.
        // Non-numeric fields (URLs, dates, ObjectIds) contain non-numeric characters
        // and won't match this check.
        formData[key] = Number(val) as unknown as FormDataEntryValue;
      }
    }
  }

  // Validate the form data
  const parsed = formSchema.safeParse(formData);

  return { formState, parsed };
};

export { getActionState };
