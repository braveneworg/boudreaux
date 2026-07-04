/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';
import { Fragment } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useNavMenuGroups } from '@/hooks/use-nav-menu-groups';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/ui/navigation-menu';

import { DesktopMenuDrawer } from './desktop-menu-drawer';

/** Diamond separator between top-level entries (decorative, as before). */
const Bullet = () => (
  <li className="flex self-center" role="presentation" aria-hidden="true">
    <span className="block size-2 rotate-45 bg-zinc-50" />
  </li>
);

/**
 * Desktop primary nav (deck two of the masthead): Home · Music ▾ · Label ▾ ·
 * [My Collection] · Contact Us at full cutout scale. Symmetric `px-38` (152px)
 * insets keep true centering while making logo/"Home" overlap geometrically
 * impossible at every xl viewport — the row wraps instead of colliding.
 */
export const DesktopMenu = (): React.ReactElement => {
  const pathname = usePathname();
  const entries = useNavMenuGroups();

  return (
    <NavigationMenu
      viewport={false}
      delayDuration={150}
      className="font-fake-four-cutout absolute inset-x-0 top-21 z-50 max-w-none justify-center px-38 text-2xl"
    >
      <NavigationMenuList className="flex-wrap justify-center gap-x-5 gap-y-4">
        {entries.map((entry, index) => (
          <Fragment key={entry.kind === 'link' ? entry.item.name : entry.group.label}>
            {entry.kind === 'link' ? (
              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={cn(
                    'bg-transparent p-0 text-2xl text-zinc-50 underline-offset-8 transition-colors duration-200',
                    'hover:bg-transparent hover:underline focus:bg-transparent focus:text-zinc-50',
                    'aria-[current=page]:underline',
                    entry.item.color
                  )}
                >
                  {/* Classes live on NavigationMenuLink so its cn() tailwind-merges
                      them over the shadcn defaults (Slot would only concatenate). */}
                  <Link
                    href={entry.item.href}
                    aria-current={isActiveHref(entry.item.href, pathname) ? 'page' : undefined}
                    // Static nav targets fully prefetch on viewport by default;
                    // the hover boost upgrades force-dynamic ones (home) to a
                    // full data prefetch the moment pointer intent shows.
                    unstable_dynamicOnHover
                  >
                    {entry.item.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : (
              <DesktopMenuDrawer group={entry.group} pathname={pathname} />
            )}
            {index < entries.length - 1 && <Bullet />}
          </Fragment>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
};
