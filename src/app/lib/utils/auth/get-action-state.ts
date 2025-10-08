import type { ZodType } from 'zod';

type FormState = {
  errors: Record<string, string[]>;
  fields: Record<string, boolean | string>;
  success: boolean;
}

const getActionState = <TForm>(data: FormData, permittedFieldNames: string[], formSchema: ZodType<TForm>) => {
  // Preserve the values entered into the fields
  const fields: Record<string, boolean | string> = {};
  // Every form in this application should follow this formState initial state
  const formState: FormState = { errors: {}, fields, success: false };
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
    fields[key] = value;
    // Convert checkbox/switch "on" values to boolean
    if (value === 'on') {
      value = true;
    } else if (value === 'off' || (key === 'termsAndConditions' && value === 'false')) {
      value = false;
    }
    formData[key] = value as FormDataEntryValue;
  }

  formState.fields = fields;

  // Validate the form data
  const parsed = formSchema.safeParse(formData);

  return { formState, parsed };
};

export default getActionState;
