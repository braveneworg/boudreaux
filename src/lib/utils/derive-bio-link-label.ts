/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Human-ish label for a URL-only reference link: the hostname minus a leading
 * `www.` (e.g. `https://www.pitchfork.com/x` → `pitchfork.com`). Falls back to
 * the raw input when the URL cannot be parsed (defensive — callers pass a value
 * that already passed `isHttpUrl`). Used to give a persisted reference link a
 * non-empty label without asking the admin for one.
 */
export const deriveBioLinkLabel = (url: string): string => {
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
};
