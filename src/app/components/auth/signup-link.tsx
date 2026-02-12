import Link from 'next/link';

import { UserPlus } from 'lucide-react';

const SignUpLink = ({ onClick }: { onClick?: () => void }) => (
  <Link
    href="/signup"
    className="flex text-zinc-50 underline items-center gap-2 text-sm"
    onClick={onClick}
  >
    <UserPlus size={16} />
    Sign Up
  </Link>
);

export default SignUpLink;
