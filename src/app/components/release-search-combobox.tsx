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
 * Selecting a playable result opens its listening modal in place.
 */
'use client';

import * as React from 'react';

import Image from 'next/image';

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
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  getArtistDisplayNameForRelease,
  getFirstTrackStreamSource,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import {
  HomeSearchPlayDialog,
  type HomeSearchPlayDialogHandle,
  type HomeSearchReleaseArtist,
} from './home-search-play-dialog';

/** How close to the list's bottom edge (px) before the next page loads. */
const NEAR_BOTTOM_THRESHOLD_PX = 48;

/** One result row, derived once per result set. */
interface ReleaseSearchResult {
  release: PublishedReleaseListing;
  coverArt: ReturnType<typeof getReleaseCoverArt>;
  /** The album artist's name and slug; both `null` when that artist is hidden. */
  artist: HomeSearchReleaseArtist;
  /** The first MP3 track's stream URL; `null` leaves the row unselectable. */
  playSrc: string | null;
}

/**
 * A combobox dropdown that opens onto the browsable published catalog
 * (infinitely scrolled) and switches to server search as the user types.
 * Each result shows a cover art thumbnail, artist name, and title.
 * Selecting a playable result primes its first track inside the pick's
 * gesture and opens its listening modal in place (`HomeSearchPlayDialog`),
 * leaving the URL as it is; a result with nothing playable is disabled.
 * Closing the modal returns focus to the search trigger.
 */
export const ReleaseSearchCombobox = () => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const playDialogRef = React.useRef<HomeSearchPlayDialogHandle>(null);
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

  // Primes inside this pick's gesture, so playback starts now.
  const handleSelect = ({ release, coverArt, artist, playSrc }: ReleaseSearchResult): void => {
    setOpen(false);
    playDialogRef.current?.openRelease(artist, {
      id: release.id,
      title: release.title,
      coverArtSrc: coverArt?.src ?? null,
      playSrc,
      year: release.releasedOn.getUTCFullYear(),
    });
  };

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
    (): ReleaseSearchResult[] =>
      (releases ?? []).map((release) => ({
        release,
        coverArt: getReleaseCoverArt(release),
        artist: {
          artistName: release.albumArtist
            ? getArtistDisplayNameForRelease(release.albumArtist)
            : null,
          artistSlug: release.albumArtist?.slug ?? null,
        },
        playSrc: getFirstTrackStreamSource(release),
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
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SearchComboboxTrigger
            ref={triggerRef}
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
                {enrichedResults.map((result) => {
                  const { release, coverArt, artist, playSrc } = result;
                  return (
                    <CommandItem
                      key={release.id}
                      value={release.id}
                      disabled={playSrc === null}
                      onSelect={() => handleSelect(result)}
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
                        secondary={artist.artistName}
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
      <HomeSearchPlayDialog ref={playDialogRef} returnFocusRef={triggerRef} />
    </>
  );
};
