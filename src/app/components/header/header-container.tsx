/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils';

interface HeaderContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky, full-width shell for the site header. Stacks its children (the
 * decorative HeaderBackdrop and the foreground HeaderContent) and clips the
 * animated overflow below `xl`. At `xl` the bar goes full-bleed: clipping and
 * the glow shadow are dropped so the inline nav drawers can overhang the bar —
 * HeaderBackdrop clips its own animated layers instead.
 */
const HeaderContainer = ({ children, className }: HeaderContainerProps) => {
  return (
    <div
      className={cn(
        'sticky top-0 right-0 left-0 z-40 w-full overflow-hidden shadow-[0_0_30px_0_rgba(0,0,0,1)] xl:overflow-visible xl:border-b-2 xl:border-b-zinc-50 xl:shadow-none',
        className
      )}
    >
      {children}
    </div>
  );
};

export { HeaderContainer };
