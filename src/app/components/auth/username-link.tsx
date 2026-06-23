/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

export const UsernameLink = ({ username }: { username: string }) => {
  return (
    <Link href={`/profile/${username}`} className="hover:text-foreground text-sm text-zinc-950">
      @{username}
    </Link>
  );
};
