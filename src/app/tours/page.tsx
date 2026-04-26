/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import type { ToursResponse } from '@/app/hooks/use-tours-query';
import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { ToursContent } from './components/tours-content';

/**
 * Public tours listing page with search functionality.
 * Server Component prefetches tour data for SSR, client component handles interactivity.
 */
export default async function ToursPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: queryKeys.tours.list(),
    queryFn: () => fetchApi<ToursResponse>('/api/tours'),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="container mx-auto py-8">
        <div className="mb-8 space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Tours</h1>
          <p className="text-lg text-zinc-950-foreground">
            Search and browse upcoming and recent tour dates
          </p>
        </div>

        <ToursContent />
      </div>
    </HydrationBoundary>
  );
}
