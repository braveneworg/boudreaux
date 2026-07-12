/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Human-ish label for a URL-only reference link: the hostname minus a leading
 * `www.` (e.g. `https://www.pitchfork.com/x` → `pitchfork.com`). Falls back to
 * the full hostname when stripping `www.` would leave nothing (e.g. a bare
 * `https://www.` host), and to the raw input when the URL cannot be parsed
 * (defensive — callers pass a value that already passed `isHttpUrl`). Always
 * returns a non-empty string so the persisted link satisfies the label schema
 * without asking the admin for one.
 */
export const deriveBioLinkLabel = (url: string): string => {
  try {
    const { hostname } = new URL(url);
    const stripped = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    return stripped || hostname || url;
  } catch {
    return url;
  }
};
