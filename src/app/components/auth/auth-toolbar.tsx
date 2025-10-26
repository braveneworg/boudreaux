import { useSession } from 'next-auth/react';

import { cn } from '@/app/lib/utils/auth/tailwind-utils';
import { log } from '@/app/lib/utils/console-logger';

import SignInLink from './signin-link';
import SignedinToolbar from './signout-button';
import SignUpLink from './signup-link';
import { MessageSpinner } from '../ui/spinners/message-spinner';
import VerticalSeparator from '../ui/vertical-separator';

type Roles = {
  readonly admin: 'admin';
};

type AuthenticationStatus = {
  readonly authenticated: 'authenticated';
  readonly loading: 'loading';
};

type Authentication = {
  readonly status: AuthenticationStatus;
};

type Environment = {
  readonly development: 'development';
};

const ROLES = {
  admin: 'admin',
} as const satisfies Roles;

const AUTHENTICATION_STATUS = {
  authenticated: 'authenticated',
  loading: 'loading',
} as const satisfies AuthenticationStatus;

const AUTHENTICATION = {
  status: AUTHENTICATION_STATUS,
} as const satisfies Authentication;

const ENVIRONMENT = {
  development: 'development',
} as const satisfies Environment;

const NOT_AVAILABLE = 'N/A' as const;

const AuthToolbar = ({ className }: { className?: string }) => {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === ROLES.admin;
  const isDevelopment = process.env.NODE_ENV === ENVIRONMENT.development;
  const loggingPrefix = '[AuthToolbar]';

  // Debug logging in development
  if (isDevelopment) {
    log(loggingPrefix, 'Session status:', status);
    log(loggingPrefix, 'Session data:', session);
    log(loggingPrefix, 'User data:', session?.user);
    log(loggingPrefix, 'Username:', session?.user?.username);
  }

  // Show loading state or nothing while checking authentication
  if (status === AUTHENTICATION.status.loading) {
    return <MessageSpinner />;
  }

  // Show authenticated toolbar if user is logged in
  if (status === AUTHENTICATION.status.authenticated && session) {
    if (isAdmin) {
      if (isDevelopment) {
        log(loggingPrefix, 'User role:', session.user.role || NOT_AVAILABLE);
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
