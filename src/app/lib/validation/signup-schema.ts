import { EMAIL_REGEX } from '@/app/lib/utils/auth/auth-utils';
import { z } from 'zod';

const formSchema = z
  .object({
    email: z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' }),
    termsAndConditions: z.boolean().refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
  });

export type FormSchemaType = z.infer<typeof formSchema>;

export default formSchema;
