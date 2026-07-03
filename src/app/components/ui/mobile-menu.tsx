/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AuthToolbar } from '@/components/auth/auth-toolbar';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';

import { SocialMediaIconLinks } from './social-media-icon-links';

export interface MenuItem {
  name: string;
  href: string;
  /**
   * Tailwind utilities that color the link on its active and `hover:` states
   * (text plus the matching underline color), shared with the desktop menu.
   * Optional so the menu can be rendered with bare items; the link stays white
   * when omitted.
   */
  color?: string;
}

export interface MobileMenuProps {
  /** Items to render in the navigation list. */
  menuItems: MenuItem[];
  /** Invoked when a link or the auth toolbar navigates (e.g. to close the sheet). */
  onNavigate: () => void;
}

/**
 * The mobile navigation: social links, auth actions, and the colorized,
 * staggered menu links. Active-route detection mirrors the desktop menu via
 * `isActiveHref`. Rendered inside the hamburger sheet.
 */
export const MobileMenu = ({ menuItems, onNavigate }: MobileMenuProps) => {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col" aria-label="Main navigation">
      <SocialMediaIconLinks className="justify-center pt-2" />
      <AuthToolbar className="font-fake-four-cutout pb-0 text-zinc-50" onNavigate={onNavigate} />
      <ul>
        {menuItems.map((item, index) => (
          <li
            key={item.name}
            className="menu-item-stagger font-fake-four-cutout"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <Link
              href={item.href}
              aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
              className={cn(
                'mt-4 block text-xl tracking-wider text-zinc-50 underline-offset-8 text-shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white aria-[current=page]:underline',
                item.color
              )}
              onClick={onNavigate}
              // Default prefetch grabs static targets when the sheet opens;
              // the boost upgrades force-dynamic ones (home) to a full data
              // prefetch on touchstart, a beat before the click lands.
              unstable_dynamicOnHover
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
