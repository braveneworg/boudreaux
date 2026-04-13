/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ArtistSearchInput — a client component that provides a debounced combobox
 * dropdown for searching published artists by name, group, or release title.
 * Selecting an artist or release navigates to the artist detail page.
 */
'use client';

import { useCallback, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { Disc3, Search, User } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/app/components/ui/popover';
import { useArtistNavSearchQuery } from '@/app/hooks/use-artist-nav-search-query';
import { useDebounce } from '@/app/hooks/use-debounce';

const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_DELAY = 400;

export const ArtistSearchInput = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY);
  const { isPending: isLoading, data } = useArtistNavSearchQuery(debouncedQuery);
  const results = data?.results ?? [];

  const handleArtistSelect = useCallback(
    (slug: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/artists/${slug}`);
    },
    [router]
  );

  const handleReleaseSelect = useCallback(
    (slug: string, releaseId: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/artists/${slug}?release=${releaseId}`);
    },
    [router]
  );

  const hasResults = results.length > 0;
  const showDropdown = query.length >= MIN_SEARCH_LENGTH;

  return (
    <Popover open={open && showDropdown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-full" role="group">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search artists & releases"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.length >= MIN_SEARCH_LENGTH) {
                setOpen(true);
              }
            }}
            onFocus={() => {
              if (query.length >= MIN_SEARCH_LENGTH && hasResults) {
                setOpen(true);
              }
            }}
            className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pl-9 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]"
            aria-label="Search artists and releases"
            aria-expanded={open && showDropdown}
            aria-controls="artist-search-listbox"
            aria-haspopup="listbox"
            role="combobox"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList id="artist-search-listbox">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
            ) : !hasResults ? (
              <CommandEmpty>No artists or releases found.</CommandEmpty>
            ) : (
              results.map((artist) => (
                <CommandGroup key={artist.artistSlug} heading={artist.artistName}>
                  <CommandItem
                    value={`artist-${artist.artistSlug}`}
                    onSelect={() => handleArtistSelect(artist.artistSlug)}
                    className="flex items-center gap-3 px-2 py-1.5"
                  >
                    {artist.thumbnailSrc ? (
                      <Image
                        src={artist.thumbnailSrc}
                        alt={artist.artistName}
                        width={32}
                        height={32}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                        <User className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="text-sm font-medium">All releases by {artist.artistName}</span>
                  </CommandItem>
                  {artist.releases.map((release) => (
                    <CommandItem
                      key={release.id}
                      value={`release-${release.id}`}
                      onSelect={() => handleReleaseSelect(artist.artistSlug, release.id)}
                      className="flex items-center gap-3 px-2 py-1.5 pl-6"
                    >
                      <Disc3 className="size-4 text-muted-foreground" />
                      <span className="text-sm">{release.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
