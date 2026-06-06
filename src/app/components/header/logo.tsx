/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  isMobile: boolean;
}

export const Logo = ({ isMobile }: Readonly<LogoProps>) => {
  return (
    <Link href="/" className="shrink-0" prefetch={false}>
      <Image
        alt="Fake Four Inc. Hand Logo"
        className="mt-px ml-3 block size-10 rounded-full bg-zinc-50 xl:absolute xl:top-10 xl:left-8 xl:size-36"
        height={48}
        priority
        unoptimized
        src={
          isMobile
            ? '/media/fake-four-inc-black-hand-logo.svg'
            : '/media/ffinc-black-hand-sans-words-stardust.webp'
        }
        width={48}
      />
    </Link>
  );
};
