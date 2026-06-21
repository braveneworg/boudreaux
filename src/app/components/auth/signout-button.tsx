/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useSession } from 'next-auth/react';

import { useIsMobile } from '@/app/hooks/use-mobile';
import { GravatarAvatar } from '@/components/gravatar-avatar';
import { CONSTANTS } from '@/lib/constants';
import { cn } from '@/lib/utils/tailwind-utils';
import { VerticalSeparator } from '@/ui/vertical-separator';

import { AdminLink } from './admin-link';
import { EditProfileButton } from './edit-profile-button';
import { SignOutButton } from './sign-out-button';
import { SignedInAs } from './signed-in-as';

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

  return (
    <div className={cn('mt-3', className)}>
      <div className="mb-3 flex items-center gap-3">
        <GravatarAvatar
          email={session?.user?.email || ''}
          firstName={session?.user?.name?.split(' ')[0]}
          surname={session?.user?.name?.split(' ')[1]}
        />
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
