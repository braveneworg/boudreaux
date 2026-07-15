/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState, type ReactElement } from 'react';

import { Search } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePlaylistsQuery } from '@/hooks/use-playlists-query';
import { cn } from '@/lib/utils';

interface MyPlaylistSearchProps {
  /** Fired with the picked playlist's id; the popover closes itself. */
  onSelect: (id: string) => void;
  /** Extra classes composed onto the trigger (e.g. `lg:hidden` from the parent). */
  className?: string;
}

const SEARCH_PLACEHOLDER = 'Search your playlists…';

/**
 * Mobile quick-jump into one of the user's playlists: a search-input-styled
 * trigger opening a Popover+Command palette over `usePlaylistsQuery` rows.
 * cmdk's default filtering matches the typed query against playlist titles
 * (each item's `value`); selecting a row fires `onSelect` with its id and
 * closes the popover.
 */
export const MyPlaylistSearch = ({ onSelect, className }: MyPlaylistSearchProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const { data } = usePlaylistsQuery();
  const rows = data?.rows ?? [];

  const handleSelect = (id: string): void => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label="Search your playlists"
          className={cn(
            'flex w-full items-center gap-2 border border-zinc-950 bg-zinc-50 px-3 py-2 text-sm text-zinc-500',
            className
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          {SEARCH_PLACEHOLDER}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={SEARCH_PLACEHOLDER} aria-label="Search your playlists" />
          <CommandList>
            <CommandEmpty>No playlists yet.</CommandEmpty>
            <CommandGroup>
              {rows.map((row) => (
                <CommandItem key={row.id} value={row.title} onSelect={() => handleSelect(row.id)}>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
