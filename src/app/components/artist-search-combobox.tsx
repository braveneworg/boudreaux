/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Search, User } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import type { ArtistListingRow } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

const SEARCH_PLACEHOLDER = 'Search by name, genre, or release';

export interface ArtistSearchComboboxProps {
  /** The live (undebounced) query — also filters the listing behind it. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Top matches for the current debounced query, in listing order. */
  results: ArtistListingRow[];
  /** True while the debounced query's page is being fetched. */
  isFetching: boolean;
  /** Fired when a suggestion is picked; the caller narrows the listing to it. */
  onSelect: (artist: ArtistListingRow) => void;
  className?: string;
}

/** The primary bio image thumbnail for a dropdown row, or `null` when the artist has none. */
const rowImageSrc = ({ bioImages }: ArtistListingRow): string | null => {
  const image = bioImages.at(0);
  return image ? (image.thumbnailUrl ?? image.url) : null;
};

/**
 * Search combobox for the public /artists index (the artists counterpart of
 * `VideoSearchCombobox`): a search-box-styled trigger opens a
 * keyboard-navigable dropdown that prepopulates with the artists matching the
 * typed name / aka / genre / release-title query. The query is lifted, so the
 * grid behind the dropdown narrows in step with it; picking a suggestion hands
 * the row back to the caller, which fills the field with the artist's name
 * (no navigation — the card is the way into the artist page). Server search
 * provides the matches — cmdk's own filtering is disabled.
 */
export const ArtistSearchCombobox = ({
  search,
  onSearchChange,
  results,
  isFetching,
  onSelect,
  className,
}: ArtistSearchComboboxProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const hasQuery = search.trim().length > 0;

  const handleSelect = (artist: ArtistListingRow): void => {
    setOpen(false);
    onSelect(artist);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-label="Search artists"
          // Trigger styled as the search field it replaces, with a focus/open
          // ring in the ARTISTS section accent (hot pink).
          className={cn(
            'focus-visible:ring-menu-item-pink-400 data-[state=open]:ring-menu-item-pink-400 flex w-full items-center gap-2 border border-zinc-950 bg-zinc-50 px-3 py-2 text-sm transition-[color,box-shadow] hover:border-zinc-400 focus-visible:ring-[3px] focus-visible:outline-none data-[state=open]:ring-[3px]',
            hasQuery ? 'text-zinc-950' : 'text-zinc-500',
            className
          )}
        >
          <Search aria-hidden className="size-4 shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1 truncate text-left">
            {hasQuery ? search : SEARCH_PLACEHOLDER}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* Server provides the matches; disable cmdk's client-side filtering. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={onSearchChange}
            placeholder={SEARCH_PLACEHOLDER}
            aria-label="Search artists"
          />
          <CommandList>
            <CommandEmpty>
              {isFetching
                ? 'Searching…'
                : hasQuery
                  ? `No artists match “${search.trim()}”.`
                  : 'No artists yet.'}
            </CommandEmpty>
            <CommandGroup>
              {results.map((artist) => {
                const imageSrc = rowImageSrc(artist);
                return (
                  <CommandItem
                    key={artist.id}
                    value={artist.id}
                    onSelect={() => handleSelect(artist)}
                    className="flex items-center gap-3 px-2 py-1.5"
                  >
                    {imageSrc ? (
                      <Image
                        src={imageSrc}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 shrink-0 object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center bg-zinc-200 text-zinc-500">
                        <User aria-hidden className="size-4" />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {getArtistDisplayName(artist)}
                      </span>
                      {artist.newestRelease ? (
                        <span className="truncate text-xs text-zinc-500">
                          {artist.newestRelease.title}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
