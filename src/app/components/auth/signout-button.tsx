import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { CONSTANTS } from '@/app/lib/constants';
import { cn } from '@/app/lib/utils/tailwind-utils';

import AdminLink from './admin-link';
import EditProfileButton from './edit-profile-button';
import SignedInAs from './signed-in-as';
import { Button } from '../ui/button';
import VerticalSeparator from '../ui/vertical-separator';

// Use in hamburger menu on mobile
const SignedinToolbar = ({ className }: { className?: string }) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const isAdmin = session?.user?.role === CONSTANTS.ROLES.ADMIN;
  const router = useRouter();

  return (
    <div className={cn('h-[20px] my-2', className)}>
      <div
        className={cn(
          'flex h-[20px] items-center relative justify-center gap-2',
          { 'gap-4': isMobile },
          className
        )}
      >
        <SignedInAs />
        <VerticalSeparator />
        <Button
          variant="link:narrow"
          onClick={async () => {
            const { url } = await signOut({ redirect: false, callbackUrl: '/' });
            router.push(url);
          }}
        >
          <LogOutIcon />
          Sign Out
        </Button>
        {!isMobile && <VerticalSeparator />}
        <EditProfileButton />
        {isAdmin && (
          <>
            <VerticalSeparator />
            <AdminLink />
          </>
        )}
      </div>
    </div>
  );
};

export default SignedinToolbar;
