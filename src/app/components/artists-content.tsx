/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Loader2, Users } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { useInfinitePublishedArtistsQuery } from '@/hooks/queries/use-infinite-published-artists-query';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type { ArtistListingRow, ArtistListingSort } from '@/lib/types/domain/artist';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { ARTIST_LISTING_SORTS } from '@/lib/validation/artist-listing-query-schema';

import { ArtistListCard } from './artist-list-card';
import { ArtistSearchCombobox } from './artist-search-combobox';

/** How many rows the search dropdown suggests at most. */
const MAX_SUGGESTIONS = 8;

/** Debounce applied to the typed query before it reaches the server. */
const SEARCH_DEBOUNCE_MS = 300;

/** The sort toggle's options, in the order they read left to right. */
const ARTIST_SORT_OPTIONS: ReadonlyArray<{ value: ArtistListingSort; label: string }> = [
  { value: 'alpha', label: 'A–Z' },
  { value: 'newest', label: 'Newest release' },
];

/** Whether a toggle value is one of the listing's sort orders. */
const isArtistListingSort = (value: string): value is ArtistListingSort =>
  (ARTIST_LISTING_SORTS as readonly string[]).includes(value);

/**
 * Initial-load skeleton mirroring the real layout — the full-width search/sort
 * toolbar and four image-left/details-right card placeholders in the
 * three-quarter-width single column — so nothing jumps when the first page
 * lands.
 */
const ArtistsSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-6 py-4" aria-busy="true">
    <p role="status" className="sr-only">
      Loading artists…
    </p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Skeleton className="h-9 w-48 shrink-0" />
      <Skeleton className="h-9 w-full sm:max-w-md" />
    </div>
    <div data-slot="artists-skeleton-list" className="flex w-full flex-col gap-4">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex flex-col gap-4 bg-white p-4 sm:flex-row">
          <Skeleton className="size-20 shrink-0 sm:size-24" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Error state with a retry that refetches the listing in place. */
const ArtistsError = ({ onRetry }: { onRetry: () => void }): ReactElement => (
  <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
    <p className="text-zinc-950">Unable to load artists. Please try again later.</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/** Empty state for no listed artists at all, or none matching the search. */
const ArtistsEmpty = ({ search }: { search: string }): ReactElement => (
  <div className="border-muted-foreground/25 flex min-h-60 flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center">
    <Users className="text-muted-foreground size-8" aria-hidden />
    <p className="text-muted-foreground">
      {search ? `No artists match “${search}”.` : 'No artists have been published yet.'}
    </p>
  </div>
);

/**
 * Client content island for the public `/artists` index.
 *
 * Pages through listed artists (ADR-0007) with infinite scroll; the first page
 * is hydrated from the SSR prefetch. A toolbar pairs a debounced search
 * combobox — whose dropdown prepopulates with the first matches of the same
 * query that feeds the list — with an A–Z / newest-release sort toggle. The
 * query and sort are part of the query key, so changing either resets
 * pagination while `keepPreviousData` keeps the current cards on screen during
 * the transition. Picking a suggestion fills the field with the artist's name
 * so the list narrows to them; the card itself is the way into the artist page.
 *
 * The page reads as a browsable feed: one card per row, each running the full
 * width of the zine panel, so the card's own full-width short bio carries the
 * measure. Sort sits left of search in a toolbar at that same full width, the
 * two grouped at the left edge rather than pushed to opposite ends, and the
 * search field is capped at `sm:max-w-md` so it does not swallow the row.
 */
export const ArtistsContent = (): ReactElement => {
  const [sort, setSort] = useState<ArtistListingSort>('alpha');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, SEARCH_DEBOUNCE_MS).trim();
  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePublishedArtistsQuery(sort, search);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  const handleSortChange = (value: string): void => {
    if (isArtistListingSort(value)) setSort(value);
  };

  const handleSuggestionSelect = (artist: ArtistListingRow): void => {
    setSearchInput(getArtistDisplayName(artist));
  };

  if (isPending) {
    return <ArtistsSkeleton />;
  }

  if (error && !data) {
    return <ArtistsError onRetry={refetch} />;
  }

  const artists = data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <div className="flex flex-col gap-6 py-4">
      <div data-slot="artists-toolbar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Not the `outline` variant: that draws a per-item hairline border and
            a soft shadow, neither of which is the zine look. One hard black
            frame with an ink offset wraps the pair, and the divider rides on
            the second item. `flex-none` is load-bearing — `ToggleGroupItem`
            defaults to `flex-1` (basis 0), which splits a `w-fit` group evenly
            between the items while `whitespace-nowrap` refuses to wrap, so the
            longer label spilled past its own box. */}
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={handleSortChange}
          aria-label="Sort artists"
          className="shadow-zine-ink w-fit shrink-0 border-2 border-black bg-zinc-50"
        >
          {ARTIST_SORT_OPTIONS.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="data-[state=on]:bg-menu-item-pink-300 h-9 flex-none px-4 text-xs font-semibold tracking-wider uppercase not-first:border-l-2 not-first:border-black hover:bg-zinc-200 data-[state=on]:text-black"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <ArtistSearchCombobox
          search={searchInput}
          onSearchChange={setSearchInput}
          results={artists.slice(0, MAX_SUGGESTIONS)}
          isFetching={isFetching}
          onSelect={handleSuggestionSelect}
          className="sm:max-w-md"
        />
      </div>

      {artists.length === 0 ? (
        <ArtistsEmpty search={search} />
      ) : (
        <ul className="flex w-full flex-col gap-4">
          {artists.map((artist) => (
            <li key={artist.id}>
              <ArtistListCard artist={artist} />
            </li>
          ))}
        </ul>
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-2"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-zinc-950" aria-hidden="true" />
            <span role="status" className="sr-only">
              Loading more artists…
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
};
