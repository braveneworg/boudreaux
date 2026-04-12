/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import Image from 'next/image';

import Logo from './logo';
import HamburgerMenu from '../ui/hamburger-menu';

/**
 * Deterministic pseudo-random based on index — avoids hydration mismatch
 * while producing visually varied positions/delays.
 *
 * Rounded to 4 decimal places so Node and browser `Math.sin` float
 * differences don't cause mismatched style strings.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49979;
  return Math.round((x - Math.floor(x)) * 10000) / 10000;
}

const Header = ({ isMobile = false }: { isMobile?: boolean }) => {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `sparkle-${i}`,
        left: seededRandom(i * 3 + 1) * 100,
        top: seededRandom(i * 3 + 2) * 100,
        delay: seededRandom(i * 3 + 3) * 2,
        duration: 1.4 + seededRandom(i * 3 + 4) * 0.4,
      })),
    []
  );

  const extinguishParticles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        id: `extinguish-${i}`,
        left: seededRandom(i * 5 + 100) * 100,
        top: seededRandom(i * 5 + 101) * 100,
        delay: seededRandom(i * 5 + 102) * 1,
        duration: 1.2 + seededRandom(i * 5 + 103) * 0.6,
      })),
    []
  );

  return (
    <div className="sticky top-0 left-0 right-0 z-40 w-full overflow-hidden shadow-[0_0_30px_0_rgba(0,0,0,1)]">
      {/* Animated background layer — CSS animation replaces framer-motion */}
      <div className="absolute inset-0 bg-[url('/media/particles-6.svg')] bg-black bg-cover bg-center bg-no-repeat header-bg-pulse before:content-[''] before:absolute before:inset-0 before:pointer-events-none" />
      {/* Sparkle overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Main sparkles */}
        {sparkles.map((sparkle) => (
          <span
            className="absolute w-1 h-1 bg-white rounded-full header-sparkle"
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
            className="absolute w-0.5 h-0.5 bg-orange-400 rounded-full header-extinguish"
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
      <div className="relative mx-auto w-full max-w-480 pl-0 md:px-8 overflow-hidden z-20">
        <header className="relative flex items-center justify-between leading-[58px] h-[58px] md:h-[122px] w-full min-w-0">
          <Logo isMobile={isMobile} />
          {isMobile && (
            <>
              <Image
                alt="Fake Four Inc. Words"
                className="relative right-0.5 w-[202px] h-auto"
                priority
                src="/media/fake-four-inc-words-sans-hand.webp"
                width={222}
                height={40}
              />
              <HamburgerMenu />
            </>
          )}
        </header>
      </div>
    </div>
  );
};

export { Header };
