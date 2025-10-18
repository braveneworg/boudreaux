import Link from 'next/link';

const SuccessContainer = () => (
  <>
    <h1>Success! 🎉</h1>
    <p>
      Your username has been successfully changed.{' '}
      <Link href="/profile">Return to your profile</Link> or <Link href="/">the home view</Link>.
    </p>
  </>
);

export default SuccessContainer;
