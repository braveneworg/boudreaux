/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { EditIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/lib/utils';

import type { Session } from 'next-auth';

/** Resolves the best available display name from the session user. */
const resolveDisplayName = (session: Session | null): string | null | undefined => {
  const user = session?.user;
  return user?.username || user?.name || user?.email;
};

/** Emits the development-only session diagnostics. */
const logSignedInAsDebug = (
  session: Session | null,
  displayName: string | null | undefined
): void => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  console.info('[SignedInAs] Session:', session);
  console.info('[SignedInAs] User:', session?.user);
  console.info('[SignedInAs] Display name:', displayName);
};

export const SignedInAs = ({ onClick }: { onClick?: () => void }) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.username;
  const displayName = resolveDisplayName(session);

  logSignedInAsDebug(session, displayName);

  if (!displayName) {
    console.warn('[SignedInAs] No display name found, returning null');
    return null;
  }

  return (
    <>
      <div className={cn('flex items-center gap-1.5 text-zinc-50')}>
        {!isMobile && (
          <div className="flex flex-row gap-2">
            <span className="text-xl">Signed in as: </span>
          </div>
        )}
        <EditIcon size={16} />
        <Link className="text-zinc-50 underline" href="/profile" onClick={onClick}>
          {username ? `@${username}` : displayName}
        </Link>
      </div>
    </>
  );
};
