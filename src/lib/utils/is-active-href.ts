/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether `href` represents the page the user is currently on. The root path
 * matches exactly; every other path also matches its sub-routes (e.g.
 * `/artists` stays active on `/artists/ceschi`).
 */
export const isActiveHref = (href: string, pathname: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
