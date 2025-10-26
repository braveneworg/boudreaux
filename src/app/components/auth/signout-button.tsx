import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';

import AdminLink from './admin-link';
import EditProfileButton from './edit-profile-button';
import SignedInAs from './signed-in-as';
import { Button } from '../ui/button';
import VerticalSeparator from '../ui/vertical-separator';

type Roles = {
  readonly admin: 'admin';
};

const ROLES = {
  admin: 'admin',
} as const satisfies Roles;

const Separator = () => {
  const isMobile = useIsMobile();

  return !isMobile ? <VerticalSeparator /> : null;
};

// Use in hamburger menu on mobile
const SignedinToolbar = ({ className }: { className?: string }) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const isAdmin = session?.user?.role === ROLES.admin;
  const router = useRouter();

  return (
    <div
      className={cn(
        { 'flex-col': isMobile, 'flex-row': !isMobile },
        'flex items-center',
        className
      )}
    >
      <SignedInAs />
      <Separator />
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
      <Separator />
      <EditProfileButton />
      {isAdmin && (
        <>
          {' '}
          <Separator />
          <AdminLink />{' '}
        </>
      )}
    </div>
  );
};

export default SignedinToolbar;
