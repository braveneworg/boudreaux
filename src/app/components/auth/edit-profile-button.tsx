import { UserIcon } from 'lucide-react'
import Link from 'next/link'

const EditProfileButton = () => {
  return (
    <Link className="flex items-center gap-2" href="/profile/edit">
      <UserIcon size={16} />
      <span className="text-sm hover:underline">Edit Profile</span>
    </Link>
  )
};

export default EditProfileButton;
