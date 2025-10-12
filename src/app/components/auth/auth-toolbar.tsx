
import { useSession } from 'next-auth/react';
import SignInLink from './signin-link';
import SignUpLink from './signup-link';
import SignedinToolbar from './signout-button';
import VerticalSeparator from '../forms/ui/vertical-separator';

const AuthToolbar = () => {
  const { status } = useSession();

  return (
    status === 'unauthenticated' ? (
      <>
        <SignInLink />
        <VerticalSeparator />
        <SignUpLink />
      </>
    ) : (
      <SignedinToolbar />
    )
  );
};

export default AuthToolbar;
