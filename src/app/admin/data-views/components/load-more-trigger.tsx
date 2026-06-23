/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { ReactElement } from 'react';

import { Button } from '@/app/components/ui/button';
import { Spinner } from '@/app/components/ui/spinner/spinner';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import type { DataViewPagination } from '../data-view-types';

/**
 * Infinite-scroll footer: auto-loads the next page when scrolled into view, with a
 * manual "Load More" fallback and an "All items loaded" terminal state.
 */
export const LoadMoreTrigger = ({
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage = false,
}: DataViewPagination): ReactElement => {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useInfiniteScroll(loadMoreRef, {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage: fetchNextPage ?? (() => {}),
    enabled: !!fetchNextPage,
  });

  return (
    <div
      ref={loadMoreRef}
      className="flex min-h-15 flex-col items-center justify-center gap-2 py-6"
    >
      {isFetchingNextPage ? (
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="text-sm text-zinc-950">Loading more...</span>
        </div>
      ) : hasNextPage ? (
        <Button variant="outline" size="sm" onClick={() => fetchNextPage?.()}>
          Load More
        </Button>
      ) : (
        <span className="text-sm text-zinc-950">All items loaded</span>
      )}
    </div>
  );
};
