/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { UserIcon } from 'lucide-react';

import { useIsMobile } from '@/app/hooks/use-mobile';

const EditProfileButton = () => {
  const isMobile = useIsMobile();

  return isMobile ? null : (
    <Link className="flex items-center gap-2 text-xl" href="/profile">
      <UserIcon size={18} className="mt-1" />
      Edit Profile
    </Link>
  );
};

export default EditProfileButton;
