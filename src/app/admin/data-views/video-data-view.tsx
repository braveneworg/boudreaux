/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';

import Link from 'next/link';

import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Switch } from '@/app/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import {
  useArchiveVideoMutation,
  useDeleteVideoMutation,
  usePublishVideoMutation,
  useRestoreVideoMutation,
  useUnpublishVideoMutation,
} from '@/app/hooks/mutations/use-video-mutations';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useInfiniteVideosQuery } from '@/app/hooks/use-infinite-videos-query';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import type { VideoRow } from '@/lib/validation/video-schema';

import { LoadMoreTrigger } from './components/load-more-trigger';
import { VideoAdminCard } from './components/video-admin-card';
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

import type { VideoCardHandlers } from './components/video-admin-card';
import type { DataViewPagination } from './data-view-types';

/** A video lifecycle mutation keyed by `videoId`, resolving to a success/error result. */
type VideoLifecycleFn = (vars: { videoId: string }) => Promise<AdminActionResult>;

interface VideoListBodyProps {
  isPending: boolean;
  hasError: boolean;
  videos: VideoRow[];
  pagination: DataViewPagination;
  handlers: VideoCardHandlers;
  onRetry: () => void;
}

/** Loading, error, empty, and list states for the video collection. */
const VideoListBody = ({
  isPending,
  hasError,
  videos,
  pagination,
  handlers,
  onRetry,
}: VideoListBodyProps): ReactElement => {
  if (hasError) {
    return (
      <div role="alert" className="space-y-3 py-8 text-center">
        <p>We couldn&apos;t load the videos.</p>
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <p role="status" className="sr-only">
          Loading videos…
        </p>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-muted-foreground">No videos yet.</p>
        <Button asChild>
          <Link href="/admin/videos/new">New Video</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {videos.map((video) => (
          <li key={video.id}>
            <VideoAdminCard video={video} {...handlers} />
          </li>
        ))}
      </ul>
      <LoadMoreTrigger {...pagination} />
    </>
  );
};

/**
 * Bespoke admin data view for videos: search + publish/archive/sort filters, an
 * infinite-scroll list of inline players, and the lifecycle mutations wired to
 * toasts and a refetch. Composes the shared building blocks rather than the
 * generic `DataView`, which has no place for inline video playback.
 */
export const VideoDataView = (): ReactElement => {
  const { search, showPublished, showUnpublished, showArchived, sort } = useDataViewFilters(
    (state) => state.videos
  );
  const setFilters = useDataViewFilters((state) => state.setFilters);
  const hydrated = useDataViewFiltersHydration();
  // flushKey: a rehydrated search reaches the query without the debounce lag.
  const debouncedSearch = useDebounce(search, 300, { flushKey: hydrated });

  // Both same → no publish filter; otherwise the enabled one.
  const published = showPublished === showUnpublished ? null : showPublished;

  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteVideosQuery(
      { search: debouncedSearch, published, archived: showArchived, sort },
      { enabled: hydrated }
    );

  const videos = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  const { publishVideoAsync } = usePublishVideoMutation();
  const { unpublishVideoAsync } = useUnpublishVideoMutation();
  const { archiveVideoAsync } = useArchiveVideoMutation();
  const { restoreVideoAsync } = useRestoreVideoMutation();
  const { deleteVideoAsync } = useDeleteVideoMutation();

  const runLifecycle = useCallback(
    async (mutate: VideoLifecycleFn, id: string, successMessage: string): Promise<void> => {
      try {
        const result = await mutate({ videoId: id });
        if (result.success) {
          toast.success(successMessage);
          await refetch();
        } else {
          toast.error(result.error ?? 'Something went wrong.');
        }
      } catch {
        toast.error('Something went wrong.');
      }
    },
    [refetch]
  );

  const handlers = useMemo<VideoCardHandlers>(
    () => ({
      onPublish: (id) => runLifecycle(publishVideoAsync, id, 'Video published.'),
      onUnpublish: (id) => runLifecycle(unpublishVideoAsync, id, 'Video unpublished.'),
      onArchive: (id) => runLifecycle(archiveVideoAsync, id, 'Video archived.'),
      onRestore: (id) => runLifecycle(restoreVideoAsync, id, 'Video restored.'),
      onDelete: (id) => runLifecycle(deleteVideoAsync, id, 'Video deleted.'),
    }),
    [
      runLifecycle,
      publishVideoAsync,
      unpublishVideoAsync,
      archiveVideoAsync,
      restoreVideoAsync,
      deleteVideoAsync,
    ]
  );

  const handleSortChange = (value: string): void => {
    if (value === 'asc' || value === 'desc') setFilters('videos', { sort: value });
  };

  return (
    <div className="mx-1 space-y-4">
      <Button asChild className="w-full">
        <Link href="/admin/videos/new">New Video</Link>
      </Button>

      <Input
        type="search"
        value={search}
        onChange={(event) => setFilters('videos', { search: event.target.value })}
        placeholder="Search videos..."
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="show-published"
            checked={showPublished}
            onCheckedChange={(value) => setFilters('videos', { showPublished: value })}
          />
          <Label htmlFor="show-published" className="cursor-pointer">
            Show published
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-unpublished"
            checked={showUnpublished}
            onCheckedChange={(value) => setFilters('videos', { showUnpublished: value })}
          />
          <Label htmlFor="show-unpublished" className="cursor-pointer">
            Show unpublished
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={(value) => setFilters('videos', { showArchived: value })}
          />
          <Label htmlFor="show-archived" className="cursor-pointer">
            Show archived
          </Label>
        </div>
      </div>

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

      <VideoListBody
        isPending={isPending}
        hasError={error !== null}
        videos={videos}
        pagination={{ hasNextPage, fetchNextPage, isFetchingNextPage }}
        handlers={handlers}
        onRetry={refetch}
      />
    </div>
  );
};
