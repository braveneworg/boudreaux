/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import Image from 'next/image';

import { motion } from 'framer-motion';

import Logo from './logo';
import HamburgerMenu from '../ui/hamburger-menu';

const Header = ({ isMobile = false }: { isMobile?: boolean }) => {
  // Generate sparkle positions only on client using lazy initialization
  const [sparkles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: `sparkle-${i}`,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 1.4 + Math.random() * 0.4,
    }))
  );

  const [extinguishParticles] = useState(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: `extinguish-${i}`,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 1,
      duration: 1.2 + Math.random() * 0.6,
    }))
  );

  return (
    <div className="sticky top-0 left-0 right-0 z-40 w-full overflow-hidden shadow-[0_0_30px_0_rgba(0,0,0,1)]">
      {/* Animated background layer */}
      <motion.div
        animate={{
          opacity: [0.9, 1],
          scale: [1, 1.02],
        }}
        className="absolute inset-0 bg-[url('/media/particles-6.svg')] bg-black bg-cover bg-center bg-no-repeat before:content-[''] before:absolute before:inset-0 before:pointer-events-none"
        initial={{ opacity: 0.9 }}
        transition={{
          duration: 4.4,
          ease: 'easeInOut',
        }}
      />
      {/* Sparkle overlay - suppressHydrationWarning due to random positions */}
      <div className="absolute inset-0 pointer-events-none z-10" suppressHydrationWarning>
        {/* Main sparkles */}
        {sparkles.map((sparkle) => (
          <motion.div
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            className="absolute w-1 h-1 bg-white rounded-full"
            initial={{ opacity: 0, scale: 0 }}
            key={sparkle.id}
            style={{
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
            }}
            suppressHydrationWarning
            transition={{
              delay: sparkle.delay,
              duration: sparkle.duration,
              ease: 'easeOut',
            }}
          />
        ))}
        {/* Extinguishing particles */}
        {extinguishParticles.map((particle) => (
          <motion.div
            animate={{
              opacity: [0, 0.6, 0],
              scale: [0.5, 1, 0],
              y: [0, -10],
            }}
            className="absolute w-0.5 h-0.5 bg-orange-400 rounded-full"
            initial={{ opacity: 0, scale: 0.5 }}
            key={particle.id}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
            }}
            suppressHydrationWarning
            transition={{
              delay: 2.5 + particle.delay,
              duration: particle.duration,
              ease: 'easeOut',
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

export default Header;
