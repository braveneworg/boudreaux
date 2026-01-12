import Link from 'next/link';

import { KeyIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/lib/utils';

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
    <>
      <div className={cn('flex items-center gap-2')}>
        {!isMobile && (
          <div className="flex flex-row gap-2">
            <KeyIcon size={16} />
            <span className="text-sm">Signed in as: </span>
          </div>
        )}
        <KeyIcon size={16} className="md:hidden" />
        <Link className="text-sm hover:underline underline-offset-4" href="/profile">
          @{username}
        </Link>
      </div>
    </>
  );
};

export default SignedInAs;
