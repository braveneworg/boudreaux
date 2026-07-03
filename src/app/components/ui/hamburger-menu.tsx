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
            // Borderless, shadowless tap target — the zinc-50 stamp accent
            // rides an inner box sized to the patty lines instead.
            className="pointer-events-auto relative top-0.5 right-2 border-0 bg-transparent shadow-none hover:shadow-none active:shadow-none"
          >
            <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
            <span className="shadow-zine-sm relative flex size-5 items-center justify-center [--card-accent:var(--color-zinc-50)]">
              <HamburgerPatty isOpen={isOpen} rotateOpen={45} yOffset={-8} duration={0.3} />
              <HamburgerPatty isOpen={isOpen} opacityOpen={0} yOffset={0} duration={0.2} />
              <HamburgerPatty isOpen={isOpen} rotateOpen={-45} yOffset={8} duration={0.3} />
            </span>
          </Button>
        </SheetTrigger>
      </HamburgerMenuSheet>
    </div>
  );
};
