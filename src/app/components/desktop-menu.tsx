/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';
import { Fragment, useMemo } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useSession } from 'next-auth/react';

/**
 * Whether `href` represents the page the user is currently on. The root path
 * matches exactly; every other path also matches its sub-routes (e.g.
 * `/releases` stays active on `/releases/123`).
 */
const isActiveHref = (href: string, pathname: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

export const DesktopMenu = () => {
  const { status } = useSession();
  const pathname = usePathname();
  const isAuthenticated = status === 'authenticated';

  const menuItems = useMemo(() => {
    const items = [
      {
        name: 'Home',
        href: '/',
        hasBullet: true,
        color: 'text-menu-item-yellow-400 visited:text-menu-item-yellow-400',
      },
      {
        name: 'Artists',
        href: '/artists',
        hasBullet: true,
        color: 'text-menu-item-pink-300 visited:text-menu-item-pink-300',
      },
      {
        name: 'Releases',
        href: '/releases',
        hasBullet: true,
        color: 'text-menu-item-cyan-400 visited:text-menu-item-cyan-400',
      },
      {
        name: 'Videos',
        href: '/videos',
        hasBullet: !isAuthenticated,
        color: 'text-menu-item-tan-400 visited:text-menu-item-tan-400',
      },
      {
        name: 'Tours',
        href: '/tours',
        hasBullet: true,
        color: 'text-menu-item-tan-200 visited:text-menu-item-tan-200',
      },
      {
        name: 'Merch',
        href: '/merch',
        hasBullet: isAuthenticated,
        color: 'text-menu-item-yellow-300 visited:text-menu-item-yellow-300',
      },
      {
        name: 'Playlists',
        href: '/playlists',
        hasBullet: true,
        color: 'text-menu-item-teal-400 visited:text-menu-item-teal-400',
      },
      {
        name: 'About',
        href: '/about',
        hasBullet: true,
        color: 'text-menu-item-pink-400 visited:text-menu-item-pink-400',
      },
      {
        name: 'Contact Us',
        href: '/contact',
        hasBullet: false,
        color: 'text-menu-item-orange-300 visited:text-menu-item-orange-300',
      },
    ];

    if (isAuthenticated) {
      items.splice(3, 0, {
        name: 'My Collection',
        href: '/collection',
        hasBullet: true,
        color: 'text-menu-item-green-400 visited:text-menu-item-green-400',
      });
    }

    return items;
  }, [isAuthenticated]);

  return (
    <nav>
      <ul className="font-fake-four-cutout absolute top-32 left-1/2 z-50 flex w-220 -translate-x-1/2 transform flex-wrap justify-center gap-x-6 gap-y-4 text-2xl">
        {menuItems.map((item) => (
          <Fragment key={item.name}>
            <li className="flex">
              <Link
                href={item.href}
                aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
                className={`${item.color} underline-offset-8 hover:underline aria-[current=page]:underline`}
                prefetch={false}
              >
                {item.name}
              </Link>
            </li>
            {item.hasBullet && (
              <li className="self-center" role="presentation" aria-hidden="true">
                <span className="block size-2 rotate-45 bg-zinc-50" />
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </nav>
  );
};
