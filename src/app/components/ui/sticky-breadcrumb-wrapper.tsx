'use client';

import { useEffect, useState } from 'react';

type StickyBreadcrumbWrapperProps = {
  children: React.ReactNode;
  offsetTop?: number;
  isVisible?: boolean;
};

export function StickyBreadcrumbWrapper({
  children,
  offsetTop = 0,
  isVisible = true,
}: StickyBreadcrumbWrapperProps) {
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      setIsSticky(window.scrollY > offsetTop);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, [offsetTop]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`${
        isSticky ? 'fixed' : 'relative'
      } top-0 left-0 right-0 z-50 w-full mb-2 bg-white/80 py-3 transition-all duration-200 border-b border-gray-200`}
    >
      <div className="container mx-auto w-full max-w-full px-4">{children}</div>
    </div>
  );
}
