import { LogInIcon } from 'lucide-react';
import Link from 'next/link';

const SignInLink = () => (
    <Link href="/signin" className='flex items-center gap-2 mr-2'>
      <LogInIcon />
      Sign In
    </Link>
  );

  export default SignInLink;
