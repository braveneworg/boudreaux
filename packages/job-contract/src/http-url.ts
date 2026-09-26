/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

/**
 * Whether `value` is a well-formed absolute http(s) URL. Uses the URL parser
 * (not a prefix regex) so it rejects schemes like `javascript:`/`data:` and
 * requires a host. The shared contract carries the STRICTER of the web/Lambda
 * validators (never the looser) so the boundary check can't silently weaken.
 */
const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol, host } = new URL(value.trim());
    return host.length > 0 && (protocol === 'http:' || protocol === 'https:');
  } catch {
    return false;
  }
};

/** The one http(s)-URL schema every contract in this package validates URLs with. */
export const httpUrl = z.string().refine(isHttpUrl, 'Must be an http(s) URL');
