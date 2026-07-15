/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistQuery } from '@/hooks/use-playlist-query';
import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistDownloadRow } from './playlist-download-row';
import { PlaylistPlayer } from './playlist-player';

interface PlaylistPlayerDialogProps {
  /** The playlist to play, or `null` while no play request is active. */
  playlistId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const SKELETON_KEYS = ['player-skeleton-1', 'player-skeleton-2', 'player-skeleton-3'] as const;

/** Placeholder lines while the playlist detail loads. */
const PlaylistPlayerDialogSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-3 py-2">
    {SKELETON_KEYS.map((key) => (
      <Skeleton
        key={key}
        data-testid="playlist-player-dialog-skeleton"
        className="my-0 h-6 w-full"
      />
    ))}
  </div>
);

interface PlaylistPlayerDialogBodyProps {
  isPending: boolean;
  detail: PlaylistDetailResponse | undefined;
}

/** Dialog body: skeleton → error line → download row stacked above the player. */
const PlaylistPlayerDialogBody = ({
  isPending,
  detail,
}: PlaylistPlayerDialogBodyProps): ReactElement => {
  if (isPending) return <PlaylistPlayerDialogSkeleton />;

  if (!detail) {
    return <p className="text-sm text-zinc-500">Couldn&apos;t load playlist.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <PlaylistDownloadRow playlistId={detail.id} />
      <PlaylistPlayer items={detail.items} title={detail.title} />
    </div>
  );
};

/**
 * Shared playlist player dialog: fetches the detail only while open, shows
 * the free-download row above the player (queue included in the player), and
 * fully unmounts the media subtree on close so video.js always tears down.
 * No purchase options — playlists reference free-streamable media only.
 */
export const PlaylistPlayerDialog = ({
  playlistId,
  open,
  onOpenChange,
}: PlaylistPlayerDialogProps): ReactElement => {
  const { isPending, data } = usePlaylistQuery(playlistId, {
    enabled: open && playlistId !== null,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{data?.title ?? 'Playlist'}</DialogTitle>
          <DialogDescription className="sr-only">Play or download this playlist</DialogDescription>
        </DialogHeader>
        {open ? <PlaylistPlayerDialogBody isPending={isPending} detail={data} /> : null}
      </DialogContent>
    </Dialog>
  );
};
