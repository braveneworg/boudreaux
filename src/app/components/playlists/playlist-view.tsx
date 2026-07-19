/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';

import { Pencil, Play } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PlaylistDetailResponse, PlaylistItemPayload } from '@/lib/types/domain/playlist';
import { formatDuration } from '@/lib/utils/format-duration';

import { usePlaylistQuery } from './_hooks/use-playlist-query';
import { PlaylistCoverTiles } from './playlist-cover-tiles';

interface PlaylistViewProps {
  /** The playlist to display. */
  playlistId: string;
  /** Fired when the Creator toggle segment is chosen. */
  onBackToCreator: () => void;
  /** Fired with the playlist id from the Edit button. */
  onEdit: (id: string) => void;
  /** Fired with the playlist id from the Play button. */
  onPlay: (id: string) => void;
}

const SKELETON_KEYS = ['view-skeleton-1', 'view-skeleton-2', 'view-skeleton-3'] as const;

/** Three placeholder lines while the playlist detail loads. */
const PlaylistViewSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-3 py-2">
    {SKELETON_KEYS.map((key) => (
      <Skeleton key={key} data-testid="playlist-view-skeleton" className="my-0 h-6 w-full" />
    ))}
  </div>
);

/** `"{itemCount} item(s)" · {Public|Private}` meta line under the title. */
const metaLine = ({ itemCount, isPublic }: PlaylistDetailResponse): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${isPublic ? 'Public' : 'Private'}`;

/** 40px square cover thumb with a muted fallback block when the item has no art. */
const ViewItemThumb = ({ coverArt }: { coverArt: string | null }): ReactElement =>
  coverArt ? (
    <Image
      src={coverArt}
      alt=""
      width={40}
      height={40}
      sizes="40px"
      className="size-10 shrink-0 object-cover"
    />
  ) : (
    <div aria-hidden="true" className="size-10 shrink-0 bg-zinc-200" />
  );

/** One read-only item row: thumb, title (+video badge), artist, duration. */
const PlaylistViewItem = ({
  itemType,
  title,
  artistName,
  duration,
  coverArt,
}: PlaylistItemPayload): ReactElement => (
  <li className="flex items-center gap-3 border-b py-2">
    <ViewItemThumb coverArt={coverArt} />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {itemType === 'video' && <Badge variant="secondary">video</Badge>}
      </span>
      {artistName && <span className="truncate text-xs text-zinc-500">{artistName}</span>}
    </div>
    <span className="shrink-0 text-xs text-zinc-500">{formatDuration(duration)}</span>
  </li>
);

interface PlaylistViewBodyProps {
  playlistId: string;
  isPending: boolean;
  detail: PlaylistDetailResponse | undefined;
  onEdit: (id: string) => void;
  onPlay: (id: string) => void;
}

/** Detail body under the toggle: skeleton → error line → full playlist. */
const PlaylistViewBody = ({
  playlistId,
  isPending,
  detail,
  onEdit,
  onPlay,
}: PlaylistViewBodyProps): ReactElement => {
  if (isPending) return <PlaylistViewSkeleton />;

  if (!detail) {
    return <p className="text-sm text-zinc-500">Couldn't load playlist.</p>;
  }

  const sortedItems = [...detail.items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PlaylistCoverTiles images={detail.coverImages} alt={detail.title} size="lg" />
      <div className="flex flex-col gap-1">
        <h2 className="truncate text-lg font-semibold">{detail.title}</h2>
        <p className="text-xs text-zinc-500">{metaLine(detail)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" aria-label="Play playlist" onClick={() => onPlay(playlistId)}>
          <Play aria-hidden="true" />
          Play
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Edit playlist"
          onClick={() => onEdit(playlistId)}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </div>
      <ul>
        {sortedItems.map((item) => (
          <PlaylistViewItem key={item.id} {...item} />
        ))}
      </ul>
    </>
  );
};

/**
 * Read-only mobile playlist view: a Creator/&lt;title&gt; toggle on top (the
 * playlist segment stays selected; choosing Creator fires `onBackToCreator`),
 * then the large cover mosaic, title + meta, Play/Edit actions, and the item
 * list ordered by `sortOrder`. Loading shows skeleton lines; a failed detail
 * query degrades to a muted error line.
 */
export const PlaylistView = ({
  playlistId,
  onBackToCreator,
  onEdit,
  onPlay,
}: PlaylistViewProps): ReactElement => {
  const { isPending, data } = usePlaylistQuery(playlistId);

  const handleToggle = (value: string): void => {
    if (value === 'creator') onBackToCreator();
  };

  return (
    <section aria-label="Playlist" className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        value="playlist"
        onValueChange={handleToggle}
        variant="outline"
        className="w-full"
        aria-label="Switch between creator and playlist"
      >
        <ToggleGroupItem value="creator">Creator</ToggleGroupItem>
        <ToggleGroupItem value="playlist" className="min-w-0">
          <span className="truncate">{data?.title ?? 'Playlist'}</span>
        </ToggleGroupItem>
      </ToggleGroup>
      <PlaylistViewBody
        playlistId={playlistId}
        isPending={isPending}
        detail={data}
        onEdit={onEdit}
        onPlay={onPlay}
      />
    </section>
  );
};
