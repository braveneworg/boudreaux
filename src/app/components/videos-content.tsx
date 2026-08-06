/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Loader2, Search } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { useInfinitePublishedVideosQuery } from '@/hooks/queries/use-infinite-published-videos-query';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { VideoCard } from './video-card';

/** Release-date sort directions offered by the listing toggle. */
type VideoSort = 'asc' | 'desc';

/**
 * Initial-load skeleton mirroring the real layout — the search/sort toolbar
 * and a few poster-left/details-right placeholder rows — so nothing jumps
 * when the first page lands.
 */
const VideosSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-8 py-4" aria-busy="true">
    <p role="status" className="sr-only">
      Loading videos…
    </p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-9 w-full sm:max-w-xs" />
      <Skeleton className="h-9 w-56" />
    </div>
    {[0, 1, 2].map((key) => (
      <div
        key={key}
        className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"
      >
        <Skeleton className="aspect-video w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    ))}
  </div>
);

/** Error state with a retry that refetches the listing in place. */
const VideosError = ({ onRetry }: { onRetry: () => void }): ReactElement => (
  <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
    <p className="text-zinc-950">Unable to load videos. Please try again later.</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/**
 * Client content island for the signed-in `/videos` listing.
 *
 * Pages through published videos with infinite scroll (the first page is
 * hydrated from the SSR prefetch). A toolbar pairs a debounced title/artist
 * search with the release-date sort toggle; both are part of the query key,
 * so changing either resets pagination while `keepPreviousData` keeps the
 * current rows on screen during the transition.
 */
export const VideosContent = (): ReactElement => {
  const [sort, setSort] = useState<VideoSort>('desc');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300).trim();
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePublishedVideosQuery(sort, search);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  const handleSortChange = (value: string): void => {
    if (value === 'asc' || value === 'desc') setSort(value);
  };

  if (isPending) {
    return <VideosSkeleton />;
  }

  if (error && !data) {
    return <VideosError onRetry={refetch} />;
  }

  const videos = data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by title or artist"
            aria-label="Search videos"
            className="pl-9"
          />
        </div>

        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={handleSortChange}
          variant="outline"
          aria-label="Sort videos by release date"
          className="shrink-0"
        >
          <ToggleGroupItem value="desc">Newest first</ToggleGroupItem>
          <ToggleGroupItem value="asc">Oldest first</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {videos.length === 0 ? (
        <p className="py-12 text-center text-lg text-zinc-500">
          {search ? `No videos match “${search}”.` : 'No videos yet — check back soon.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-dashed divide-zinc-300">
          {videos.map((video) => (
            <li key={video.id} className="py-6 first:pt-2 last:pb-2">
              <VideoCard video={video} />
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
              Loading more videos…
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
};
