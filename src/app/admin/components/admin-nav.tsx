/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Separator } from '@/app/components/ui/separator';
import { cn } from '@/lib/utils';

import { ADMIN_NAV_ITEMS } from './admin-nav-items';

/**
 * Persistent admin navigation: a horizontal, importance-ordered list of section
 * links rendered in the cutout display font with vertical separators between
 * items. Lives in the admin layout so it stays put across every admin page and
 * subpage. On narrow viewports the row scrolls horizontally rather than wrapping.
 */
export const AdminNav = (): React.ReactElement => {
  const pathname = usePathname();

  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Admin sections" className="border-border/60 border-b">
      <ul className="flex [scrollbar-width:none] items-center gap-3 overflow-x-auto py-3 [&::-webkit-scrollbar]:hidden">
        {ADMIN_NAV_ITEMS.map((item, index) => (
          <li key={item.href} className="flex items-center gap-3">
            {index > 0 && (
              <Separator orientation="vertical" className="h-4" decorative aria-hidden />
            )}
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'font-fake-four-cutout rounded-sm px-0.5 text-lg whitespace-nowrap transition-colors',
                'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
                isActive(item.href)
                  ? 'text-foreground underline underline-offset-8'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
