import * as z from 'zod';

import { EMAIL_REGEX } from '@/app/lib/utils/auth/auth-utils';

const formSchema = z.object({
  email: z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' }),
  general: z.string().optional(),
});

export type FormSchemaType = z.infer<typeof formSchema>;

export default formSchema;
