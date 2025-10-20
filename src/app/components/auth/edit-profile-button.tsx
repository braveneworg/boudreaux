import Link from 'next/link';

import { UserIcon } from 'lucide-react';

const EditProfileButton = () => {
  return (
    <Link className="flex items-center gap-2 text-sm underline-offset-4" href="/profile">
      <UserIcon size={16} />
      Edit Profile
    </Link>
  );
};

export default EditProfileButton;
