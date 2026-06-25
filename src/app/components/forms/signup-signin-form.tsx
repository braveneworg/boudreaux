/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SocialProviderButtons } from '@/app/components/auth/social-provider-buttons';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { FormInput } from '@/app/components/ui/form-input';
import { Separator } from '@/app/components/ui/separator';
import { StatusIndicator } from '@/app/components/ui/status-indicator';
import { Switch } from '@/app/components/ui/switch';
import { TurnstileWidget } from '@/app/components/ui/turnstile-widget';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils/tailwind-utils';
import { Skeleton } from '@/ui/skeleton';

import type { Control } from 'react-hook-form';

// Common type for both signin and signup schemas
type BaseFormSchema = {
  email: string;
  general?: string;
  termsAndConditions?: boolean;
};

interface SignupSigninFormProps {
  control: Control<BaseFormSchema>;
  hasTermsAndConditions: boolean;
  isPending: boolean;
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  onTurnstileToken?: (token: string) => void;
  state: FormState;
  /** URL to redirect to after successful social sign-in. Defaults to "/". */
  callbackURL?: string;
}

interface EmailFieldProps {
  control: Control<BaseFormSchema>;
  isSigningIn: boolean;
  isVerified: boolean;
  state: FormState;
}

const EmailField = ({
  control,
  isSigningIn,
  isVerified,
  state,
}: EmailFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="email"
    render={({ field }) => (
      <FormItem className={cn(isSigningIn ? 'mb-2' : 'mb-0')}>
        <FormLabel className="sr-only" htmlFor="email">
          Email address
        </FormLabel>
        <FormControl>
          {isVerified && (
            <FormInput
              id="email"
              placeholder="Email address"
              type="email"
              autoComplete="email"
              {...field}
              autoFocusOnMount
            />
          )}
        </FormControl>
        <FormMessage>
          {state.errors?.email && state.errors.email.length > 0 && state.errors.email[0]}
        </FormMessage>
      </FormItem>
    )}
  />
);

interface TermsFieldProps {
  control: Control<BaseFormSchema>;
  state: FormState;
}

const TermsField = ({ control, state }: TermsFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="termsAndConditions"
    render={({ field }) => (
      <FormItem className="mt-4 mb-4 flex flex-wrap items-center gap-4">
        <FormControl>
          <Switch
            name="termsAndConditions"
            id="terms-and-conditions"
            checked={!!field.value || false}
            onCheckedChange={field.onChange}
            required
          />
        </FormControl>
        <FormLabel htmlFor="terms-and-conditions">
          <Link className="underline hover:no-underline" href="/legal/terms-and-conditions">
            Accept terms and conditions?
          </Link>
        </FormLabel>
        <FormMessage className="relative -top-1.5">
          {state.errors?.termsAndConditions &&
            state.errors.termsAndConditions.length > 0 &&
            state.errors.termsAndConditions[0]}
        </FormMessage>
      </FormItem>
    )}
  />
);

interface VerifiedFieldsProps {
  control: Control<BaseFormSchema>;
  hasTermsAndConditions: boolean;
  isSigningIn: boolean;
  isVerified: boolean;
  state: FormState;
}

const VerifiedFields = ({
  control,
  hasTermsAndConditions,
  isSigningIn,
  isVerified,
  state,
}: VerifiedFieldsProps): React.ReactElement => (
  <>
    <EmailField control={control} isSigningIn={isSigningIn} isVerified={isVerified} state={state} />
    {hasTermsAndConditions && !isSigningIn && <TermsField control={control} state={state} />}
  </>
);

interface FormSubmitRowProps {
  isPending: boolean;
  isVerified: boolean;
  state: FormState;
}

const FormSubmitRow = ({
  isPending,
  isVerified,
  state,
}: FormSubmitRowProps): React.ReactElement => (
  <div className="mt-4 flex items-center gap-3">
    {!isVerified && <Skeleton className="h-10 w-24" />}
    {isVerified && (
      <Button disabled={isPending} size="lg">
        Email me a sign-in link
      </Button>
    )}
    <StatusIndicator
      isSuccess={state.success}
      hasError={!!(state.errors && Object.keys(state.errors).length > 0)}
      hasTimeout={state.hasTimeout}
      isPending={isPending}
    />
  </div>
);

interface FormStatusMessagesProps {
  state: FormState;
}

const FormStatusMessages = ({ state }: FormStatusMessagesProps): React.ReactElement => (
  <>
    {state.hasTimeout && (
      <div className="mt-2 text-center">
        <FormMessage className="text-red-600">Connection timed out. Please try again.</FormMessage>
      </div>
    )}
    {state.errors?.general && state.errors.general.length > 0 && (
      <div className="mt-2 text-center">
        <FormMessage className="text-red-600">{state.errors.general[0]}</FormMessage>
      </div>
    )}
  </>
);

interface OrDividerProps {
  label: string;
}

const OrDivider = ({ label }: OrDividerProps): React.ReactElement => (
  <div className="relative my-6 flex items-center">
    <Separator className="flex-1" />
    <span className="text-muted-foreground mx-4 shrink-0 text-xs font-semibold tracking-widest uppercase">
      {label}
    </span>
    <Separator className="flex-1" />
  </div>
);

interface ModeSwitchLinkProps {
  isSigningIn: boolean;
}

const ModeSwitchLink = ({ isSigningIn }: ModeSwitchLinkProps): React.ReactElement => (
  <p className="text-muted-foreground mt-6 text-center text-sm">
    {isSigningIn ? (
      <>
        New here?{' '}
        <Link
          href="/signup"
          className="font-semibold underline underline-offset-4 hover:no-underline"
        >
          Create an account
        </Link>
      </>
    ) : (
      <>
        Already have an account?{' '}
        <Link
          href="/signin"
          className="font-semibold underline underline-offset-4 hover:no-underline"
        >
          Sign in
        </Link>
      </>
    )}
  </p>
);

export const SignupSigninForm = ({
  control,
  hasTermsAndConditions = true, // Should be true when signing up
  isPending,
  isVerified,
  setIsVerified,
  onTurnstileToken,
  state,
  callbackURL = '/',
}: SignupSigninFormProps): React.ReactElement => {
  const pathName = usePathname();
  const isSigningIn = pathName === '/signin';

  return (
    <Card className="mx-auto w-full max-w-md p-0">
      <CardContent className="p-6 sm:p-8">
        {/* Social sign-in — rendered first, always visible */}
        <SocialProviderButtons callbackURL={callbackURL} className="mb-2" />

        {/* Divider */}
        <OrDivider label="or continue with email" />

        {/* Email section heading */}
        <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-widest uppercase">
          Magic link
        </p>

        {/* Turnstile-gated email fields */}
        {!isVerified && <Skeleton className="mx-auto h-10 w-full" />}
        {isVerified && (
          <VerifiedFields
            control={control}
            hasTermsAndConditions={hasTermsAndConditions}
            isSigningIn={isSigningIn}
            isVerified={isVerified}
            state={state}
          />
        )}
        <TurnstileWidget
          isVerified={isVerified}
          setIsVerified={setIsVerified}
          onToken={onTurnstileToken}
        />
        <FormSubmitRow isPending={isPending} isVerified={isVerified} state={state} />
        <FormStatusMessages state={state} />

        {/* Mode switch */}
        <ModeSwitchLink isSigningIn={isSigningIn} />
      </CardContent>
    </Card>
  );
};
