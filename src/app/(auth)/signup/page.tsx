'use client';

import { useState, useCallback } from 'react';

import { usePathname } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FormProvider } from 'react-hook-form';

import SignupSigninForm from '@/app/components/forms/signup-signin-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Card } from '@/app/components/ui/card';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
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
  const path = usePathname();
  const isSignupPath = path === '/signup/';

  // Cloudflare Turnstile verification
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [state, setState] = useState<FormState>({
    errors: {},
    fields: {},
    success: false,
    hasTimeout: false,
  });

  const form = useForm<SigninOrSignupSchema<FormState>>({
    defaultValues: {
      email: '',
      ...state?.fields,
    },
    resolver: zodResolver(isSignupPath ? signupSchema : signinSchema),
  });

  const handleSubmit = useCallback(
    async (data: SigninOrSignupSchema<FormState>) => {
      if (!isVerified) {
        form.setError('general', {
          message: 'Please verify you are human using the widget above.',
        });
        return;
      }

      setIsSubmitting(true);

      try {
        // Create FormData from the validated form data
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });

        const result = await (isSignupPath ? signupAction : signinAction)(state, formData);

        setState(result);

        if (!result.success && result.errors?.email) {
          form.setError('email', { message: result.errors.email.join(', ') });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [isVerified, isSignupPath, state, form]
  );

  return (
    <PageContainer>
      <BreadcrumbMenu
        className="mt-2"
        items={[{ anchorText: isSignupPath ? 'Sign Up' : 'Sign In', url: '#', isActive: true }]}
      />
      <ContentContainer>
        <Card>
          {isSignupPath ? <h1>Sign Up</h1> : <h1>Sign In</h1>}
          <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit(handleSubmit)}>
              <SignupSigninForm
                control={
                  form.control as Control<{
                    email: string;
                    general?: string;
                    termsAndConditions?: boolean;
                  }>
                }
                isPending={isSubmitting}
                isVerified={isVerified}
                setIsVerified={setIsVerified}
                state={state}
                hasTermsAndConditions={isSignupPath}
              />
            </form>
          </FormProvider>
        </Card>
      </ContentContainer>
    </PageContainer>
  );
};

export default SignupPage;
