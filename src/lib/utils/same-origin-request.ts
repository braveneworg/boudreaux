/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

/** The read surface needed of a headers source: a request's, or `headers()`. */
interface HeaderReader {
  get(name: string): string | null;
}

const originHostOf = (origin: string): string | null => {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

/**
 * Whether a browser sent this request from a page of this site, and not
 * because another site made it. For a route that takes no token and whose
 * every call has an effect, this is what stops a stranger's page from making
 * each of its visitors call it.
 *
 * A browser states it in `Sec-Fetch-Site`, which a page cannot set or
 * change; that answer is final when present. An older browser sends only
 * `Origin`, which is compared with the host the request was sent to. A
 * request that says neither is not from a page of this site.
 *
 * It is no defence against a caller that is not a browser: a script can send
 * any header. Those are bounded by rate limits, not by this.
 */
export const isSameOriginRequest = (headers: HeaderReader): boolean => {
  const site = headers.get('sec-fetch-site');
  if (site !== null) {
    return site === 'same-origin';
  }

  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host') ?? headers.get('host');

  return origin !== null && host !== null && originHostOf(origin) === host;
};
