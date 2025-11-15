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
        className="block ml-[8px] mt-1.5 size-[48px] md:size-[144px] rounded-full bg-white"
        height={48}
        priority
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
