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
   * Tailwind utilities that color the link on the active (`aria-[current=page]:`)
   * and `hover:` states — both the text and the matching underline
   * (`decoration-*`) color. There is no base color, so the link stays white
   * until interacted with. Shared by the desktop and mobile menus.
   */
  color: string;
}

// Static nav items whose `hasBullet` value never changes with auth state.
// Defined at module scope so the hook body stays under the max-lines limit.
const STATIC_NAV_ITEMS_HEAD: NavMenuItem[] = [
  {
    name: 'Home',
    href: '/',
    hasBullet: true,
    color:
      'aria-[current=page]:text-menu-item-yellow-400 hover:text-menu-item-yellow-400 hover:decoration-menu-item-yellow-400',
  },
  {
    name: 'Artists',
    href: '/artists',
    hasBullet: true,
    color:
      'aria-[current=page]:text-menu-item-pink-300 aria-[current=page]:decoration-menu-item-pink-300 hover:text-menu-item-pink-300 hover:decoration-menu-item-pink-300',
  },
  {
    name: 'Releases',
    href: '/releases',
    hasBullet: true,
    color:
      'aria-[current=page]:text-menu-item-cyan-400 aria-[current=page]:decoration-menu-item-cyan-400 hover:text-menu-item-cyan-400 hover:decoration-menu-item-cyan-400',
  },
];

// Tours sits between the auth-sensitive Videos and Merch items.
const TOURS_ITEM: NavMenuItem = {
  name: 'Tours',
  href: '/tours',
  hasBullet: true,
  color:
    'aria-[current=page]:text-menu-item-tan-200 aria-[current=page]:decoration-menu-item-tan-200 hover:text-menu-item-tan-200 hover:decoration-menu-item-tan-200',
};

// Tail items that follow Merch and never change.
const STATIC_NAV_ITEMS_TAIL: NavMenuItem[] = [
  {
    name: 'Playlists',
    href: '/playlists',
    hasBullet: true,
    color:
      'aria-[current=page]:text-menu-item-teal-400 aria-[current=page]:decoration-menu-item-teal-400 hover:text-menu-item-teal-400 hover:decoration-menu-item-teal-400',
  },
  {
    name: 'About',
    href: '/about',
    hasBullet: true,
    color:
      'aria-[current=page]:text-menu-item-pink-400 aria-[current=page]:decoration-menu-item-pink-400 hover:text-menu-item-pink-400 hover:decoration-menu-item-pink-400',
  },
  {
    name: 'Contact Us',
    href: '/contact',
    hasBullet: false,
    color:
      'aria-[current=page]:text-menu-item-orange-300 aria-[current=page]:decoration-menu-item-orange-300 hover:text-menu-item-orange-300 hover:decoration-menu-item-orange-300',
  },
];

// Static data for the authenticated-only item. Insertion is conditional but
// the item's own fields are invariant.
const MY_COLLECTION_ITEM: NavMenuItem = {
  name: 'My Collection',
  href: '/collection',
  hasBullet: true,
  color:
    'aria-[current=page]:text-menu-item-green-400 aria-[current=page]:decoration-menu-item-green-400 hover:text-menu-item-green-400 hover:decoration-menu-item-green-400',
};

// Static color strings for the two items whose `hasBullet` flips with auth state.
const VIDEOS_COLOR =
  'aria-[current=page]:text-menu-item-tan-400 aria-[current=page]:decoration-menu-item-tan-400 hover:text-menu-item-tan-400 hover:decoration-menu-item-tan-400';
const MERCH_COLOR =
  'aria-[current=page]:text-menu-item-yellow-300 aria-[current=page]:decoration-menu-item-yellow-300 hover:text-menu-item-yellow-300 hover:decoration-menu-item-yellow-300';

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * menu and the mobile hamburger menu so the two can never drift apart.
 *
 * `My Collection` is inserted for authenticated users, and the bullets on
 * `Videos`/`Merch` flip with auth state so the desktop row separators stay
 * correct as the inserted item shifts where each row wraps.
 */
export const useNavMenuItems = (): NavMenuItem[] => {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  return useMemo(() => {
    const videos: NavMenuItem = {
      name: 'Videos',
      href: '/videos',
      hasBullet: !isAuthenticated,
      color: VIDEOS_COLOR,
    };
    const merch: NavMenuItem = {
      name: 'Merch',
      href: '/merch',
      hasBullet: isAuthenticated,
      color: MERCH_COLOR,
    };

    // Order: Home, Artists, Releases, [My Collection], Videos, Tours, Merch, Playlists, About, Contact Us
    const items: NavMenuItem[] = [
      ...STATIC_NAV_ITEMS_HEAD,
      videos,
      TOURS_ITEM,
      merch,
      ...STATIC_NAV_ITEMS_TAIL,
    ];

    if (isAuthenticated) {
      // Insert My Collection immediately after Releases (index 3).
      items.splice(3, 0, MY_COLLECTION_ITEM);
    }

    return items;
  }, [isAuthenticated]);
};
