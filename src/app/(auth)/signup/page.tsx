'use client';

import SignupSigninForm from '@/app/components/forms/signup-signin-form';
import { signupAction } from '@/lib/actions/signup-action';
import type { FormState } from '@/lib/types/form-state';
import signupSchema, { type FormSchemaType } from '@/lib/validation/signup-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState, useRef, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';

const SignupPage = () => {
  const formReference = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<FormState, FormData>(signupAction, {
    errors: {},
    fields: {},
    success: false,
    hasTimeout: false,
  });

  // Cloudflare Turnstile verification
  const [isVerified, setIsVerified] = useState(false);

  const form = useForm<FormSchemaType>({
    defaultValues: {
      email: '',
      termsAndConditions: false,
      ...state?.fields,
    },
    resolver: zodResolver(signupSchema),
  });

  const handleSubmit = async () => {
    if (isVerified) {
      const formData = new FormData(formReference.current!);
      const result = await signupAction(state, formData);

      if (!result.success) {
        // Update the form state with the new state returned from the action
        form.reset(undefined, { keepValues: true });

        if (result.errors?.email) {
          form.setError('email', { message: result.errors.email[0] });
        }
      }
    } else {
      form.setError('general', { message: 'Please refresh the app and try again.' });
    }
  };

  return (
    <FormProvider {...form}>
      <form action={formAction} noValidate onSubmit={form.handleSubmit(handleSubmit)} ref={formReference}>
        <SignupSigninForm
          control={form.control}
          isPending={isPending}
          setIsVerified={setIsVerified}
          state={state}
          hasTermsAndConditions
        />
      </form>
    </FormProvider>
  );
};

export default SignupPage;
