/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseSearchCombobox — a combobox dropdown for browsing and searching
 * published releases. Opening it immediately lists the published catalog
 * (infinite-scrolled, sharing the page grid's prefetched query); typing
 * switches to a server-side search by artist name, release title, or catalog
 * number, covering the full catalog rather than only loaded pages. Uses
 * shadcn/ui Popover + Command (cmdk) for keyboard-navigable results.
 * Selecting a result navigates to the release's media player page.
 */
'use client';

import * as React from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

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
import {
  useInfinitePublishedReleasesQuery,
  usePublishedReleaseSearchQuery,
} from '@/hooks/queries/use-infinite-published-releases-query';
import { useDebounce } from '@/hooks/use-debounce';
import { getArtistDisplayNameForRelease, getReleaseCoverArt } from '@/lib/utils/release-helpers';

/** How close to the list's bottom edge (px) before the next page loads. */
const NEAR_BOTTOM_THRESHOLD_PX = 48;

/**
 * A combobox dropdown that opens onto the browsable published catalog
 * (infinitely scrolled) and switches to server search as the user types.
 * Each result shows a cover art thumbnail, artist name, and title.
 * Selecting a result navigates to `/releases/{releaseId}`.
 */
export const ReleaseSearchCombobox = () => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: searchReleases, isFetching } = usePublishedReleaseSearchQuery(debouncedSearch);

  // Browse mode for an empty query: the same infinite listing the page grid
  // uses (shared query key, so the SSR prefetch makes opening instant).
  const {
    data: browsePages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: isBrowsePending,
  } = useInfinitePublishedReleasesQuery('');

  const handleSelect = React.useCallback(
    (releaseId: string) => {
      setOpen(false);
      router.push(`/releases/${releaseId}`);
    },
    [router]
  );

  const hasQuery = debouncedSearch.trim().length > 0;

  const browseReleases = React.useMemo(
    () => (browsePages?.pages ?? []).flatMap((page) => page.rows),
    [browsePages]
  );
  const releases = hasQuery ? searchReleases : browseReleases;

  // Derive cover art + artist name once per result set rather than on every
  // keystroke-driven re-render (the search input updates state on each key,
  // while `releases` only changes when the debounced query resolves).
  const enrichedResults = React.useMemo(
    () =>
      (releases ?? []).map((release) => ({
        release,
        coverArt: getReleaseCoverArt(release),
        artistName: release.artistReleases[0]
          ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
          : null,
      })),
    [releases]
  );

  /** Pull the next browse page as the list nears its bottom edge. */
  const handleListScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (hasQuery || !hasNextPage || isFetchingNextPage) return;
      const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
      if (scrollTop + clientHeight >= scrollHeight - NEAR_BOTTOM_THRESHOLD_PX) {
        void fetchNextPage();
      }
    },
    [hasQuery, hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label="Search releases"
          label="Search releases..."
        />
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* Server provides the matches; disable cmdk's client-side filtering. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search by artist, title, or catalog number..."
            aria-label="Search releases"
          />
          <CommandList onScroll={handleListScroll}>
            <CommandEmpty>
              {(hasQuery ? isFetching : isBrowsePending)
                ? 'Loading releases…'
                : 'No releases found.'}
            </CommandEmpty>
            <CommandGroup>
              {enrichedResults.map(({ release, coverArt, artistName }) => {
                return (
                  <CommandItem
                    key={release.id}
                    value={release.id}
                    onSelect={() => handleSelect(release.id)}
                    className={SEARCH_RESULT_ITEM_CLASS}
                  >
                    <SearchResultRow
                      thumbnail={
                        coverArt ? (
                          <Image
                            src={coverArt.src}
                            alt={coverArt.alt}
                            width={40}
                            height={40}
                            className="size-10 shrink-0 object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center bg-zinc-200 text-xs text-zinc-500">
                            ♫
                          </span>
                        )
                      }
                      primary={release.title}
                      secondary={artistName}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {!hasQuery && isFetchingNextPage && (
              <div className="py-2 text-center text-xs text-zinc-500">Loading more…</div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
