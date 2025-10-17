import Link from 'next/link';

const SuccessContainer = ({ email }: { email: string }) => (
  <>
    <h1>Success! 🎉</h1>
    <p>
      You have successfully changed your email address. You have also been signed out.
      <Link href="/signin">Sign in again</Link> using your new email address:
      <strong>{email}</strong>.
    </p>
  </>
);

export default SuccessContainer;
