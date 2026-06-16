/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { Button } from '@/app/components/ui/button';
import { HamburgerMenuSheet } from '@/app/components/ui/hamburger-menu-sheet';
import { HamburgerPatty } from '@/app/components/ui/hamburger-patty';
import { useNavMenuItems } from '@/hooks/use-nav-menu-items';

import { SheetTrigger } from './sheet';

export const HamburgerMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuItems = useNavMenuItems();

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
};
