/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { cache } from 'react';

import { QueryClient } from '@tanstack/react-query';

const disableCache = process.env.NEXT_PUBLIC_DISABLE_QUERY_CACHE === 'true';

/**
 * Returns a per-request QueryClient singleton for Server Component prefetching.
 * Uses React.cache() so every component in the same render pass shares one client.
 * Default options match the client-side QueryClient in providers.tsx.
 */
export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: disableCache ? 0 : 60 * 1000,
          gcTime: disableCache ? 0 : 5 * 60 * 1000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    })
);
