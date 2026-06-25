/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { signOut } from '@/lib/auth-client';

interface SignOutButtonProps {
  onNavigate?: () => void;
}

const SignOutButton = ({ onNavigate }: SignOutButtonProps) => {
  const router = useRouter();

  return (
    <Button
      className="h-auto w-auto justify-start gap-1.5 px-0 py-0 text-sm text-zinc-50 underline has-[>svg]:px-0"
      variant="link:narrow"
      onClick={async () => {
        onNavigate?.();
        // better-auth's signOut clears the session cookie; navigate home after.
        await signOut();
        router.push('/');
      }}
    >
      <LogOutIcon size={16} />
      Sign Out
    </Button>
  );
};

export { SignOutButton };
