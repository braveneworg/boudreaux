/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether `value` is a well-formed absolute http(s) URL. Uses the URL parser
 * (not a prefix regex) so it rejects schemes like `javascript:`/`data:` and
 * requires a host — `https://` alone is not valid. Safe to use on both the
 * client and server.
 *
 * @param value - The candidate URL string.
 * @returns `true` only for parseable `http:`/`https:` URLs with a host.
 */
export const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol, host } = new URL(value.trim());
    return host.length > 0 && (protocol === 'http:' || protocol === 'https:');
  } catch {
    return false;
  }
};
