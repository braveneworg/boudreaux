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
        <div className="relative mt-2 -mb-2.5 w-full" role="group">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-zinc-950" />
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
            className="selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring h-10 w-full min-w-0 rounded-md border! border-x border-zinc-950! bg-transparent px-3 py-1 pl-8 shadow-xs transition-[color,box-shadow] focus-visible:ring-[3px]"
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
