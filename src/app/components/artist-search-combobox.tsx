/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { User } from 'lucide-react';

import { SearchComboboxTrigger } from '@/app/components/search-combobox-trigger';
import { SEARCH_RESULT_ITEM_CLASS, SearchResultRow } from '@/app/components/search-result-row';
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
 * `VideoSearchCombobox`): the shared zine search trigger opens a
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
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label="Search artists"
          label={hasQuery ? search : SEARCH_PLACEHOLDER}
          className={className}
        />
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
                    className={SEARCH_RESULT_ITEM_CLASS}
                  >
                    <SearchResultRow
                      thumbnail={
                        imageSrc ? (
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
                        )
                      }
                      primary={getArtistDisplayName(artist)}
                      secondary={artist.newestRelease?.title}
                    />
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
