import FormInput from '@/components/forms/ui/form-input';
import TurnstileWidget from '@/components/forms/ui/turnstile-widget';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils/auth/tailwind-utils';
import Link from 'next/link';
import type { Control} from 'react-hook-form';
import type { FormSchemaType } from '@/lib/validation/signup-schema';

import { Button } from '@/components/forms/ui/button';
import { Switch } from '@/components/forms/ui/switch';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/forms/ui/form';

interface SigninFormProperties {
  control: Control<FormSchemaType>;
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
}: SigninFormProperties) => {
  const { isSubmitted } = state;

  return (
    <>
    {console.log(`37: signup-signin-form > isSubmitted >>>`, isSubmitted)}
    {JSON.stringify(state)}
      <div className={cn('mt-8 max-w-96', { 'mb-8': !hasTermsAndConditions })}>
        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem className="mt-4">
              <FormLabel className="sr-only" htmlFor="email">
                Email
              </FormLabel>
              <FormControl>
                <FormInput id="email" placeholder="Email address" type="email" {...field} />
              </FormControl>
              <FormMessage>{state.errors?.email}</FormMessage>
            </FormItem>
          )}
        />
        {hasTermsAndConditions && (
          <FormField
            control={control}
            name="termsAndConditions"
            render={({ field }) => (
                <FormItem className="mb-4 mt-4 flex flex-wrap items-center gap-4">
                  <FormControl>
                    <Switch
                    id="terms-and-conditions"
                    name="termsAndConditions"
                    checked={!!field.value || false}
                    onCheckedChange={field.onChange}
                    required
                    />
                  </FormControl>
                  <FormLabel htmlFor="terms-and-conditions">
                    <Link className=':hover:no-underline :visited:text-rebeccapurple underline text-blue-800' href="/terms-and-conditions">
                      Accept terms and conditions?
                    </Link>
                  </FormLabel>
                  <FormMessage className="relative -top-1.5">
                    {(state.errors?.termsAndConditions && "You must accept the terms and conditions to continue")}
                  </FormMessage>
                </FormItem>
            )}
          />
        )}
      </div>
      <TurnstileWidget setIsVerified={setIsVerified} />
      <Button className="mt-4" disabled={isPending} size="lg">
        Submit
      </Button>
    </>
  );
};

export default SignupSigninForm;
