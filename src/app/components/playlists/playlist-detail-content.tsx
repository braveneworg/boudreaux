/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import Link from 'next/link';

import { Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistQuery } from '@/hooks/use-playlist-query';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistDownloadRow } from './playlist-download-row';
import { PlaylistPlayer } from './playlist-player';
import { PlaylistSharePopover } from './playlist-share-popover';

interface PlaylistDetailContentProps {
  /** The playlist the page routes to (cache seeded server-side). */
  playlistId: string;
}

/** `"{itemCount} item(s)" · {Public|Private}` meta line under the heading. */
const metaLine = ({ itemCount, isPublic }: PlaylistDetailResponse): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${isPublic ? 'Public' : 'Private'}`;

/** Placeholder blocks while the (already-seeded) detail hydrates. */
const PlaylistDetailSkeleton = (): ReactElement => (
  <div aria-busy="true" className="flex flex-col gap-4 py-4">
    <p role="status" className="sr-only">
      Loading playlist…
    </p>
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-64 w-full" />
  </div>
);

/**
 * Client island for `/playlists/[id]`: meta line + share popover (+ the
 * owner's "Open in My Playlists" deep link), the download row ABOVE the
 * inline player (spec order), items sorted by `sortOrder`. The page seeds the
 * detail cache, so the skeleton only shows on client-side cache misses.
 */
export const PlaylistDetailContent = ({ playlistId }: PlaylistDetailContentProps): ReactElement => {
  const { isPending, data } = usePlaylistQuery(playlistId);

  if (isPending) return <PlaylistDetailSkeleton />;

  if (!data) {
    return <p className="text-sm text-zinc-500">Couldn&apos;t load playlist.</p>;
  }

  const sortedItems = [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const hasDownloadableTracks = sortedItems.some((item) => item.itemType === 'track');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-zinc-500">{metaLine(data)}</p>
        <span aria-hidden="true" className="flex-1" />
        <PlaylistSharePopover
          playlistId={data.id}
          playlistTitle={data.title}
          isPublic={data.isPublic}
        >
          <Button type="button" variant="outline" aria-label="Share playlist">
            <Share2 aria-hidden="true" />
            Share
          </Button>
        </PlaylistSharePopover>
        {data.isOwner && (
          <Button asChild variant="outline">
            <Link href={`/playlists?edit=${data.id}`}>Open in My Playlists</Link>
          </Button>
        )}
      </div>
      <PlaylistDownloadRow playlistId={data.id} disabled={!hasDownloadableTracks} />
      <PlaylistPlayer items={sortedItems} title={data.title} />
    </div>
  );
};
