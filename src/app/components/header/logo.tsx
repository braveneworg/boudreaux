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
        className="block ml-2 mt-2 size-[56px] md:size-[144px] rounded-full bg-white"
        height={56}
        priority
        src={
          isMobile
            ? '/media/fake-four-inc-black-hand-logo.svg'
            : '/media/fake-four-inc-black-stardust-hand-logo.svg'
        }
        width={56}
      />
    </Link>
  );
};

export default Logo;
