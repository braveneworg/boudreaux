import { KeyIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/app/lib/utils';

import UsernameLink from './username-link';

const SignedInAs = () => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.username;

  if (process.env.NODE_ENV === 'development') {
    console.info('[SignedInAs] Session:', session);
    console.info('[SignedInAs] User:', session?.user);
    console.info('[SignedInAs] Username:', username);
  }

  if (!username) {
    console.warn('[SignedInAs] No username found, returning null');
    return null;
  }

  return (
    <div className={cn({ 'flex-col': isMobile, 'flex-row': !isMobile }, 'flex items-center gap-2')}>
      <div className="flex flex-row gap-2">
        <KeyIcon size={16} />
        <span className="text-sm">Signed in as: </span>
      </div>
      <UsernameLink username={username} />
    </div>
  );
};

export default SignedInAs;
