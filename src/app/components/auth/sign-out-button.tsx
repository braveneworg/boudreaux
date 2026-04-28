/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { Button } from '@/app/components/ui/button';

interface SignOutButtonProps {
  onNavigate?: () => void;
}

const SignOutButton = ({ onNavigate }: SignOutButtonProps) => {
  const router = useRouter();

  return (
    <Button
      className="mt-0 ml-2 pt-0 text-zinc-50 underline"
      variant="link:narrow"
      onClick={async () => {
        onNavigate?.();
        const { url } = await signOut({ redirect: false, callbackUrl: '/' });
        router.push(url);
      }}
    >
      <LogOutIcon size={18} className="mt-1" />
      Sign Out
    </Button>
  );
};

export { SignOutButton };
