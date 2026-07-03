/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  SocialProviderButtons,
  type SocialProvider,
} from '@/app/components/auth/social-provider-buttons';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { FormInput } from '@/app/components/ui/form-input';
import { Separator } from '@/app/components/ui/separator';
import { StatusIndicator } from '@/app/components/ui/status-indicator';
import { Switch } from '@/app/components/ui/switch';
import { TurnstileWidget } from '@/app/components/ui/turnstile-widget';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { useSignupStatusQuery } from '@/app/hooks/use-signup-status-query';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils/tailwind-utils';
import { Skeleton } from '@/ui/skeleton';

import type { Control } from 'react-hook-form';

// Common type for both signin and signup schemas
type BaseFormSchema = {
  email: string;
  general?: string;
  termsAndConditions?: boolean;
  allowSmsNotifications?: boolean;
  allowEmailNotifications?: boolean;
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
  /**
   * Called when social sign-in fails. Forwarded directly to SocialProviderButtons.
   * Wire this at the page level to show a toast and log the error.
   */
  onSocialError?: (provider: SocialProvider, error: unknown) => void;
  /**
   * Optional heading (e.g. the SIGN-IN / SIGN-UP wordmark image) rendered at the
   * top of the panel, above the social buttons, so the whole flow lives in one
   * flyer. The page owns the image so this component stays presentation-only.
   */
  heading?: React.ReactNode;
  /**
   * Disables the social buttons. The signup page passes
   * `!(termsAccepted && isVerified)` so social sign-in is gated on the same
   * agreements + Turnstile check the magic-link path enforces.
   */
  socialDisabled?: boolean;
  /**
   * Async gate run before social sign-in (forwarded to SocialProviderButtons).
   * The signup page stashes the opt-in consent + verifies Turnstile here so the
   * choices persist across the OAuth redirect.
   */
  onBeforeSocialSignIn?: (provider: SocialProvider) => Promise<boolean>;
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

interface SmsOptInFieldProps {
  control: Control<BaseFormSchema>;
}

const SmsOptInField = ({ control }: SmsOptInFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="allowSmsNotifications"
    render={({ field }) => (
      <FormItem className="mt-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <FormControl>
            <Switch
              name="allowSmsNotifications"
              id="allow-sms-notifications"
              checked={!!field.value || false}
              onCheckedChange={field.onChange}
            />
          </FormControl>
          <FormLabel htmlFor="allow-sms-notifications">Text me SMS updates</FormLabel>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Optional. You can opt out anytime from your profile — open it from your username in the
          menu (the hamburger sheet on mobile, or the upper-right corner on desktop).
        </p>
      </FormItem>
    )}
  />
);

interface EmailOptInFieldProps {
  control: Control<BaseFormSchema>;
}

const EmailOptInField = ({ control }: EmailOptInFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="allowEmailNotifications"
    render={({ field }) => (
      <FormItem className="mt-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <FormControl>
            <Switch
              name="allowEmailNotifications"
              id="allow-email-notifications"
              checked={!!field.value || false}
              onCheckedChange={field.onChange}
            />
          </FormControl>
          <FormLabel htmlFor="allow-email-notifications">Email me updates</FormLabel>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Optional. Opt out anytime from your profile, reachable from your username in the menu.
        </p>
      </FormItem>
    )}
  />
);

interface AgreementsBlockProps {
  control: Control<BaseFormSchema>;
  isVerified: boolean;
  setIsVerified: (isVerified: boolean) => void;
  onTurnstileToken?: (token: string) => void;
  showOptIns: boolean;
  state: FormState;
}

/**
 * The agreements + verification block that sits beneath the heading and gates
 * every signup path. On signup it carries the terms / SMS / email toggles; the
 * Turnstile widget renders on both pages.
 */
const AgreementsBlock = ({
  control,
  isVerified,
  setIsVerified,
  onTurnstileToken,
  showOptIns,
  state,
}: AgreementsBlockProps): React.ReactElement => (
  <div className="mb-6">
    {showOptIns && (
      <>
        <TermsField control={control} state={state} />
        <SmsOptInField control={control} />
        <EmailOptInField control={control} />
      </>
    )}
    {/* Thick accent frame around the Turnstile widget — pink on sign-in, teal on
        sign-up, via the shared --card-accent token. */}
    <div className="mt-3 border-4 border-[var(--card-accent)] p-2">
      <TurnstileWidget
        isVerified={isVerified}
        setIsVerified={setIsVerified}
        onToken={onTurnstileToken}
      />
    </div>
  </div>
);

interface MagicLinkSectionProps {
  control: Control<BaseFormSchema>;
  isSigningIn: boolean;
  isVerified: boolean;
  state: FormState;
}

/** The "magic link" heading + the Turnstile-gated email field. */
const MagicLinkSection = ({
  control,
  isSigningIn,
  isVerified,
  state,
}: MagicLinkSectionProps): React.ReactElement => (
  <>
    <p className="mb-4">
      <span className="font-fake-four-cutout bg-menu-item-yellow-200 px-1.5 text-xl tracking-wide text-black uppercase">
        Magic link
      </span>
    </p>
    {!isVerified && <Skeleton className="mx-auto h-10 w-full" />}
    {isVerified && (
      <EmailField
        control={control}
        isSigningIn={isSigningIn}
        isVerified={isVerified}
        state={state}
      />
    )}
  </>
);

interface FormSubmitRowProps {
  isPending: boolean;
  isVerified: boolean;
  signupsPaused: boolean;
  state: FormState;
}

const FormSubmitRow = ({
  isPending,
  isVerified,
  signupsPaused,
  state,
}: FormSubmitRowProps): React.ReactElement => (
  <div className="mt-4 flex items-center gap-3">
    {!isVerified && <Skeleton className="h-10 w-24" />}
    {isVerified && (
      <Button
        type="submit"
        disabled={isPending || signupsPaused}
        size="lg"
        className="shadow-zine-md disabled:shadow-zine-md font-bold tracking-[0.1em] uppercase hover:shadow-[5px_5px_0_0_var(--card-accent)] active:translate-x-[4px] active:translate-y-[4px] disabled:translate-x-0 disabled:translate-y-0"
      >
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
  <div className="relative my-7 flex items-center gap-3">
    <Separator className="h-0.5 flex-1 bg-black" />
    <span className="shadow-zine-ink shrink-0 -rotate-1 border border-black bg-[var(--card-accent-soft)] px-2.5 py-0.5 text-xs font-bold tracking-[0.12em] text-black uppercase">
      {label}
    </span>
    <Separator className="h-0.5 flex-1 bg-black" />
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
          className="font-semibold underline decoration-[var(--card-accent)] decoration-2 underline-offset-4 hover:no-underline"
        >
          Create an account
        </Link>
      </>
    ) : (
      <>
        Already have an account?{' '}
        <Link
          href="/signin"
          className="font-semibold underline decoration-[var(--card-accent)] decoration-2 underline-offset-4 hover:no-underline"
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
  onSocialError,
  heading,
  socialDisabled,
  onBeforeSocialSignIn,
}: SignupSigninFormProps): React.ReactElement => {
  const pathName = usePathname();
  const isSigningIn = pathName === '/signin';
  const { data: signupStatus } = useSignupStatusQuery({ enabled: hasTermsAndConditions });
  const signupsPaused = hasTermsAndConditions && signupStatus?.paused === true;

  return (
    <ZinePanel accent={isSigningIn ? 'pink' : 'teal'}>
      {/* Heading wordmark — lives inside the flyer, above the social buttons,
          spanning the panel's full content width */}
      {heading && <div className="mb-6">{heading}</div>}
      {/* Everything below the heading stays centered at the flyer's previous
          width while the panel itself spans the content area */}
      <div className="mx-auto w-full max-w-lg">
        {/* Signups-paused notice — shown only on the signup path when paused */}
        {signupsPaused && (
          <Alert className="mb-4">
            <AlertDescription>
              Signups are temporarily paused. Please try again later.
            </AlertDescription>
          </Alert>
        )}
        {/* Agreements + Turnstile, gating every signup path — beneath the
            heading, closed by a black divider. Opt-in toggles on signup only. */}
        <AgreementsBlock
          control={control}
          isVerified={isVerified}
          setIsVerified={setIsVerified}
          onTurnstileToken={onTurnstileToken}
          showOptIns={hasTermsAndConditions && !isSigningIn}
          state={state}
        />

        {/* Social sign-in — gated on terms + Turnstile via socialDisabled */}
        <SocialProviderButtons
          callbackURL={callbackURL}
          className="mb-2"
          onError={onSocialError}
          disabled={socialDisabled}
          beforeSignIn={onBeforeSocialSignIn}
        />

        {/* Divider */}
        <OrDivider label="or continue with email" />

        {/* Magic-link heading + Turnstile-gated email field */}
        <MagicLinkSection
          control={control}
          isSigningIn={isSigningIn}
          isVerified={isVerified}
          state={state}
        />
        <FormSubmitRow
          isPending={isPending}
          isVerified={isVerified}
          signupsPaused={signupsPaused}
          state={state}
        />
        <FormStatusMessages state={state} />

        {/* Mode switch */}
        <ModeSwitchLink isSigningIn={isSigningIn} />
      </div>
    </ZinePanel>
  );
};
