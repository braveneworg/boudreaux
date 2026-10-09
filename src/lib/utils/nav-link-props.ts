/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isActiveHref } from './is-active-href';

/** The parts of a nav item that decide how its link behaves. */
export interface NavLinkTarget {
  href: string;
  isExternal?: boolean;
}

/** Link props for a nav item: new-tab for external sites, route state otherwise. */
export type NavLinkProps =
  | { target: '_blank'; rel: 'noopener noreferrer' }
  | { 'aria-current': 'page' | undefined; unstable_dynamicOnHover: true };

/**
 * Shared `next/link` props for every primary-nav link, so the desktop and
 * mobile menus treat an item the same way. An external item opens in a new
 * tab with `rel` hardening and is never the current page. An internal item
 * carries `aria-current` for its route and the hover prefetch boost, which
 * upgrades force-dynamic targets (home) to a full data prefetch on intent.
 */
export const getNavLinkProps = (item: NavLinkTarget, pathname: string): NavLinkProps =>
  item.isExternal
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {
        'aria-current': isActiveHref(item.href, pathname) ? 'page' : undefined,
        unstable_dynamicOnHover: true,
      };
