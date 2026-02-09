import Link from 'next/link';

import { UserPlus } from 'lucide-react';

const SignUpLink = () => (
  <Link href="/signup" className="flex text-zinc-50 underline items-center gap-2 text-sm">
    <UserPlus size={16} />
    Sign Up
  </Link>
);

export default SignUpLink;
