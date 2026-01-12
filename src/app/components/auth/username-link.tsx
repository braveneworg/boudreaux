import Link from 'next/link';

const UsernameLink = ({ username }: { username: string }) => {
  return (
    <Link
      href={`/profile/${username}`}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      @{username}
    </Link>
  );
};

export default UsernameLink;
