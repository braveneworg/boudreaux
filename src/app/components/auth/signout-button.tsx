import { useRouter } from 'next/navigation';

import { LogOutIcon } from 'lucide-react';
import { signOut } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';

import EditProfileButton from './edit-profile-button';
import SignedInAs from './signed-in-as';
import { Button } from '../ui/button';
import VerticalSeparator from '../ui/vertical-separator';

// Use in hamburger menu on mobile
const SignedinToolbar = ({ className }: { className?: string }) => {
  const isMobile = useIsMobile();
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
    </div>
  );
};

export default SignedinToolbar;
