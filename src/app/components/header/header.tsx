/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { useSparklingParticles } from '@/hooks/use-sparkling-particles';
import { cn } from '@/lib/utils/tailwind-utils';
import { HamburgerMenu } from '@/ui/hamburger-menu';

import { DesktopAuthMenu } from '../desktop-auth-menu';
import { DesktopMenu } from '../desktop-menu';
import { Logo } from './logo';

const Header = ({
  isMobile = false,
  className = '',
}: {
  isMobile?: boolean;
  className?: string;
}) => {
  const { sparkles, extinguishParticles } = useSparklingParticles();

  return (
    <div
      className={`sticky top-0 right-0 left-0 z-40 w-full overflow-hidden shadow-[0_0_30px_0_rgba(0,0,0,1)] xl:border-b-2 xl:border-b-zinc-50 ${className}`}
    >
      {/* Animated background layer — CSS animation replaces framer-motion */}
      <div
        className={cn(
          "header-bg-pulse inset-0 before:pointer-events-none before:absolute before:inset-0 before:content-[''] xl:absolute",
          {
            'before:bg-[url(/media/ffinc-starfield-tile.png)] before:bg-repeat': !isMobile,
            "bg-black before:bg-[url('/media/particles-6.svg')] before:bg-cover before:bg-center before:bg-no-repeat":
              isMobile,
          }
        )}
      />
      {/* Sparkle overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Main sparkles */}
        {sparkles.map((sparkle) => (
          <span
            className="header-sparkle absolute h-1 w-1 rounded-full bg-white"
            key={sparkle.id}
            style={{
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
              animationDelay: `${sparkle.delay}s`,
              animationDuration: `${sparkle.duration}s`,
            }}
          />
        ))}
        {/* Extinguishing particles */}
        {extinguishParticles.map((particle) => (
          <span
            className="header-extinguish absolute h-0.5 w-0.5 rounded-full bg-orange-400"
            key={particle.id}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: `${2.5 + particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            }}
          />
        ))}
      </div>
      {/* Header content layer */}
      <div className="xl:border-b-px relative z-20 mx-auto w-full overflow-hidden pb-1 pl-0 xl:max-w-480">
        <header className="border-b-px relative flex h-14.5 w-full min-w-0 items-center justify-between leading-14.5 xl:h-56 xl:justify-start">
          <Logo isMobile={isMobile} />
          {isMobile && (
            <>
              <Image
                alt="Fake Four Inc. Words"
                className="relative right-0.5 h-auto w-50.5"
                priority
                src="/media/fake-four-inc-words-sans-hand.webp"
                width={222}
                height={40}
              />
              <HamburgerMenu />
            </>
          )}
          {!isMobile && (
            <>
              <Image
                alt="Fake Four Inc. Words"
                className="absolute top-6 left-1/2 z-40 h-auto w-auto -translate-x-1/2 transform"
                priority
                src="/media/fake-four-inc-words-sans-hand.webp"
                width={444}
                height={40}
              />

              <DesktopMenu />
              <DesktopAuthMenu className="absolute top-6 right-10 z-30" />
            </>
          )}
        </header>
      </div>
    </div>
  );
};

export { Header };
