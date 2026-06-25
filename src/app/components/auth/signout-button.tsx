/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useIsMobile } from '@/app/hooks/use-mobile';
import { useSession } from '@/app/hooks/use-session';
import type { ClientSessionData } from '@/app/hooks/use-session';
import { GravatarAvatar } from '@/components/gravatar-avatar';
import { CONSTANTS } from '@/lib/constants';
import { cn } from '@/lib/utils/tailwind-utils';
import { VerticalSeparator } from '@/ui/vertical-separator';

import { AdminLink } from './admin-link';
import { EditProfileButton } from './edit-profile-button';
import { SignOutButton } from './sign-out-button';
import { SignedInAs } from './signed-in-as';

interface GravatarProps {
  email: string;
  firstName?: string;
  surname?: string;
}

/** Derives the Gravatar props (email + split name parts) from the session. */
const resolveGravatarProps = (session: ClientSessionData | null): GravatarProps => {
  const nameParts = session?.user?.name?.split(' ');
  return {
    email: session?.user?.email || '',
    firstName: nameParts?.[0],
    surname: nameParts?.[1],
  };
};

// Use in hamburger menu on mobile
export const SignedInToolbar = ({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const isAdmin = session?.user?.role === CONSTANTS.ROLES.ADMIN;
  const gravatarProps = resolveGravatarProps(session);

  return (
    <div className={cn('mt-3', className)}>
      <div className="mb-3 flex items-center gap-3">
        <GravatarAvatar {...gravatarProps} />
        <div className="flex flex-col gap-1.5">
          <SignedInAs onClick={onNavigate} />
          <div className="flex items-center gap-4">
            <SignOutButton onNavigate={onNavigate} />
            {!isMobile && <VerticalSeparator className="mx-2 h-4! w-0.5! self-stretch" />}
            <EditProfileButton />
            {isAdmin && <AdminLink onClick={onNavigate} />}
          </div>
        </div>
      </div>
    </div>
  );
};
