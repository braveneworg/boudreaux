
import { useSession } from 'next-auth/react';
import SignInLink from './signin-link';
import SignUpLink from './signup-link';
import SignedinToolbar from './signout-button';
import VerticalSeparator from '../forms/ui/vertical-separator';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';

const AuthToolbar = ({ className }: { className?: string }) => {
  const { status } = useSession();

  return (
    status === 'unauthenticated' ? (
      <div className={cn('flex items-center justify-center gap-2', className)}>
        <SignInLink />
        <VerticalSeparator />
        <SignUpLink />
      </div>
    ) : (
      <SignedinToolbar className={className} />
    )
  );
};

export default AuthToolbar;
