'use client';

import { useState } from 'react';

import { Button } from '@/app/components/ui/button';
import HamburgerMenuSheet from '@/app/components/ui/hamburger-menu-sheet';
import HamburgerPatty from '@/app/components/ui/hamburger-patty';

import { SheetTrigger } from './sheet';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'Home', href: '#home' },
    { name: 'Releases', href: '#about' },
    { name: 'Tours', href: '#services' },
    { name: 'Merch', href: '#portfolio' },
    { name: 'About', href: '#about' },
    { name: 'Contact us', href: '#contact' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-[15002] py-4 flex justify-end">
      <HamburgerMenuSheet isOpen={isOpen} onOpenChange={setIsOpen} menuItems={menuItems}>
        <SheetTrigger className="relative right-2 z-[15001]" asChild>
          <Button className="relative -top-0.5">
            <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
            <HamburgerPatty isOpen={isOpen} rotateOpen={45} yOffset={-8} duration={0.3} />
            <HamburgerPatty isOpen={isOpen} opacityOpen={0} yOffset={0} duration={0.2} />
            <HamburgerPatty isOpen={isOpen} rotateOpen={-45} yOffset={8} duration={0.3} />
          </Button>
        </SheetTrigger>
      </HamburgerMenuSheet>
    </header>
  );
}
