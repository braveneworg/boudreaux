/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { ReactElement } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useInfinitePublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { ReleaseListRow } from './release-list-row';
import { ReleaseSearchCombobox } from './release-search-combobox';

/**
 * Initial-load skeleton mirroring the real layout — the search combobox and a
 * few sleeve-left/info-right placeholder rows — so nothing jumps when the
 * first page lands.
 */
const ReleasesSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-8 py-4" aria-busy="true">
    <p role="status" className="sr-only">
      Loading releases…
    </p>
    <Skeleton className="h-10 w-full" />
    {[0, 1, 2].map((key) => (
      <div
        key={key}
        className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"
      >
        <Skeleton className="aspect-square w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

/** Error state with a retry that refetches the listing in place. */
const ReleasesError = ({ onRetry }: { onRetry: () => void }): ReactElement => (
  <div className="flex flex-col items-center gap-4 py-12 text-center">
    <p className="text-zinc-950">Unable to load releases. Please try again later.</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/**
 * Client content island for the public `/releases` listing.
 *
 * Pages through published releases with infinite scroll (the first page is
 * hydrated from the SSR prefetch), rendering each as a sleeve-left/info-right
 * {@link ReleaseListRow} between dashed dividers — the same paste-up rhythm as
 * the `/videos` listing. The search combobox is self-contained and queries the
 * server directly, so it is not coupled to the loaded pages.
 */
export const ReleasesContent = (): ReactElement => {
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePublishedReleasesQuery();

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  if (isPending) {
    return <ReleasesSkeleton />;
  }

  if (error && !data) {
    return <ReleasesError onRetry={refetch} />;
  }

  const releases = data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <div className="flex flex-col gap-6 py-4">
      <ReleaseSearchCombobox />

      {releases.length === 0 ? (
        <p className="py-12 text-center text-lg text-zinc-500">No releases available.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-dashed divide-zinc-300">
          {releases.map((release) => (
            <li key={release.id} className="py-6 first:pt-2 last:pb-2">
              <ReleaseListRow release={release} />
            </li>
          ))}
        </ul>
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-2"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-zinc-950" aria-hidden="true" />
            <span role="status" className="sr-only">
              Loading more releases…
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
};
