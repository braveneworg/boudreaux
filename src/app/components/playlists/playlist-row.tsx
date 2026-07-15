/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import type { PlaylistListRow } from '@/lib/types/domain/playlist';
import { formatDurationLong } from '@/lib/utils/format-duration';

import { PlaylistCoverTiles } from './playlist-cover-tiles';
import { PlaylistRowActions } from './playlist-row-actions';

interface PlaylistRowProps {
  /** The playlist to render. */
  row: PlaylistListRow;
  /** Fired by the actions cluster's pencil button. */
  onEdit: () => void;
  /** Fired by the actions cluster's play button. */
  onPlay: () => void;
  /** Fired after the actions cluster's delete confirm. */
  onDelete: () => void;
}

/** `"{itemCount} item(s) · {Public|Private}"` meta line under the title. */
const metaLine = ({ itemCount, isPublic }: PlaylistListRow): string =>
  `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${isPublic ? 'Public' : 'Private'}`;

/**
 * One row in the My Playlists list: cover mosaic thumb, truncated title over
 * an item-count/visibility meta line, the long-format total duration, and the
 * per-row action cluster. Pure presentation — the list owns the delete
 * mutation and passes per-row callbacks.
 */
export const PlaylistRow = ({ row, onEdit, onPlay, onDelete }: PlaylistRowProps): ReactElement => (
  <li className="flex items-center gap-3 border-b py-2">
    {/* Decorative: the adjacent title text names the row. */}
    <PlaylistCoverTiles images={row.coverImages} alt="" size="sm" />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium">{row.title}</span>
      <span className="truncate text-xs text-zinc-500">{metaLine(row)}</span>
    </div>
    <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
      {formatDurationLong(row.totalDuration)}
    </span>
    <PlaylistRowActions row={row} onEdit={onEdit} onPlay={onPlay} onDelete={onDelete} />
  </li>
);
