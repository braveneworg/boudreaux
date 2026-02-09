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
            ? 'https://cdn.fakefourrecords.com/media/fake-four-inc-black-hand-logo.svg'
            : 'https://cdn.fakefourrecords.com/media/fake-four-inc-black-stardust-hand-logo.svg'
        }
        width={48}
      />
    </Link>
  );
};

export default Logo;
