import { EMAIL_REGEX } from '@/app/lib/utils/auth/auth-utils';
import * as z from 'zod';

const emailRegex = z.string().regex(EMAIL_REGEX, { message: 'Invalid email address' });
const changeEmailSchema = z.object({
  email: emailRegex,
  confirmEmail: emailRegex,
  previousEmail: emailRegex.optional(),
}).refine((data) => data.email === data.confirmEmail, {
  message: 'Email addresses do not match',
  path: ['confirmEmail'],
});

export default changeEmailSchema;

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;
