'use client';

import { useActionState, useState, useCallback } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FormProvider } from 'react-hook-form';

import SignupSigninForm from '@/app/components/forms/signup-signin-form';
import { signinAction } from '@/app/lib/actions/signin-action';
import { signupAction } from '@/lib/actions/signup-action';
import type { FormState } from '@/lib/types/form-state';
import signinSchema, {
  type FormSchemaType as SigninSchemaType,
} from '@/lib/validation/signin-schema';
import signupSchema, {
  type FormSchemaType as SignupSchemaType,
} from '@/lib/validation/signup-schema';

import type { Control } from 'react-hook-form';

const SignupPage = () => {
  type SigninOrSignupSchema<T> = T extends { termsAndConditions: true }
    ? SignupSchemaType
    : SigninSchemaType;
  const path = globalThis.window?.location?.pathname;
  const [state, formAction, isPending] = useActionState<FormState, FormData>(signupAction, {
    errors: {},
    fields: {},
    success: false,
    hasTimeout: false,
  });

  // Cloudflare Turnstile verification
  const [isVerified, setIsVerified] = useState(false);
  const isSignupPath = path === '/signup/';
  const form = useForm<SigninOrSignupSchema<FormState>>({
    defaultValues: {
      email: '',
      ...state?.fields,
    },
    resolver: zodResolver(isSignupPath ? signupSchema : signinSchema),
  });

  const handleSubmit = useCallback(
    async (data: SigninOrSignupSchema<FormState>) => {
      if (isVerified) {
        // Create FormData from the validated form data instead of reading from ref
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });

        const result = await (isSignupPath ? signupAction : signinAction)(state, formData);

        if (!result.success) {
          // Update the form state with the new state returned from the action
          form.reset(undefined, { keepValues: true });

          if (result.errors?.email) {
            form.setError('email', { message: result.errors.email.join(', ') });
          }
        }
      } else {
        form.setError('general', { message: 'Please refresh the app and try again.' });
      }
    },
    [isVerified, isSignupPath, state, form]
  );

  return (
    <FormProvider {...form}>
      <form action={formAction} noValidate onSubmit={form.handleSubmit(handleSubmit)}>
        <SignupSigninForm
          control={
            form.control as Control<{
              email: string;
              general?: string;
              termsAndConditions?: boolean;
            }>
          }
          isPending={isPending}
          setIsVerified={setIsVerified}
          state={state}
          hasTermsAndConditions={isSignupPath}
        />
      </form>
    </FormProvider>
  );
};

export default SignupPage;
