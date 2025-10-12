import { LogInIcon } from 'lucide-react';
import Link from 'next/link';

const SignInLink = () => (
    <Link href="/signin" className='flex items-center gap-2 text-sm'>
      <LogInIcon size={16} />
      Sign In
    </Link>
  );

  export default SignInLink;
