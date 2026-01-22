import { z } from 'zod';

import { EMAIL_REGEX } from '@/lib/utils/auth/auth-utils';

const termsAndConditionsMessage = 'You must accept the terms and conditions';

const formSchema = z.object({
  email: z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' }),
  termsAndConditions: z
    .boolean({ message: termsAndConditionsMessage })
    .refine((val) => val === true, {
      message: termsAndConditionsMessage,
    }),
  general: z.string().optional(),
});

export type FormSchemaType = z.infer<typeof formSchema>;

export default formSchema;
