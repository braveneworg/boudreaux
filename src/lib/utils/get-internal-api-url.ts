/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

/**
 * Constructs an absolute URL for fetching internal API routes from Server Components.
 * Uses the incoming request's host header to build the URL, falling back to
 * NEXT_PUBLIC_BASE_URL or localhost:3000.
 */
export async function getInternalApiUrl(path: string): Promise<string> {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const proto = headersList.get('x-forwarded-proto') ?? 'http';
    if (host) {
      return `${proto}://${host}${path}`;
    }
  } catch {
    // headers() may throw outside of a request context
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  return `${baseUrl}${path}`;
}
