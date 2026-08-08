/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import Image from 'next/image';

import { Film, Search } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { cn } from '@/lib/utils';
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
 * `ReleaseSearchCombobox`): a search-box-styled trigger opens a
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
        <button
          type="button"
          aria-expanded={open}
          aria-label="Search videos"
          // Trigger styled as the search field it replaces, with a focus/open
          // ring in the VIDEOS nav accent tan.
          className={cn(
            'focus-visible:ring-menu-item-tan-400 data-[state=open]:ring-menu-item-tan-400 flex w-full items-center gap-2 border border-zinc-950 bg-zinc-50 px-3 py-2 text-sm transition-[color,box-shadow] hover:border-zinc-400 focus-visible:ring-[3px] focus-visible:outline-none data-[state=open]:ring-[3px]',
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
                  className="flex items-center gap-3 px-2 py-1.5"
                >
                  {video.posterUrl ? (
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
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{video.title}</span>
                    <span className="truncate text-xs text-zinc-500">{video.artist}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
