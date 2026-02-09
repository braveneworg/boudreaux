'use client';

import Image from 'next/image';
import Link from 'next/link';

import { getCdnUrl } from '@/lib/utils/cdn-utils';

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
            ? getCdnUrl('fake-four-inc-black-hand-logo.svg')
            : getCdnUrl('fake-four-inc-black-stardust-hand-logo.svg')
        }
        width={48}
      />
    </Link>
  );
};

export default Logo;
