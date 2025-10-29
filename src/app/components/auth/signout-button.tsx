import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { CONSTANTS } from '@/app/lib/constants';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';

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
    <div className={cn(isMobile ? 'items-center' : 'flex items-center', className)}>
      <SignedInAs />
      {!isMobile && <VerticalSeparator />}
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
          {!isMobile && <VerticalSeparator />}
          <AdminLink />
        </>
      )}
    </div>
  );
};

export default SignedinToolbar;
