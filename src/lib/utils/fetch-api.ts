/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

interface FetchApiOptions {
  forwardCookies?: boolean;
}

/**
 * Server-side fetch wrapper for internal API routes.
 * Uses getInternalApiUrl() for absolute URLs and optionally forwards
 * cookies from the incoming request for auth-gated endpoints.
 */
export async function fetchApi<T>(path: string, options?: FetchApiOptions): Promise<T> {
  const url = getInternalApiUrl(path);
  const fetchOptions: globalThis.RequestInit = { cache: 'no-store' };

  if (options?.forwardCookies) {
    const headersList = await headers();
    const cookie = headersList.get('cookie');
    if (cookie) {
      fetchOptions.headers = { cookie };
    }
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }

  return response.json() as Promise<T>;
}
