/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';

import { useSession } from '@/hooks/use-session';
import { signOut } from '@/lib/auth-client';
import { CONSTANTS } from '@/lib/constants';
import { cn } from '@/lib/utils/tailwind-utils';
import { VerticalSeparator } from '@/ui/vertical-separator';

// `h-4!` forces a visible height over the Radix primitive's
// `data-[orientation=vertical]:h-full` (which collapses to 0 in an auto-height
// flex row); `bg-zinc-50` overrides the faint default so it shows on the dark header.
const SEPARATOR_CLASSNAME = 'h-4! w-0.5! bg-zinc-50';

// Force links white in every state. The global `a` rule (globals.css) sets a blue
// color and a rebeccapurple `:visited` color directly on every anchor, which would
// otherwise override the inherited white; `visited:text-zinc-50` (utilities layer)
// wins the cascade so visited links stay white too.
const LINK_CLASSNAME = 'text-zinc-50 visited:text-zinc-50';

const NAV_CLASSNAME =
  'absolute top-6 right-10 z-30 flex items-center gap-2 font-fake-four-cutout text-lg text-zinc-50';

/**
 * Desktop-only authentication menu pinned to the upper-right of the header.
 * Signed out: `sign in | sign up`. Signed in: a sign-out control, the bold
 * `@username` (linking to the user's profile), and — for admins — an admin link,
 * separated by vertical rules.
 */
export const DesktopAuthMenu = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === CONSTANTS.ROLES.ADMIN;

  // Defer the auth-dependent markup until after the client has mounted.
  // `useSession` is backed by better-auth's nanostore, which resolves the
  // session from an async fetch (kicked off on mount) that can land *before*
  // React hydrates this node. The server can only ever render the pending
  // branch (null), so without this gate the resolved <nav> would diverge from
  // the server HTML and trip a hydration mismatch. Gating on mount guarantees
  // the first client render matches the server; the real state renders on the
  // commit that follows.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Avoid flashing the wrong state in the corner before the client has mounted
  // or while the session resolves.
  if (!hasMounted || status === CONSTANTS.AUTHENTICATION.STATUS.LOADING) {
    return null;
  }

  if (status === CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED && session) {
    const { user } = session;
    const displayName = user.username ? `@${user.username}` : (user.name ?? user.email);

    const handleSignOut = async (): Promise<void> => {
      // better-auth's signOut clears the session cookie; navigate home after.
      await signOut();
      router.push('/');
    };

    return (
      <nav aria-label="Authentication" className={NAV_CLASSNAME}>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 hover:underline"
        >
          <LogOutIcon size={16} aria-hidden="true" />
          sign out
        </button>
        <VerticalSeparator className={SEPARATOR_CLASSNAME} />
        <Link href="/profile" className={cn(LINK_CLASSNAME, 'font-bold')}>
          {displayName}
        </Link>
        {isAdmin && (
          <>
            <VerticalSeparator className={SEPARATOR_CLASSNAME} />
            <Link href="/admin" className={LINK_CLASSNAME}>
              admin
            </Link>
          </>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Authentication" className={NAV_CLASSNAME}>
      <Link href="/signin" className={LINK_CLASSNAME}>
        sign in
      </Link>
      <VerticalSeparator className={SEPARATOR_CLASSNAME} />
      <Link href="/signup" className={LINK_CLASSNAME}>
        sign up
      </Link>
    </nav>
  );
};
