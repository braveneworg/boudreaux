'use server';

import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { setUnknownError } from '@/app/lib/utils/auth/auth-utils';
import getActionState from '@/app/lib/utils/auth/get-action-state';
import { rateLimit } from '@/app/lib/utils/rate-limit';
import signinSchema from '@/app/lib/validation/signin-schema';

import { signIn } from '../../../../auth';

import type { FormState } from '../types/form-state';

// Rate limiter: 5 signin attempts per minute per IP
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500,
});

export const signinAction = async (_initialState: FormState, payload: FormData) => {
  // Get IP address for rate limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'anonymous';

  // Check rate limit
  try {
    await limiter.check(5, ip); // 5 requests per minute per IP
  } catch {
    return {
      success: false,
      errors: { general: ['Too many signin attempts. Please try again later.'] },
      fields: {},
    };
  }

  const permittedFieldNames = ['email'];

  const { formState, parsed } = getActionState(payload, permittedFieldNames, signinSchema);
  if (parsed.success) {
    try {
      const { email } = formState.fields!;

      // Redirect happens below because next throws an error if you redirect inside a try/catch
      // The property redirectTo is responsible for the magic link callback URL
      await signIn('nodemailer', { email, redirect: false, redirectTo: '/' });

      formState.success = true;
    } catch {
      formState.success = false;
    } finally {
      if (!formState.success && formState.errors && Object.keys(formState.errors).length > 0) {
        setUnknownError(formState);
      }
    }
  }

  if (formState.success) {
    return redirect(
      `/success/signin?email=${encodeURIComponent(formState.fields.email as string)}`
    );
  }

  return formState;
};
