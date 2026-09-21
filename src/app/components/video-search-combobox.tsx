/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Film } from 'lucide-react';

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
import type { VideoRow } from '@/lib/validation/video-schema';

const SEARCH_PLACEHOLDER = 'Search by title or artist';

export interface VideoSearchComboboxProps {
  /** The live (undebounced) query — also filters the listing behind it. */
  search: string;
  onSearchChange: (value: string) => void;
  /** Top matches for the current debounced query, newest first. */
  results: VideoRow[];
  /** True while the debounced query's page is being fetched. */
  isFetching: boolean;
  /** Fired inside the selection gesture — safe to prime media playback in. */
  onSelect: (video: VideoRow) => void;
  className?: string;
}

/**
 * Search combobox for the public /videos listing (the videos counterpart of
 * `ReleaseSearchCombobox`): the shared zine search trigger opens a
 * keyboard-navigable dropdown that prepopulates with the videos matching the
 * typed title/artist query. The query is lifted, so the listing behind the
 * dropdown filters in step with it, and selecting a suggestion hands the row
 * back to the caller inside the click/Enter gesture (which opens the play
 * modal already playing). Server search provides the matches — cmdk's own
 * filtering is disabled.
 */
export const VideoSearchCombobox = ({
  search,
  onSearchChange,
  results,
  isFetching,
  onSelect,
  className,
}: VideoSearchComboboxProps): ReactElement => {
  const [open, setOpen] = useState(false);
  const hasQuery = search.trim().length > 0;

  const handleSelect = (video: VideoRow): void => {
    setOpen(false);
    onSelect(video);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label="Search videos"
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
            aria-label="Search videos"
          />
          <CommandList>
            <CommandEmpty>
              {isFetching
                ? 'Searching…'
                : hasQuery
                  ? `No videos match “${search.trim()}”.`
                  : 'No videos yet.'}
            </CommandEmpty>
            <CommandGroup>
              {results.map((video) => (
                <CommandItem
                  key={video.id}
                  value={video.id}
                  onSelect={() => handleSelect(video)}
                  className={SEARCH_RESULT_ITEM_CLASS}
                >
                  <SearchResultRow
                    thumbnail={
                      video.posterUrl ? (
                        <Image
                          src={video.posterUrl}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="aspect-video w-10 shrink-0 object-cover"
                        />
                      ) : (
                        <span className="flex aspect-video w-10 shrink-0 items-center justify-center bg-zinc-200 text-zinc-500">
                          <Film aria-hidden className="size-4" />
                        </span>
                      )
                    }
                    primary={video.title}
                    secondary={video.artist}
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
