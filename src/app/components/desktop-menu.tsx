/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';
import { Fragment } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useNavMenuItems } from '@/hooks/use-nav-menu-items';
import { isActiveHref } from '@/lib/utils/is-active-href';

export const DesktopMenu = () => {
  const pathname = usePathname();
  const menuItems = useNavMenuItems();

  return (
    <nav>
      <ul className="font-fake-four-cutout absolute top-32 left-1/2 z-50 flex w-220 -translate-x-1/2 transform flex-wrap justify-center gap-x-6 gap-y-4 text-2xl">
        {menuItems.map((item) => (
          <Fragment key={item.name}>
            <li className="flex">
              <Link
                href={item.href}
                aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
                className={`text-zinc-50 ${item.color} underline-offset-8 hover:underline aria-[current=page]:underline`}
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
