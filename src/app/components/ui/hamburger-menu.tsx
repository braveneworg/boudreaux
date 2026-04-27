/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { useSession } from 'next-auth/react';

import { Button } from '@/app/components/ui/button';
import HamburgerMenuSheet from '@/app/components/ui/hamburger-menu-sheet';
import HamburgerPatty from '@/app/components/ui/hamburger-patty';

import { SheetTrigger } from './sheet';

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const menuItems = useMemo(() => {
    const items = [
      { name: 'Home', href: '/' },
      { name: 'Releases', href: '/releases' },
      { name: 'Tours', href: '/tours' },
      { name: 'Merch', href: '/merch' },
      { name: 'About', href: '/about' },
      { name: 'Contact Us', href: '/contact' },
    ];

    if (isAuthenticated) {
      items.splice(3, 0, { name: 'My Collection', href: '/collection' });
    }

    return items;
  }, [isAuthenticated]);

  return (
    <div className="pointer-events-none flex items-center justify-end">
      <HamburgerMenuSheet isOpen={isOpen} onOpenChange={setIsOpen} menuItems={menuItems}>
        <SheetTrigger className="relative" asChild>
          <Button
            size="icon"
            className="pointer-events-auto relative top-0.5 right-2 bg-transparent"
          >
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
