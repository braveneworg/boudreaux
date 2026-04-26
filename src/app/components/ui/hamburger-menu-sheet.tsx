/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/app/components/ui/sheet';

import SocialMediaIconLinks from './social-media-icon-links';
import AuthToolbar from '../auth/auth-toolbar';

export interface MenuItem {
  name: string;
  href: string;
}

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

export default function HamburgerMenuSheet({
  isOpen,
  onOpenChange,
  menuItems,
  children,
}: HamburgerMenuSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <div className="relative size-9 -top-0.5">{children}</div>
      <SheetContent
        side="right"
        className="fixed inset-x-0 w-screen sm:max-w-none h-[calc(100vh-48px)] md:h-[calc(100vh-144px)] top-12 md:top-36 border-0 z-200 pt-0 px-8 backdrop-blur before:inset-0 bg-zinc-950/90 bg-cover bg-center bg-no-repeat pointer-events-auto"
        style={{
          backgroundImage: "url('/media/particles-6.svg')",
        }}
        aria-label="Navigation menu"
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <SheetDescription className="sr-only">
          Site navigation links and account actions.
        </SheetDescription>
        <nav className="flex flex-col" aria-label="Main navigation">
          <SocialMediaIconLinks className="pt-2 justify-center" />
          <AuthToolbar className="text-zinc-50 pb-0" onNavigate={() => onOpenChange(false)} />
          <ul className="-mt-4">
            {menuItems.map((item, index) => (
              <li
                key={item.name}
                className="menu-item-stagger"
                style={{
                  opacity: isOpen ? 1 : 0,
                  transform: isOpen ? 'translateX(0)' : 'translateX(20px)',
                  transition: `opacity 0.3s ease ${index * 0.1}s, transform 0.3s ease ${index * 0.1}s`,
                }}
              >
                <a
                  href={item.href}
                  className="mt-5 tracking-wider text-zinc-50 text-shadow-sm text-2xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:rounded-md block"
                  onClick={() => onOpenChange(false)}
                  tabIndex={0}
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
