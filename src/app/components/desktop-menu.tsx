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
      { name: 'Home', href: '/', hasBullet: true },
      { name: 'Artists', href: '/artists', hasBullet: true },
      { name: 'Releases', href: '/releases', hasBullet: true },
      { name: 'Videos', href: '/videos', hasBullet: !isAuthenticated },
      { name: 'Tours', href: '/tours', hasBullet: true },
      { name: 'Merch', href: '/merch', hasBullet: true },
      { name: 'Playlists', href: '/playlists', hasBullet: true },
      { name: 'About', href: '/about', hasBullet: true },
      { name: 'Contact Us', href: '/contact', hasBullet: false },
    ];

    if (isAuthenticated) {
      items.splice(3, 0, { name: 'My Collection', href: '/collection', hasBullet: true });
    }

    return items;
  }, [isAuthenticated]);

  return (
    <nav>
      <ul className="font-fake-four-cutout absolute top-32 left-1/2 flex w-220 -translate-x-1/2 transform flex-wrap justify-center gap-x-6 gap-y-4 text-2xl">
        {menuItems.map((item) => (
          <Fragment key={item.name}>
            <li className="flex">
              <Link
                href={item.href}
                aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
                className="text-zinc-50 underline-offset-8 visited:text-zinc-50 hover:underline aria-[current=page]:underline"
                prefetch={false}
              >
                {item.name}
              </Link>
            </li>
            {item.hasBullet && (
              <li className="self-center" role="presentation" aria-hidden="true">
                <span className="block size-2 rotate-45 bg-white" />
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </nav>
  );
};
