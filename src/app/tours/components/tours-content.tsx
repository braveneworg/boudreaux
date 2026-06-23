/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { Loader2 } from 'lucide-react';

import { useInfiniteToursQuery } from '@/app/hooks/use-infinite-tours-query';

import { ToursPageClient } from './tours-page-client';

/**
 * Client content wrapper for the tours listing page.
 *
 * Owns the (server-side) search term and drives the infinite tours query
 * (hydrated from the SSR prefetch of the first, unsearched page), flattening
 * pages for the presentational {@link ToursPageClient}.
 */
export const ToursContent = () => {
  const [search, setSearch] = useState('');

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteToursQuery(search);

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950">Failed to load tours</h3>
          <p className="mt-2 text-sm text-zinc-950">Please try again later.</p>
        </div>
      </div>
    );
  }

  const tours = data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <ToursPageClient
      tours={tours}
      search={search}
      onSearchChange={setSearch}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
    />
  );
};
