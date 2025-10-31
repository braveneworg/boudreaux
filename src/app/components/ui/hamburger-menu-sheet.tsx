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
  /**
   * Side of the screen where the sheet appears
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * Background color class
   */
  bgColor?: string;
  /**
   * Text size class
   */
  textSize?: string;
  /**
   * Font weight class
   */
  fontWeight?: string;
  /**
   * Hover text color class
   */
  hoverTextColor?: string;
  /**
   * Top padding class
   */
  paddingTop?: string;
  /**
   * Horizontal padding class
   */
  paddingX?: string;
  /**
   * List top padding class
   */
  listPaddingTop?: string;
  /**
   * Space between menu items
   */
  itemSpacing?: string;
  /**
   * Initial animation delay multiplier for stagger effect
   */
  staggerDelay?: number;
  opacity?: string;
  children?: React.ReactNode;
}

export default function HamburgerMenuSheet({
  isOpen,
  onOpenChange,
  menuItems,
  side = 'right',
  bgColor = 'bg-zinc-950',
  textSize = 'text-2xl',
  fontWeight = 'font-light',
  hoverTextColor = 'hover:text-gray-400',
  paddingTop = 'pt-20',
  paddingX = 'px-8',
  listPaddingTop = 'pt-4',
  itemSpacing = 'space-y-6',
  staggerDelay = 0.1,
  children,
}: HamburgerMenuSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <div className="absolute z-[9999] size-[40px]">{children}</div>
      <SheetContent
        side={side}
        className={`w-full bg-none [&>button]:hidden absolute border-t-[1px] border-t-zinc-200 top-[68px] z-[8675] ${paddingTop} ${paddingX} before:absolute before:inset-0 before:${bgColor} before:bg-[url(/media/particles-4.svg)] before:bg-cover before:bg-center before:bg-no-repeat before:-z-10`}
        aria-label="Navigation menu"
      >
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <nav aria-label="Main navigation">
          <ul className={`${itemSpacing} ${listPaddingTop}`} role="list">
            {menuItems.map((item, index) => (
              <motion.li
                key={item.name}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * staggerDelay }}
                role="listitem"
              >
                <a
                  href={item.href}
                  className={`text-white ${textSize} ${fontWeight} ${hoverTextColor} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:rounded-md block`}
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
