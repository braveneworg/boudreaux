/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import { useNavMenuItems, type NavMenuItem } from '@/hooks/use-nav-menu-items';

export interface NavMenuGroup {
  /** Trigger label rendered in the nav row. */
  label: string;
  /** Drawer links, in spec order. */
  items: NavMenuItem[];
}

export type NavMenuEntry =
  | { kind: 'link'; item: NavMenuItem }
  | { kind: 'group'; group: NavMenuGroup };

// Drawer membership by href (spec order). Hrefs are stabler than display names.
const MUSIC_HREFS = ['/releases', '/artists', '/playlists', '/videos'] as const;
const LABEL_HREFS = ['/tours', '/merch', '/about'] as const;

const pickGroup = (
  label: string,
  hrefs: readonly string[],
  byHref: Map<string, NavMenuItem>
): NavMenuEntry[] => {
  const items = hrefs.flatMap((href) => {
    const found = byHref.get(href);
    return found ? [found] : [];
  });
  const [lead] = items;
  return lead ? [{ kind: 'group', group: { label, items } }] : [];
};

const pickLink = (href: string, byHref: Map<string, NavMenuItem>): NavMenuEntry[] => {
  const found = byHref.get(href);
  return found ? [{ kind: 'link', item: found }] : [];
};

/**
 * Grouped projection of the primary nav: Home · Music ▾ · Label ▾ ·
 * [My Collection] · Contact Us. Built on top of `useNavMenuItems` so the flat
 * list stays the single source of truth; the desktop menu renders the groups
 * as drawers and the mobile sheet as accordion categories. Conditional items
 * (My Collection) appear in both exactly when they appear in the flat list.
 */
export const useNavMenuGroups = (): NavMenuEntry[] => {
  const items = useNavMenuItems();

  return useMemo(() => {
    const byHref = new Map(items.map((navItem) => [navItem.href, navItem]));
    return [
      ...pickLink('/', byHref),
      ...pickGroup('Music', MUSIC_HREFS, byHref),
      ...pickGroup('Label', LABEL_HREFS, byHref),
      ...pickLink('/collection', byHref),
      ...pickLink('/contact', byHref),
    ];
  }, [items]);
};
