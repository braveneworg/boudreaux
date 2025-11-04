'use client';

import { useEffect, useRef } from 'react';

import Image from 'next/image';

import Logo from './logo';
import HamburgerMenu from '../ui/hamburger-menu';

const Header = ({ isMobile = false }: { isMobile?: boolean }) => {
  const backgroundRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backgroundElement = backgroundRef.current;
    const overlayElement = overlayRef.current;
    if (!backgroundElement || !overlayElement) return;

    // Add the animation class to trigger the sparkling effect on background only
    backgroundElement.classList.add('particles-animate');

    // Create sparkling dots
    const createSparkles = () => {
      const sparkleCount = 20;
      for (let i = 0; i < sparkleCount; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'particle-sparkle';
        sparkle.style.left = `${Math.random() * 100}%`;
        sparkle.style.top = `${Math.random() * 100}%`;
        sparkle.style.animationDelay = `${Math.random() * 2}s`;
        sparkle.style.animationDuration = `${0.8 + Math.random() * 0.4}s`;
        overlayElement.appendChild(sparkle);
      }
    };

    // Create extinguishing particles after main sparkles
    const createExtinguishingParticles = () => {
      const extinguishCount = 15;
      for (let i = 0; i < extinguishCount; i++) {
        const extinguish = document.createElement('div');
        extinguish.className = 'particle-extinguish';
        extinguish.style.left = `${Math.random() * 100}%`;
        extinguish.style.top = `${Math.random() * 100}%`;
        extinguish.style.animationDelay = `${Math.random() * 1}s`;
        extinguish.style.animationDuration = `${1.2 + Math.random() * 0.6}s`;
        overlayElement.appendChild(extinguish);
      }
    };

    createSparkles();

    // Add extinguishing particles after 2.5 seconds
    const extinguishTimer = setTimeout(() => {
      createExtinguishingParticles();
    }, 2500);

    // Remove animation class and all particles after animation completes
    const cleanupTimer = setTimeout(() => {
      backgroundElement.classList.remove('particles-animate');
      overlayElement.innerHTML = '';
    }, 5500);

    return () => {
      clearTimeout(extinguishTimer);
      clearTimeout(cleanupTimer);
      overlayElement.innerHTML = '';
    };
  }, []);

  return (
    <div className="sticky top-0 left-0 right-0 z-[100] w-full">
      {/* Animated background layer */}
      <div
        ref={backgroundRef}
        className="absolute inset-0 bg-[url('/media/particles-4.svg')] bg-cover bg-center bg-no-repeat before:content-[''] before:absolute before:inset-0 before:opacity-90 before:pointer-events-none"
      />
      {/* Sparkle overlay */}
      <div ref={overlayRef} className="absolute inset-0 pointer-events-none z-10" />
      {/* Header content layer */}
      <div className="relative mx-auto w-full max-w-[1920px] px-1 pb-1.5 md:px-8 overflow-hidden z-20">
        <header className="flex items-center justify-between md:h-[144px] w-full min-w-0">
          <Logo isMobile={isMobile} />
          {isMobile && (
            <>
              <Image
                alt="Fake Four Inc. Words"
                className="relative right-1 w-[300px] h-[56px]"
                height={56}
                priority
                src="/media/fake-four-inc-words.png"
                width={300}
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
