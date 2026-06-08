/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import { useSession } from 'next-auth/react';

export interface NavMenuItem {
  name: string;
  href: string;
  /**
   * Whether a decorative separator bullet follows this item. Desktop-only
   * presentation; the mobile sheet ignores it.
   */
  hasBullet: boolean;
  /**
   * Tailwind text-color utilities (including the `visited:` variant) used by
   * the desktop menu. The mobile sheet renders its own monochrome styling and
   * ignores this.
   */
  color: string;
}

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * menu and the mobile hamburger menu so the two can never drift apart.
 *
 * `My Collection` is inserted for authenticated users, and the bullets on
 * `Videos`/`Merch` flip with auth state so the desktop row separators stay
 * correct as the inserted item shifts where each row wraps.
 */
export function useNavMenuItems(): NavMenuItem[] {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  return useMemo(() => {
    const items: NavMenuItem[] = [
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
}
