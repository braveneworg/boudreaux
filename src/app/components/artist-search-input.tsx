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

import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Search } from 'lucide-react';

import { Popover, PopoverAnchor, PopoverContent } from '@/app/components/ui/popover';
import { useArtistNavSearchQuery } from '@/app/hooks/use-artist-nav-search-query';
import { useDebounce } from '@/app/hooks/use-debounce';

const MIN_SEARCH_LENGTH = 3;
const DEBOUNCE_DELAY = 400;

const ArtistSearchResults = nextDynamic(
  () => import('./artist-search-results').then((mod) => ({ default: mod.ArtistSearchResults })),
  { ssr: false }
);

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
        <div className="relative w-full mt-2 -mb-2.5" role="group">
          <Search className="text-zinc-950-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            className="border border-zinc-950 placeholder:font-bold"
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
            className="file:text-foreground placeholder:text-zinc-950-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 h-9 w-full min-w-0 border border-zinc-950! rounded-md bg-transparent px-3 py-1 pl-9 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px]"
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
        {showDropdown ? (
          <ArtistSearchResults
            id="artist-search-listbox"
            isLoading={isLoading}
            results={results}
            onArtistSelect={handleArtistSelect}
            onReleaseSelect={handleReleaseSelect}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
