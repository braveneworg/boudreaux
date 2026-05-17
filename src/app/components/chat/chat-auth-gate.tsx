/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ChatAuthGateProps {
  /** Called when the user taps the sign-in CTA so the launcher can dismiss the drawer. */
  onSignIn?: () => void;
}

/**
 * Drawer body shown to unauthenticated visitors. Routes to /signin
 * preserving the current path as callbackUrl so they land back where
 * they were after signing in.
 */
export const ChatAuthGate = ({ onSignIn }: ChatAuthGateProps = {}) => {
  const pathname = usePathname() ?? '/';
  const callbackUrl = encodeURIComponent(pathname);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Lock aria-hidden="true" className="text-muted-foreground size-12" />
      <p className="text-base">Sign in to chat</p>
      <Button asChild>
        <Link href={`/signin?callbackUrl=${callbackUrl}`} onClick={onSignIn}>
          Sign in
        </Link>
      </Button>
    </div>
  );
};
