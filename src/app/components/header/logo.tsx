'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { cn } from '@/app/lib/utils/tailwind-utils';

interface LogoProps {
  isMobile: boolean;
}

const Logo = ({ isMobile }: LogoProps) => {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Stop animation when pathname changes (page loaded)
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    // Listen for all navigation events globally
    const handleStart = () => setIsNavigating(true);

    // Listen to route changes
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleStart);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleStart);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    // Always trigger animation on click, regardless of current path
    setIsNavigating(true);

    // If already on home page, force a refresh
    if (pathname === '/') {
      router.refresh();
    } else {
      router.push('/');
    }
  };

  return (
    <Link
      className="flex relative z-10 cursor-pointer touch-manipulation"
      href="/"
      onClick={handleClick}
      onTouchEnd={handleClick}
    >
      <Image
        alt="Fake Four Inc. Logo"
        className={cn(
          'ml-2 mt-1 size-[56px] md:size-[144px] rounded-full bg-white pointer-events-none',
          isNavigating ? 'animate-spin-slow' : ''
        )}
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
