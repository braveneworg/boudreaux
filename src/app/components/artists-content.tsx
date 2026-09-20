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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-9 w-full sm:max-w-md" />
      <Skeleton className="h-9 w-48" />
    </div>
    <div data-slot="artists-skeleton-list" className="mx-auto flex w-full flex-col gap-4 lg:w-3/4">
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
 * The page reads as a browsable feed: one card per row, the column held to
 * three quarters of the panel width from `lg` up and centered, so the card's
 * full-width short bio keeps a readable measure. The toolbar deliberately
 * stays at full panel width rather than narrowing with the cards — it keeps
 * the search field lined up with the breadcrumb and the `ARTISTS` heading
 * above it, and that field is capped wider (`sm:max-w-md`) to hold its own
 * against the wider cards below.
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
      <div
        data-slot="artists-toolbar"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <ArtistSearchCombobox
          search={searchInput}
          onSearchChange={setSearchInput}
          results={artists.slice(0, MAX_SUGGESTIONS)}
          isFetching={isFetching}
          onSelect={handleSuggestionSelect}
          className="sm:max-w-md"
        />

        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={handleSortChange}
          variant="outline"
          aria-label="Sort artists"
          className="shrink-0"
        >
          <ToggleGroupItem value="alpha">A–Z</ToggleGroupItem>
          <ToggleGroupItem value="newest">Newest release</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {artists.length === 0 ? (
        <ArtistsEmpty search={search} />
      ) : (
        <ul className="mx-auto flex w-full flex-col gap-4 lg:w-3/4">
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
