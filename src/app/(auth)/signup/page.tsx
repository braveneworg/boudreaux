/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState, useCallback } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm, FormProvider } from 'react-hook-form';

import { SignupSigninForm } from '@/app/components/forms/signup-signin-form';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { signinAction } from '@/lib/actions/signin-action';
import { signupAction } from '@/lib/actions/signup-action';
import type { FormState } from '@/lib/types/form-state';
import {
  signinSchema,
  type FormSchemaType as SigninSchemaType,
} from '@/lib/validation/signin-schema';
import { signupSchema } from '@/lib/validation/signup-schema';

type CombinedFormSchema = SigninSchemaType & { termsAndConditions?: boolean };

const SignupPage = () => {
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const isSignupPath = path === '/signup';

  // If the user is already signed in (e.g. clicked a chat-mention email
  // link in a tab that already has a session), bounce them to the
  // callback URL — defaulting to the landing page when none was given.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const callbackUrl = searchParams.get('callbackUrl');
    // Only allow internal redirects to avoid an open-redirect.
    const target = callbackUrl?.startsWith('/') ? callbackUrl : '/';
    router.replace(target);
  }, [status, router, searchParams]);

  // Cloudflare Turnstile verification
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const [state, setState] = useState<FormState>({
    errors: {},
    fields: {},
    success: false,
    hasTimeout: false,
  });

  const form = useForm<CombinedFormSchema>({
    defaultValues: {
      email: '',
      ...state?.fields,
    },
    resolver: zodResolver(isSignupPath ? signupSchema : signinSchema),
  });

  const handleSubmit = useCallback(
    async (data: CombinedFormSchema) => {
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

        // Add Turnstile token for server-side verification
        if (turnstileToken) {
          formData.append('cf-turnstile-response', turnstileToken);
        }

        const result = await (isSignupPath ? signupAction : signinAction)(state, formData);

        setState(result);

        if (!result.success) {
          // Only stop submitting if there was an error
          // If success, the action will redirect and component will unmount
          setIsSubmitting(false);

          if (result.errors?.email) {
            form.setError('email', { message: result.errors.email.join(', ') });
          }

          if (result.errors?.general) {
            form.setError('general', { message: result.errors.general.join(', ') });
          }
        }
        // Note: If result.success is true, redirect() is called in the action
        // and the component will unmount, so no need to set isSubmitting(false)
      } catch (error) {
        // Handle unexpected errors
        console.error('Form submission error:', error);
        setIsSubmitting(false);
        form.setError('general', {
          message: 'An unexpected error occurred. Please try again.',
        });
      }
    },
    [isVerified, isSignupPath, state, form, turnstileToken]
  );

  return (
    <PageContainer>
      <BreadcrumbMenu
        className="mt-2"
        items={[{ anchorText: isSignupPath ? 'Sign Up' : 'Sign In', url: '#', isActive: true }]}
      />
      <ContentContainer>
        {isSignupPath ? (
          <h1>Sign Up</h1>
        ) : (
          <ImageHeading
            src="/media/headings/SIGN-IN.webp"
            alt="sign in"
            imageHeight={480}
            priority
          />
        )}
        <div className="mt-3 flex flex-col">
          <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit(handleSubmit)} autoComplete="on">
              <SignupSigninForm
                control={form.control}
                isPending={isSubmitting}
                isVerified={isVerified}
                setIsVerified={setIsVerified}
                onTurnstileToken={setTurnstileToken}
                state={state}
                hasTermsAndConditions={isSignupPath}
              />
            </form>
          </FormProvider>
        </div>
      </ContentContainer>
    </PageContainer>
  );
};

export default SignupPage;
