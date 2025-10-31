'use client';

import { motion } from 'framer-motion';

import { Sheet, SheetContent, SheetTitle } from '@/app/components/ui/sheet';

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
      <div className="absolute z-[9999] size-[40px]">{children}</div>
      <SheetContent
        side="right"
        className="w-full absolute top-[68px] z-[8675] pt-0 px-8 before:absolute before:inset-0 before:bg-zinc-950 before:bg-[url(/media/particles-4.svg)] before:bg-cover before:bg-center before:bg-no-repeat before:-z-10"
        aria-label="Navigation menu"
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <nav aria-label="Main navigation">
          <ul className="space-y-6 pt-4" role="list">
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
                  className="text-white text-2xl font-light hover:text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:rounded-md block"
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
