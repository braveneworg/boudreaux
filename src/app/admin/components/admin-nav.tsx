/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Separator } from '@/app/components/ui/separator';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';

import { ADMIN_NAV_ITEMS } from './admin-nav-items';

/** How far each arrow tap nudges the menu, in pixels. */
const SCROLL_STEP = 200;

/**
 * Persistent admin navigation: a horizontal, importance-ordered list of section
 * links rendered in the cutout display font with vertical separators between
 * items. Lives in the admin layout so it stays put across every admin page and
 * subpage. On narrow viewports the row scrolls horizontally (swipe) and shows
 * light left/right arrow overlays that nudge it when there is more to reveal.
 */
export const AdminNav = (): React.ReactElement => {
  const pathname = usePathname();
  const scrollRef = React.useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // Reflect the current scroll position so each arrow only shows when there is
  // content to reveal in that direction.
  const updateScrollState = React.useCallback((): void => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState]);

  const scroll = (direction: 'left' | 'right'): void => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -SCROLL_STEP : SCROLL_STEP,
      behavior: 'smooth',
    });
  };

  return (
    <nav aria-label="Admin sections" className="border-border/60 relative border-b">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll admin sections left"
          onClick={() => scroll('left')}
          className={cn(
            'from-background via-background/90 absolute inset-y-0 left-0 z-10 flex w-9 items-center justify-start',
            'bg-linear-to-r to-transparent pl-0.5',
            'text-muted-foreground/70 hover:text-foreground transition-colors',
            'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]'
          )}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      )}

      <ul
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex [scrollbar-width:none] items-center gap-3 overflow-x-auto py-3 [&::-webkit-scrollbar]:hidden"
      >
        {ADMIN_NAV_ITEMS.map((item, index) => (
          <li key={item.href} className="flex items-center gap-3">
            {index > 0 && (
              <Separator orientation="vertical" className="h-4" decorative aria-hidden />
            )}
            <Link
              href={item.href}
              aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
              className={cn(
                'font-fake-four-cutout rounded-sm px-0.5 text-lg whitespace-nowrap transition-colors',
                'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
                isActiveHref(item.href, pathname)
                  ? 'text-foreground underline underline-offset-8'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll admin sections right"
          onClick={() => scroll('right')}
          className={cn(
            'from-background via-background/90 absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-end',
            'bg-linear-to-l to-transparent pr-0.5',
            'text-muted-foreground/70 hover:text-foreground transition-colors',
            'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]'
          )}
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      )}
    </nav>
  );
};
