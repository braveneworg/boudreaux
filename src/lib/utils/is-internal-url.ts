/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getApiBaseUrl } from '@/lib/utils/api-base-url';

const stripWww = (hostname: string): string =>
  hostname.startsWith('www.') ? hostname.slice(4) : hostname;

/**
 * Returns true if a URL is internal to the current site.
 *
 * Rules:
 * - Site-relative paths starting with '/' but not '//' → internal
 * - Absolute http(s) URLs whose www-stripped hostname matches the app's
 *   own www-stripped hostname (from `getApiBaseUrl()`) → internal
 * - Malformed URLs or any other scheme → external (false)
 *
 * Works on server (sanitizer) and client (renderer, editor) —
 * `getApiBaseUrl()` handles both contexts.
 */
export const isInternalBioUrl = (url: string): boolean => {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const baseHostname = new URL(getApiBaseUrl()).hostname;
    return stripWww(parsed.hostname) === stripWww(baseHostname);
  } catch {
    return false;
  }
};
