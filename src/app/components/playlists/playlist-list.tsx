/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { useDeletePlaylistMutation } from '@/hooks/use-playlist-mutations';
import { usePlaylistsQuery } from '@/hooks/use-playlists-query';
import { cn } from '@/lib/utils';

import { PlaylistRow } from './playlist-row';

interface PlaylistListProps {
  /** Fired with the row's playlist id from the pencil button. */
  onEdit: (id: string) => void;
  /** Fired with the row's playlist id from the play button. */
  onPlay: (id: string) => void;
  /** Extra classes composed onto the pane's root element. */
  className?: string;
}

const SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'] as const;

/** Three placeholder rows approximating the thumb + two-line row layout. */
const PlaylistListSkeleton = ({ className }: { className?: string }): ReactElement => (
  <div className={cn(className)}>
    {SKELETON_KEYS.map((key) => (
      <div
        key={key}
        data-testid="playlist-row-skeleton"
        className="flex items-center gap-3 border-b py-2"
      >
        <Skeleton className="my-0 size-14 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="my-0 h-4 w-40" />
          <Skeleton className="my-0 h-3 w-24" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Right-pane list of the signed-in user's playlists. Owns the list query and
 * the delete mutation (rows stay presentational): a confirmed row delete
 * fires the mutation, toasting `Playlist deleted` on success and the action's
 * error message on failure. Renders skeleton rows while loading, a muted
 * error line when the query settles without data, and the empty-state copy
 * when the user has no playlists yet.
 */
export const PlaylistList = ({ onEdit, onPlay, className }: PlaylistListProps): ReactElement => {
  const { isPending, data } = usePlaylistsQuery();
  const { deletePlaylist } = useDeletePlaylistMutation();

  const handleDelete = (playlistId: string): void =>
    deletePlaylist(
      { playlistId },
      {
        onSuccess: () => toast.success('Playlist deleted'),
        onError: (error: Error) => toast.error(error.message),
      }
    );

  if (isPending) return <PlaylistListSkeleton className={className} />;

  if (!data) {
    return <p className={cn('text-sm text-zinc-500', className)}>Couldn't load playlists.</p>;
  }

  if (data.rows.length === 0) {
    return (
      <p className={cn('text-sm text-zinc-500', className)}>
        No playlists yet — build one with the creator.
      </p>
    );
  }

  return (
    <ul className={cn(className)}>
      {data.rows.map((row) => (
        <PlaylistRow
          key={row.id}
          row={row}
          onEdit={() => onEdit(row.id)}
          onPlay={() => onPlay(row.id)}
          onDelete={() => handleDelete(row.id)}
        />
      ))}
    </ul>
  );
};
