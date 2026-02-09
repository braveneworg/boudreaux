import Link from 'next/link';

import { LogInIcon } from 'lucide-react';

const SignInLink = () => (
  <Link href="/signin" className="flex text-zinc-50 underline items-center gap-2 text-sm">
    <LogInIcon size={16} />
    Sign In
  </Link>
);

export default SignInLink;
