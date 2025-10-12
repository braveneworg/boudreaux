import { UserPlus } from 'lucide-react';
import Link from 'next/link';

const SignUpLink = () => (
  <Link className="flex items-center gap-2 ml-2" href="/signup">
    <span><UserPlus /></span>
    <span>Sign Up</span>
  </Link>
);

export default SignUpLink;
