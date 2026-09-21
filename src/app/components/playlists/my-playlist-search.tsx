/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState, type ReactElement } from 'react';

import { SearchComboboxTrigger } from '@/components/search-combobox-trigger';
import { SEARCH_RESULT_ITEM_CLASS, SearchResultRow } from '@/components/search-result-row';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { usePlaylistsQuery } from './_hooks/use-playlists-query';
import { PlaylistCoverTiles } from './playlist-cover-tiles';

interface MyPlaylistSearchProps {
  /** Fired with the picked playlist's id; the popover closes itself. */
  onSelect: (id: string) => void;
  /** Extra classes composed onto the trigger (e.g. `lg:hidden` from the parent). */
  className?: string;
}

const SEARCH_PLACEHOLDER = 'Search your playlists…';

/**
 * Mobile quick-jump into one of the user's playlists: the shared zine search
 * trigger opening a Popover+Command palette over `usePlaylistsQuery` rows.
 * cmdk's default filtering matches the typed query against playlist titles
 * (each item's `value`); selecting a row fires `onSelect` with its id and
 * closes the popover.
 */
export const MyPlaylistSearch = ({ onSelect, className }: MyPlaylistSearchProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const { rows } = usePlaylistsQuery();
  const listRows = rows ?? [];

  const handleSelect = (id: string): void => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label="Search your playlists"
          label={SEARCH_PLACEHOLDER}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={SEARCH_PLACEHOLDER} aria-label="Search your playlists" />
          <CommandList>
            <CommandEmpty>No playlists yet.</CommandEmpty>
            <CommandGroup>
              {listRows.map((row) => (
                <CommandItem
                  key={row.id}
                  value={row.title}
                  onSelect={() => handleSelect(row.id)}
                  className={SEARCH_RESULT_ITEM_CLASS}
                >
                  <SearchResultRow
                    // Decorative: the adjacent title text names the row.
                    thumbnail={
                      <PlaylistCoverTiles images={row.coverImages} alt="" className="size-10" />
                    }
                    primary={row.title}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
