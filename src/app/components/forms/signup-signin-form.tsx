import React from 'react';
import FormInput from '@/app/components/ui/form-input';
import TurnstileWidget from '@/app/components/ui/turnstile-widget';
import StatusIndicator from '@/app/components/ui/status-indicator';
import type { FormState } from '@/app/lib/types/form-state';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';
import Link from 'next/link';
import type { Control } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/switch';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { usePathname } from 'next/navigation';

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
  setIsVerified: (isVerified: boolean) => void;
  state: FormState;
}

const SignupSigninForm = ({
  control,
  hasTermsAndConditions = true, // Should be true when signing up
  isPending,
  setIsVerified,
  state,
}: SignupSigninFormProps) => {
  const pathName = usePathname();
  const isSigningIn = pathName === '/signin/';

  return (
    <>
      <div className={cn('mt-8 max-w-96')}>
        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem className={cn(isSigningIn ? 'mb-5' : 'mb-0', 'mt-4')}>
              <FormLabel className="sr-only" htmlFor="email">
                Email
              </FormLabel>
              <FormControl>
                <FormInput id="email" placeholder="Email address" type="email" {...field} />
              </FormControl>
              <FormMessage>
                {state.errors?.email && state.errors.email.length > 0 && state.errors.email[0]}
              </FormMessage>
            </FormItem>
          )}
        />
        {hasTermsAndConditions && !isSigningIn && (
          <FormField
            control={control}
            name="termsAndConditions"
            render={({ field }) => (
              <FormItem className="mb-4 mt-4 flex flex-wrap items-center gap-4">
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
                  <Link
                    className=":hover:no-underline :visited:text-rebeccapurple underline text-blue-800"
                    href="/terms-and-conditions"
                  >
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
        )}
      </div>
      <TurnstileWidget setIsVerified={setIsVerified} />
      <div className="flex items-center gap-3 mt-4">
        <Button disabled={isPending} size="lg">
          Submit
        </Button>
        <StatusIndicator
          isSuccess={state.success}
          hasError={!!(state.errors && Object.keys(state.errors).length > 0)}
          hasTimeout={state.hasTimeout}
          isPending={isPending}
        />
      </div>
      {state.hasTimeout && (
        <div className="mt-2 text-center">
          <FormMessage className="text-red-600">
            Connection timed out. Please try again.
          </FormMessage>
        </div>
      )}
      {state.errors?.general && state.errors.general.length > 0 && (
        <div className="mt-2 text-center">
          <FormMessage className="text-red-600">{state.errors.general[0]}</FormMessage>
        </div>
      )}
    </>
  );
};

export default SignupSigninForm;
