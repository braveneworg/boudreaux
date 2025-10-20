import { useSession } from 'next-auth/react';

import { cn } from '@/app/lib/utils/auth/tailwind-utils';

import SignInLink from './signin-link';
import SignedinToolbar from './signout-button';
import SignUpLink from './signup-link';
import VerticalSeparator from '../ui/vertical-separator';

const AuthToolbar = ({ className }: { className?: string }) => {
  const { data: session, status } = useSession();

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.info('[AuthToolbar] Session status:', status);
    console.info('[AuthToolbar] Session data:', session);
    console.info('[AuthToolbar] User data:', session?.user);
    console.info('[AuthToolbar] Username:', session?.user?.username);
  }

  // Show loading state or nothing while checking authentication
  if (status === 'loading') {
    return (
      <div className={cn('flex items-center justify-center gap-2', className)}>
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Show authenticated toolbar if user is logged in
  if (status === 'authenticated' && session) {
    console.info('[AuthToolbar] Rendering authenticated toolbar');
    return <SignedinToolbar className={className} />;
  }

  // Show sign in/up links for unauthenticated users
  console.info('[AuthToolbar] Rendering unauthenticated links');
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <SignInLink />
      <VerticalSeparator />
      <SignUpLink />
    </div>
  );
};

export default AuthToolbar;
