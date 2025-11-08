import Link from 'next/link';

const UsernameLink = ({ username }: { username: string }) => {
  return (
    <Link className="text-sm hover:underline underline-offset-4" href={`/profile/${username}`}>
      @{username}
    </Link>
  );
};

export default UsernameLink;
