'use client';

import { motion } from 'framer-motion';

import { Sheet, SheetContent, SheetTitle } from '@/app/components/ui/sheet';

import SocialMediaIconLinks from './social-media-icon-links';

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
      <div className="relative z-[40] size-[40px]">{children}</div>
      <SheetContent
        side="right"
        className="w-[100vw] top-[68.5px] border-0 z-[200] pt-0 px-8 absolute bg-transparent backdrop-blur before:inset-0 bg-[url(/media/particles-4.svg)] bg-cover bg-center opacity-95 bg-no-repeat z-10"
        aria-label="Navigation menu"
        isOpen={isOpen}
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <nav className="flex flex-col" aria-label="Main navigation">
          <SocialMediaIconLinks className="justify-center border-b-1 border-b-accent" />
          <ul className="pt-4 space-y-4" role="list">
            {menuItems.map((item, index) => (
              <motion.li
                key={item.name}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                role="listitem"
              >
                <a
                  href={item.href}
                  className="text-white text-shadow-sm text-2xl font-light hover:text-gray-300 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:rounded-md block"
                  style={{
                    textShadow: '0 2px 18px rgba(255, 255, 255, 0.8)',
                  }}
                  onClick={() => onOpenChange(false)}
                  tabIndex={0}
                >
                  {item.name}
                </a>
              </motion.li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
