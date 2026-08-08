/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useGravatarHash } from '@/hooks/use-gravatar-hash';
import { cn } from '@/lib/utils';

export type GravatarDefaultStyle =
  | 'retro'
  | 'identicon'
  | 'monsterid'
  | 'wavatar'
  | 'robohash'
  | 'mp'
  | '404';

interface GravatarAvatarProps {
  /** Gravatar source. Either `email` (hashed client-side) or `hash` (precomputed server-side). */
  email?: string;
  /** Precomputed Gravatar hash. Preferred for peer avatars so emails are not exposed. */
  hash?: string;
  firstName?: string;
  surname?: string;
  /** Pixel size requested from Gravatar. Defaults to 48. */
  size?: number;
  /** Gravatar fallback style. Defaults to 'retro' for back-compat. */
  defaultStyle?: GravatarDefaultStyle;
  className?: string;
}

export const GravatarAvatar = ({
  email,
  hash,
  firstName,
  surname,
  size = 48,
  defaultStyle = 'retro',
  className,
}: GravatarAvatarProps) => {
  const computedHash = useGravatarHash(hash ? undefined : email);
  const resolvedHash = hash ?? computedHash;
  const gravatarUrl = `https://www.gravatar.com/avatar/${resolvedHash}?s=${size}&d=${defaultStyle}`;

  const fallbackInitials =
    firstName && surname
      ? `${firstName[0]}${surname[0]}`
      : email
        ? email
            .split('@')[0]
            .split('.')
            .map((part) => part[0])
            .join('')
            .toUpperCase()
        : '?';

  return (
    <Avatar className={cn('size-13 border border-zinc-50', className)}>
      <AvatarImage src={gravatarUrl} alt="User Avatar" />
      <AvatarFallback>{fallbackInitials}</AvatarFallback>
    </Avatar>
  );
};
