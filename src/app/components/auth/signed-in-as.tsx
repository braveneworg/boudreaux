/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { KeyIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SignedInAs = ({ onClick }: { onClick?: () => void }) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.username;
  const displayName = username || session?.user?.name || session?.user?.email;

  if (process.env.NODE_ENV === 'development') {
    console.info('[SignedInAs] Session:', session);
    console.info('[SignedInAs] User:', session?.user);
    console.info('[SignedInAs] Display name:', displayName);
  }

  if (!displayName) {
    console.warn('[SignedInAs] No display name found, returning null');
    return null;
  }

  return (
    <>
      <div className={cn('flex items-center gap-2 underline text-zinc-50')}>
        {!isMobile && (
          <div className="flex flex-row gap-2">
            <KeyIcon size={16} />
            <span className="text-sm">Signed in as: </span>
          </div>
        )}
        <KeyIcon size={16} className="md:hidden" />
        <Link
          className="text-sm text-zinc-50 hover:underline underline-offset-4"
          href="/profile"
          onClick={onClick}
        >
          {username ? `@${username}` : displayName}
        </Link>
      </div>
    </>
  );
};

export default SignedInAs;
