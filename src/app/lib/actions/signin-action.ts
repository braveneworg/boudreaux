'use server';

import 'server-only';
import { setUnknownError } from '@/app/lib/utils/auth/auth-utils';
import getActionState from '@/app/lib/utils/auth/get-action-state';
import signinSchema from '@/app/lib/validation/signin-schema';
import { redirect } from 'next/navigation';
import { signIn } from 'next-auth/react';

type FormState = {
  errors?: Record<string, string[]>;
  fields: Record<string, boolean | string>;
  success: boolean;
};

export const signinAction = async (_initialState: FormState, payload: FormData) => {
  const permittedFieldNames = [
    'email',
  ];

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
      if (!formState.success && Object.keys(formState.errors).length > 0) {
        setUnknownError(formState);
      }
    }
  }
  1
  if (formState.success) {
    return redirect(encodeURI(`/success?email=${formState.fields.email}`));
  }

  return formState;
};
