/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  isMobile: boolean;
}

const Logo = ({ isMobile }: LogoProps) => {
  return (
    <Link href="/">
      <Image
        alt="Fake Four Inc. Hand Logo"
        className="block ml-2 mt-1.5 size-12 md:size-36 rounded-full bg-white"
        height={48}
        priority
        unoptimized
        src={
          isMobile
            ? '/media/fake-four-inc-black-hand-logo.svg'
            : '/media/fake-four-inc-black-stardust-hand-logo.svg'
        }
        width={48}
      />
    </Link>
  );
};

export default Logo;
