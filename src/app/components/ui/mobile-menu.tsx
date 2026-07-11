/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as AccordionPrimitive from '@radix-ui/react-accordion';

import { AuthToolbar } from '@/components/auth/auth-toolbar';
import type { NavMenuEntry } from '@/hooks/use-nav-menu-groups';
import type { NavMenuItem } from '@/hooks/use-nav-menu-items';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';

import { MobileMenuGroup } from './mobile-menu-group';
import { SocialMediaIconLinks } from './social-media-icon-links';

export interface MobileMenuProps {
  /** Projected nav entries (top-level links and accordion groups) to render. */
  entries: NavMenuEntry[];
  /** Invoked when a link or the auth toolbar navigates (e.g. to close the sheet). */
  onNavigate: () => void;
}

/**
 * The category (if any) whose child route is currently active — the sheet
 * auto-opens it so the trail is visible without a tap. Module-scope helper so
 * the component render stays simple.
 */
const findActiveGroupLabel = (entries: NavMenuEntry[], pathname: string): string | undefined => {
  const activeGroup = entries.find(
    (entry): entry is Extract<NavMenuEntry, { kind: 'group' }> =>
      entry.kind === 'group' && entry.group.items.some((item) => isActiveHref(item.href, pathname))
  );
  return activeGroup?.group.label;
};

interface MobileMenuLinkProps {
  item: NavMenuItem;
  /** Slot in the sheet's staggered reveal (delay = index * 0.1s). */
  index: number;
  pathname: string;
  onNavigate: () => void;
}

const MobileMenuLink = ({
  item,
  index,
  pathname,
  onNavigate,
}: MobileMenuLinkProps): React.ReactElement => (
  <li
    className="menu-item-stagger font-fake-four-cutout"
    // index / 10 (not index * 0.1) keeps the delay an exact decimal — 3 * 0.1
    // floats to 0.30000000000000004.
    style={{ animationDelay: `${index / 10}s` }}
  >
    <Link
      href={item.href}
      aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
      className={cn(
        'mt-4 block text-xl tracking-wider text-zinc-50 no-underline underline-offset-8 text-shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white aria-[current=page]:underline',
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
);

/**
 * The mobile navigation: social links, auth actions, and the same grouped
 * projection the desktop menu renders — top-level links plus Music/Label
 * accordion categories (one open at a time; the active route's category
 * starts open). Active-route detection mirrors the desktop menu via
 * `isActiveHref`. Rendered inside the hamburger sheet, which remounts it on
 * every open, so the initial expansion recomputes per open.
 */
export const MobileMenu = ({ entries, onNavigate }: MobileMenuProps): React.ReactElement => {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col" aria-label="Main navigation">
      <SocialMediaIconLinks className="justify-center pt-2" />
      <AuthToolbar className="font-fake-four-cutout pb-0 text-zinc-50" onNavigate={onNavigate} />
      <AccordionPrimitive.Root
        asChild
        type="single"
        collapsible
        defaultValue={findActiveGroupLabel(entries, pathname)}
      >
        <ul>
          {entries.map((entry, index) =>
            entry.kind === 'link' ? (
              <MobileMenuLink
                key={entry.item.name}
                item={entry.item}
                index={index}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ) : (
              <MobileMenuGroup
                key={entry.group.label}
                group={entry.group}
                index={index}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            )
          )}
        </ul>
      </AccordionPrimitive.Root>
    </nav>
  );
};
