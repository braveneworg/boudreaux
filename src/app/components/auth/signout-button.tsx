import { Button } from '../forms/ui/button';
import SignedInAs from './signed-in-as';
import { signOut } from 'next-auth/react';
import { LogOutIcon } from 'lucide-react';
import VerticalSeparator from '../forms/ui/vertical-separator';
import EditProfileButton from './edit-profile-button';
import { useIsMobile } from '@/app/hooks/use-mobile';
import { cn } from '@/app/lib/utils/auth/tailwind-utils';
import { useRouter } from 'next/navigation';

// Use in hamburger menu on mobile
const SignedinToolbar = ({ className }: { className?: string }) => {
  const isMobile = useIsMobile();
  const router = useRouter();

  return (
    <div className={cn({ 'flex-col': isMobile, 'flex-row': !isMobile }, 'flex items-center', className)}>
      <SignedInAs />
      {!isMobile && <VerticalSeparator />}
      <Button variant="link:narrow" onClick={() => {
        signOut({ redirect: false });
        router.push('/success/signout');
      }}>
        <LogOutIcon />
        Sign Out
      </Button>
      {!isMobile && <VerticalSeparator />}
      <EditProfileButton />
    </div>
  );
};

export default SignedinToolbar;
