/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { useInfinitePublishedVideosQuery } from '@/hooks/use-infinite-published-videos-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { VideoCard } from './video-card';

/** Release-date sort directions offered by the listing toggle. */
type VideoSort = 'asc' | 'desc';

/** Initial-load skeleton — a few placeholder cards while the first page fetches. */
const VideosSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-8 py-4" aria-busy="true">
    <p role="status" className="sr-only">
      Loading videos…
    </p>
    {[0, 1, 2].map((key) => (
      <Skeleton key={key} className="aspect-video w-full" />
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
 * hydrated from the SSR prefetch). A two-option toggle flips the release-date
 * sort, which is part of the query key so changing it resets pagination.
 */
export const VideosContent = (): ReactElement => {
  const [sort, setSort] = useState<VideoSort>('desc');
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePublishedVideosQuery(sort);

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
      <ToggleGroup
        type="single"
        value={sort}
        onValueChange={handleSortChange}
        variant="outline"
        aria-label="Sort videos by release date"
      >
        <ToggleGroupItem value="desc">Newest first</ToggleGroupItem>
        <ToggleGroupItem value="asc">Oldest first</ToggleGroupItem>
      </ToggleGroup>

      {videos.length === 0 ? (
        <p className="py-12 text-center text-lg text-zinc-500">
          No videos yet &mdash; check back soon.
        </p>
      ) : (
        <ul className="flex flex-col gap-8">
          {videos.map((video) => (
            <li key={video.id}>
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
