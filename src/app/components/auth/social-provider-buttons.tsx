/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { AppleIcon, FacebookIcon, GoogleIcon, XIcon } from '@/app/components/ui/brand-icons';
import { Button } from '@/app/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { reportClientError } from '@/lib/utils/report-client-error';
import { cn } from '@/lib/utils/tailwind-utils';

export type SocialProvider = 'apple' | 'google' | 'facebook' | 'twitter';

interface SocialProviderConfig {
  provider: SocialProvider;
  /** Full phrase used as the button's accessible name (`aria-label`). */
  label: string;
  /**
   * Short word rendered beside the icon so the 2-up grid never overflows.
   * Omitted for X, whose logo is already its wordmark — the icon alone reads.
   */
  short?: string;
  Icon: ({ className }: { className?: string }) => React.ReactElement;
}

const PROVIDERS: SocialProviderConfig[] = [
  { provider: 'apple', label: 'Continue with Apple', short: 'Apple', Icon: AppleIcon },
  { provider: 'google', label: 'Continue with Google', short: 'Google', Icon: GoogleIcon },
  { provider: 'facebook', label: 'Continue with Facebook', short: 'Facebook', Icon: FacebookIcon },
  { provider: 'twitter', label: 'Continue with X (Twitter)', Icon: XIcon },
];

interface SocialProviderButtonsProps {
  /** The URL to redirect to after successful social sign-in. */
  callbackURL: string;
  /** Optional className applied to the wrapping element for layout customisation. */
  className?: string;
  /**
   * Called when social sign-in fails — either a thrown rejection or a non-null
   * `error` in better-auth's `{ data, error }` result. The parent is responsible
   * for surfacing the failure to the user (e.g. via toast). When omitted the
   * component falls back to fire-and-forget client error reporting.
   */
  onError?: (provider: SocialProvider, error: unknown) => void;
}

/**
 * Renders a block of four social sign-in buttons (Apple, Google, Facebook, X).
 * Calls `authClient.signIn.social` on click. Disables all buttons during a
 * pending sign-in to prevent double-submissions. Reusable across auth flows
 * (sign-in/up page, profile connected-accounts — Task 7).
 *
 * Errors (thrown rejections or a non-null better-auth error) are forwarded to
 * the optional `onError` prop so the parent decides how to surface them.
 */
export const SocialProviderButtons = ({
  callbackURL,
  className,
  onError,
}: SocialProviderButtonsProps): React.ReactElement => {
  const [isPending, setIsPending] = useState(false);

  const handleSignIn = async (provider: SocialProvider): Promise<void> => {
    setIsPending(true);
    try {
      const { error } = await authClient.signIn.social({ provider, callbackURL });
      if (error !== null && error !== undefined) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(provider, err);
        } else {
          reportClientError(err, 'route');
        }
      }
    } catch (thrown: unknown) {
      const err = thrown instanceof Error ? thrown : new Error(String(thrown));
      if (onError) {
        onError(provider, err);
      } else {
        reportClientError(err, 'route');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {PROVIDERS.map(({ provider, label, short, Icon }) => (
        <Button
          key={provider}
          type="button"
          variant="punk"
          aria-label={label}
          className="h-12 justify-center gap-2.5 text-sm tracking-[0.12em] uppercase"
          disabled={isPending}
          onClick={() => handleSignIn(provider)}
        >
          <Icon className="size-5" />
          {short && <span>{short}</span>}
        </Button>
      ))}
    </div>
  );
};
