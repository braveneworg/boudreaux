/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/app/components/ui/sheet';

import { MobileMenu, type MenuItem } from './mobile-menu';

export type { MenuItem };

export interface HamburgerMenuSheetProps {
  /**
   * Whether the sheet is open
   */
  isOpen: boolean;
  /**
   * Callback when the open state changes
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Array of menu items to display
   */
  menuItems: MenuItem[];
  children?: React.ReactNode;
}

export const HamburgerMenuSheet = ({
  isOpen,
  onOpenChange,
  menuItems,
  children,
}: HamburgerMenuSheetProps) => (
  <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <div className="size-9">{children}</div>
    <SheetContent
      side="right"
      className="mobile-nav-backdrop pointer-events-auto fixed inset-x-0 top-14 z-200 h-[calc(100vh-48px)] w-screen border-0 bg-zinc-950/95 bg-cover bg-center bg-no-repeat px-8 pt-0 backdrop-blur-sm before:inset-0 sm:max-w-none md:top-36 md:h-[calc(100vh-144px)]"
      aria-label="Navigation menu"
    >
      <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
      <SheetDescription className="sr-only">
        Site navigation links and account actions.
      </SheetDescription>
      <MobileMenu menuItems={menuItems} onNavigate={() => onOpenChange(false)} />
    </SheetContent>
  </Sheet>
);
