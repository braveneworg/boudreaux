/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { AppleIcon, FacebookIcon, GoogleIcon, XIcon } from '@/app/components/ui/brand-icons';
import { Button } from '@/app/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils/tailwind-utils';

type SocialProvider = 'apple' | 'google' | 'facebook' | 'twitter';

interface SocialProviderConfig {
  provider: SocialProvider;
  label: string;
  Icon: ({ className }: { className?: string }) => React.ReactElement;
}

const PROVIDERS: SocialProviderConfig[] = [
  { provider: 'apple', label: 'Continue with Apple', Icon: AppleIcon },
  { provider: 'google', label: 'Continue with Google', Icon: GoogleIcon },
  { provider: 'facebook', label: 'Continue with Facebook', Icon: FacebookIcon },
  { provider: 'twitter', label: 'Continue with X (Twitter)', Icon: XIcon },
];

interface SocialProviderButtonsProps {
  /** The URL to redirect to after successful social sign-in. */
  callbackURL: string;
  /** Optional className applied to the wrapping element for layout customisation. */
  className?: string;
}

/**
 * Renders a block of four social sign-in buttons (Apple, Google, Facebook, X).
 * Calls `authClient.signIn.social` on click. Disables all buttons during a
 * pending sign-in to prevent double-submissions. Reusable across auth flows
 * (sign-in/up page, profile connected-accounts — Task 7).
 */
export const SocialProviderButtons = ({
  callbackURL,
  className,
}: SocialProviderButtonsProps): React.ReactElement => {
  const [isPending, setIsPending] = useState(false);

  const handleSignIn = async (provider: SocialProvider): Promise<void> => {
    setIsPending(true);
    try {
      await authClient.signIn.social({ provider, callbackURL });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {PROVIDERS.map(({ provider, label, Icon }) => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          className="h-11 gap-2.5 font-medium tracking-wide"
          disabled={isPending}
          onClick={() => handleSignIn(provider)}
        >
          <Icon className="size-4 shrink-0" />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
};
