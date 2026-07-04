/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useState } from 'react';

import { useSession } from '@/hooks/use-session';

export interface NavMenuItem {
  name: string;
  href: string;
  /**
   * Tailwind utilities that color the link on the active (`aria-[current=page]:`)
   * and `hover:` states — both the text and the matching underline
   * (`decoration-*`) color. There is no base color, so the link stays white
   * until interacted with. Shared by the desktop and mobile menus.
   */
  color: string;
}

// The static signed-out list, in render order:
// Home, Artists, Releases, Videos, Tours, Merch, Playlists, About, Contact Us.
// Defined at module scope so the hook body stays under the max-lines limit.
const BASE_NAV_ITEMS: NavMenuItem[] = [
  {
    name: 'Home',
    href: '/',
    color:
      'aria-[current=page]:text-menu-item-yellow-400 hover:text-menu-item-yellow-400 hover:decoration-menu-item-yellow-400',
  },
  {
    name: 'Artists',
    href: '/artists',
    color:
      'aria-[current=page]:text-menu-item-pink-300 aria-[current=page]:decoration-menu-item-pink-300 hover:text-menu-item-pink-300 hover:decoration-menu-item-pink-300',
  },
  {
    name: 'Releases',
    href: '/releases',
    color:
      'aria-[current=page]:text-menu-item-cyan-400 aria-[current=page]:decoration-menu-item-cyan-400 hover:text-menu-item-cyan-400 hover:decoration-menu-item-cyan-400',
  },
  {
    name: 'Videos',
    href: '/videos',
    color:
      'aria-[current=page]:text-menu-item-tan-400 aria-[current=page]:decoration-menu-item-tan-400 hover:text-menu-item-tan-400 hover:decoration-menu-item-tan-400',
  },
  {
    name: 'Tours',
    href: '/tours',
    color:
      'aria-[current=page]:text-menu-item-tan-200 aria-[current=page]:decoration-menu-item-tan-200 hover:text-menu-item-tan-200 hover:decoration-menu-item-tan-200',
  },
  {
    name: 'Merch',
    href: '/merch',
    color:
      'aria-[current=page]:text-menu-item-yellow-300 aria-[current=page]:decoration-menu-item-yellow-300 hover:text-menu-item-yellow-300 hover:decoration-menu-item-yellow-300',
  },
  {
    name: 'Playlists',
    href: '/playlists',
    color:
      'aria-[current=page]:text-menu-item-teal-400 aria-[current=page]:decoration-menu-item-teal-400 hover:text-menu-item-teal-400 hover:decoration-menu-item-teal-400',
  },
  {
    name: 'About',
    href: '/about',
    color:
      'aria-[current=page]:text-menu-item-pink-400 aria-[current=page]:decoration-menu-item-pink-400 hover:text-menu-item-pink-400 hover:decoration-menu-item-pink-400',
  },
  {
    name: 'Contact Us',
    href: '/contact',
    color:
      'aria-[current=page]:text-menu-item-orange-300 aria-[current=page]:decoration-menu-item-orange-300 hover:text-menu-item-orange-300 hover:decoration-menu-item-orange-300',
  },
];

// Static data for the authenticated-only item. Insertion is conditional but
// the item's own fields are invariant.
const MY_COLLECTION_ITEM: NavMenuItem = {
  name: 'My Collection',
  href: '/collection',
  color:
    'aria-[current=page]:text-menu-item-green-400 aria-[current=page]:decoration-menu-item-green-400 hover:text-menu-item-green-400 hover:decoration-menu-item-green-400',
};

/**
 * Single source of truth for the primary navigation, shared by the desktop
 * menu (via its `useNavMenuGroups` projection) and the mobile hamburger menu
 * so the two can never drift apart. Every item is static except
 * `My Collection`, which is inserted for authenticated users.
 */
export const useNavMenuItems = (): NavMenuItem[] => {
  const { status } = useSession();

  // Defer the auth-dependent menu shape until after the client has mounted.
  // `useSession` resolves from better-auth's async session fetch, which can land
  // before React hydrates the header; treating the user as authenticated then
  // would insert "My Collection" and diverge from the server's pending render,
  // tripping a hydration mismatch. Holding `isAuthenticated` false until mount
  // keeps the first client render identical to the server.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  const isAuthenticated = hasMounted && status === 'authenticated';

  return useMemo(() => {
    if (!isAuthenticated) return BASE_NAV_ITEMS;

    // Insert My Collection immediately after Releases (index 3).
    const items = [...BASE_NAV_ITEMS];
    items.splice(3, 0, MY_COLLECTION_ITEM);
    return items;
  }, [isAuthenticated]);
};
