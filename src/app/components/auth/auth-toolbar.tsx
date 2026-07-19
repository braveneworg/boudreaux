/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { usePathname } from 'next/navigation';

import { useSession } from '@/hooks/use-session';
import type { ClientSessionData } from '@/hooks/use-session';
import { CONSTANTS } from '@/lib/constants';
import { log } from '@/lib/utils/console-logger';
import { cn } from '@/lib/utils/tailwind-utils';
import { MessageSpinner } from '@/ui/spinners/message-spinner';
import { VerticalSeparator } from '@/ui/vertical-separator';

import { SignInLink } from './signin-link';
import { SignedInToolbar } from './signout-button';
import { SignUpLink } from './signup-link';

const LOGGING_PREFIX = '[AuthToolbar]';

/** Emits the development-only session diagnostics for the toolbar. */
const logToolbarSession = (session: ClientSessionData | null, status: string): void => {
  log(LOGGING_PREFIX, 'Session status:', status);
  log(LOGGING_PREFIX, 'Session data:', session);
  log(LOGGING_PREFIX, 'User data:', session?.user);
  log(LOGGING_PREFIX, 'Username:', session?.user?.username);
};

/** Logs the resolved admin role (or N/A) for an authenticated admin in development. */
const logAdminRole = (session: ClientSessionData): void => {
  log(LOGGING_PREFIX, 'User role:', session.user.role || CONSTANTS.NA);
};

export const AuthToolbar = ({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) => {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === CONSTANTS.ROLES.ADMIN;
  const isDevelopment = process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT;
  const pathName = usePathname();
  const isSigninOrSignupPage = /(signin|signup)/gi.test(pathName);

  // Debug logging in development
  if (isDevelopment) {
    logToolbarSession(session, status);
  }

  // Show loading state or nothing while checking authentication
  if (status === CONSTANTS.AUTHENTICATION.STATUS.LOADING) {
    return <MessageSpinner title="Loading..." size="sm" variant="default" />;
  }

  // Show authenticated toolbar if user is logged in
  if (status === CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED && session) {
    if (isAdmin && isDevelopment) {
      logAdminRole(session);
    }

    log(LOGGING_PREFIX, 'Rendering authenticated toolbar');
    return <SignedInToolbar className={className} onNavigate={onNavigate} />;
  }

  // Show sign in/up links for unauthenticated users
  log(LOGGING_PREFIX, 'Rendering unauthenticated links');
  return (
    <div className={cn('mt-2 mb-4', className, { hidden: isSigninOrSignupPage })}>
      <div
        className={cn('relative flex items-center justify-center gap-2', className, {
          hidden: isSigninOrSignupPage,
        })}
      >
        <SignInLink onClick={onNavigate} />
        <VerticalSeparator className="mx-2 mt-1 h-4! w-0.5! self-stretch" />
        <SignUpLink onClick={onNavigate} />
      </div>
    </div>
  );
};
