/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState, type ReactElement } from 'react';

import { Plus } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { usePlaylistsQuery } from '@/hooks/use-playlists-query';
import type { PlaylistListRow } from '@/lib/types/domain/playlist';

import { PlaylistCoverTiles } from './playlist-cover-tiles';

/** Maximum number of rows shown at once — typing narrows the list further. */
const MAX_VISIBLE_ROWS = 5;

interface PlaylistPickerComboboxProps {
  /** Receives the full playlist row when the user picks one. */
  onPick: (row: PlaylistListRow) => void;
  /** Playlist id to hide from the list (e.g. the playlist currently open). */
  excludePlaylistId?: string;
}

/**
 * Inline playlist picker — a cmdk `Command` without a popover, embedded by
 * parents wherever they need it (e.g. the creator's "add to playlist" flow).
 * Lists the signed-in user's playlists from `usePlaylistsQuery`, manually
 * filtered by the typed query (the query stays the single source of truth,
 * so cmdk's own filtering is disabled) and capped at {@link MAX_VISIBLE_ROWS}.
 */
export const PlaylistPickerCombobox = ({
  onPick,
  excludePlaylistId,
}: PlaylistPickerComboboxProps): ReactElement => {
  const [search, setSearch] = useState('');
  const { isPending, rows } = usePlaylistsQuery();

  const q = search.toLowerCase();
  const visibleRows = (rows ?? [])
    .filter((row) => row.id !== excludePlaylistId)
    .filter((row) => row.title.toLowerCase().includes(q))
    .slice(0, MAX_VISIBLE_ROWS);

  return (
    <Command shouldFilter={false}>
      <CommandInput
        className="border-none"
        value={search}
        onValueChange={setSearch}
        placeholder="Find a playlist…"
        aria-label="Find a playlist"
      />
      <CommandList>
        <CommandEmpty>{isPending ? 'Loading…' : 'No playlists yet.'}</CommandEmpty>
        <CommandGroup>
          {visibleRows.map((row) => (
            <CommandItem key={row.id} value={row.id} onSelect={() => onPick(row)} className="gap-3">
              {/* Decorative: the adjacent title text names the row. */}
              <PlaylistCoverTiles images={row.coverImages} alt="" size="sm" />
              <span className="min-w-0 flex-1 truncate">{row.title}</span>
              <Plus aria-hidden="true" className="shrink-0" />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
