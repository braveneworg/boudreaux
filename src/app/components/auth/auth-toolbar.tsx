import { useSession } from 'next-auth/react';
import SignInLink from './signin-link';
import SignUpLink from './signup-link';
import SignedinToolbar from './signout-button';
import VerticalSeparator from '../ui/vertical-separator';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';

const AuthToolbar = ({ className }: { className?: string }) => {
  const { data: session, status } = useSession();

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[AuthToolbar] Session status:', status);
    console.log('[AuthToolbar] Session data:', session);
    console.log('[AuthToolbar] User data:', session?.user);
    console.log('[AuthToolbar] Username:', session?.user?.username);
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
    console.log('[AuthToolbar] Rendering authenticated toolbar');
    return <SignedinToolbar className={className} />;
  }

  // Show sign in/up links for unauthenticated users
  console.log('[AuthToolbar] Rendering unauthenticated links');
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <SignInLink />
      <VerticalSeparator />
      <SignUpLink />
    </div>
  );
};

export default AuthToolbar;
