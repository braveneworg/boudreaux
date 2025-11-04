'use client';

import { useState } from 'react';

import { Button } from '@/app/components/ui/button';
import HamburgerMenuSheet from '@/app/components/ui/hamburger-menu-sheet';
import HamburgerPatty from '@/app/components/ui/hamburger-patty';

import { SheetTrigger } from './sheet';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'Home', href: '/' },
    { name: 'Releases', href: '/releases' },
    { name: 'Tours', href: '/tours' },
    { name: 'Merch', href: '/merch' },
    { name: 'About', href: '/about' },
    { name: 'Contact us', href: '/contact' },
  ];

  return (
    <div className="flex justify-end pointer-events-none">
      <HamburgerMenuSheet isOpen={isOpen} onOpenChange={setIsOpen} menuItems={menuItems}>
        <SheetTrigger className="relative" asChild>
          <Button className="pointer-events-auto">
            <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
            <HamburgerPatty isOpen={isOpen} rotateOpen={45} yOffset={-8} duration={0.3} />
            <HamburgerPatty isOpen={isOpen} opacityOpen={0} yOffset={0} duration={0.2} />
            <HamburgerPatty isOpen={isOpen} rotateOpen={-45} yOffset={8} duration={0.3} />
          </Button>
        </SheetTrigger>
      </HamburgerMenuSheet>
    </div>
  );
}
