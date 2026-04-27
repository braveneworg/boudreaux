import md5 from 'crypto-js/md5';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export const GravatarAvatar = ({
  email,
  firstName,
  surname,
  className,
}: {
  email: string;
  firstName?: string;
  surname?: string;
  className?: string;
}) => {
  const hash = md5(email.trim().toLowerCase()).toString();
  const gravatarUrl = `https://www.gravatar.com/avatar/${hash}?d=retro`;

  const fallbackInitials =
    firstName && surname
      ? `${firstName[0]}${surname[0]}`
      : email
          .split('@')[0]
          .split('.')
          .map((part) => part[0])
          .join('')
          .toUpperCase();

  return (
    <Avatar className={cn('size-16 border border-zinc-900', className)}>
      <AvatarImage src={gravatarUrl} alt="User Avatar" />
      <AvatarFallback>{fallbackInitials}</AvatarFallback>
    </Avatar>
  );
};
