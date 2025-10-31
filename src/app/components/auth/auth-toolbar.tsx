'use client';

import { useSession } from 'next-auth/react';

import { CONSTANTS } from '@/app/lib/constants';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';
import { log } from '@/app/lib/utils/console-logger';

import SignInLink from './signin-link';
import SignedinToolbar from './signout-button';
import SignUpLink from './signup-link';
import { MessageSpinner } from '../ui/spinners/message-spinner';
import VerticalSeparator from '../ui/vertical-separator';

const AuthToolbar = ({ className }: { className?: string }) => {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === CONSTANTS.ROLES.ADMIN;
  const isDevelopment = process.env.NODE_ENV === CONSTANTS.ENV.DEVELOPMENT;
  const loggingPrefix = '[AuthToolbar]';

  // Debug logging in development
  if (isDevelopment) {
    log(loggingPrefix, 'Session status:', status);
    log(loggingPrefix, 'Session data:', session);
    log(loggingPrefix, 'User data:', session?.user);
    log(loggingPrefix, 'Username:', session?.user?.username);
  }

  // Show loading state or nothing while checking authentication
  if (status === CONSTANTS.AUTHENTICATION.STATUS.LOADING) {
    return <MessageSpinner title="Loading..." size="sm" variant="default" />;
  }

  // Show authenticated toolbar if user is logged in
  if (status === CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED && session) {
    if (isAdmin) {
      if (isDevelopment) {
        log(loggingPrefix, 'User role:', session.user.role || CONSTANTS.NA);
      }
    }

    log(loggingPrefix, 'Rendering authenticated toolbar');
    return <SignedinToolbar className={className} />;
  }

  // Show sign in/up links for unauthenticated users
  log(loggingPrefix, 'Rendering unauthenticated links');
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <SignInLink />
      <VerticalSeparator />
      <SignUpLink />
    </div>
  );
};

export default AuthToolbar;
