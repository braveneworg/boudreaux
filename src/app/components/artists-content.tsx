/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Loader2, Users } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ZineToggleGroup, ZineToggleGroupItem } from '@/app/components/ui/zine-toggle-group';
import { useInfinitePublishedArtistsQuery } from '@/hooks/queries/use-infinite-published-artists-query';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type { ArtistListingRow, ArtistListingSort } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { ARTIST_LISTING_SORTS } from '@/lib/validation/artist-listing-query-schema';

import { ARTIST_PHOTO_FRAME_CLASS, ArtistListCard } from './artist-list-card';
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
 * The roster count that sits at the toolbar's right edge. While a search
 * narrows the list it counts matches, not the roster; while more pages remain
 * the total is unknown, so it says how many are showing instead.
 */
const formatArtistCount = (count: number, search: string, hasNextPage: boolean): string => {
  if (hasNextPage) return `Showing ${count}`;
  if (search) return `${count} ${count === 1 ? 'match' : 'matches'} for “${search}”`;
  return `${count} ${count === 1 ? 'artist' : 'artists'}`;
};

/**
 * Initial-load skeleton mirroring the real layout — the full-width search/sort
 * toolbar and four photo-left/text-right card placeholders at the card's own
 * frame size, inset, and row spacing — so nothing jumps when the first page
 * lands.
 */
const ArtistsSkeleton = (): ReactElement => (
  <div className="flex flex-col gap-8 py-4" aria-busy="true">
    <p role="status" className="sr-only">
      Loading artists…
    </p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Skeleton className="h-9 w-48 shrink-0" />
      <Skeleton className="h-9 w-full sm:max-w-md" />
    </div>
    <div data-slot="artists-skeleton-list" className="flex w-full flex-col gap-8">
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex flex-col gap-4 bg-white p-5 sm:flex-row sm:gap-6 sm:p-6">
          <Skeleton
            data-slot="artists-skeleton-photo"
            className={cn('my-0 shrink-0', ARTIST_PHOTO_FRAME_CLASS)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="my-0 h-7 w-1/2" />
            <Skeleton className="my-0 h-4 w-1/3" />
            <Skeleton className="my-0 h-4 w-1/4" />
            <Skeleton className="my-0 h-4 w-full max-w-prose" />
            <Skeleton className="my-0 h-4 w-2/3" />
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
 * width of the zine panel, with 32px between rows supplied by the list alone
 * (the card zeroes the `Card` primitive's own margin). Sort sits left of
 * search in a toolbar at that same full width, the two grouped at the left
 * edge rather than pushed to opposite ends, the search field capped at
 * `sm:max-w-md` so it does not swallow the row, and the roster count parked
 * at the toolbar's right edge where the row was otherwise empty.
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
    <div className="flex flex-col gap-8 py-4">
      <div data-slot="artists-toolbar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ZineToggleGroup
          type="single"
          value={sort}
          onValueChange={handleSortChange}
          aria-label="Sort artists"
          className="shrink-0"
        >
          {/* Full accent, not the toggle's default soft shade: soft hot-pink
              (pink-200) is under 3:1 against the unselected fill, and the fill
              is the only selected-state cue (WCAG 1.4.11). */}
          {ARTIST_SORT_OPTIONS.map(({ value, label }) => (
            <ZineToggleGroupItem
              key={value}
              value={value}
              className="data-[state=on]:bg-(--card-accent)"
            >
              {label}
            </ZineToggleGroupItem>
          ))}
        </ZineToggleGroup>

        <ArtistSearchCombobox
          search={searchInput}
          onSearchChange={setSearchInput}
          results={artists.slice(0, MAX_SUGGESTIONS)}
          isFetching={isFetching}
          onSelect={handleSuggestionSelect}
          className="sm:max-w-md"
        />

        {artists.length > 0 && (
          <p
            data-slot="artists-count"
            className="text-sm text-zinc-600 tabular-nums sm:ml-auto"
            aria-live="polite"
          >
            {formatArtistCount(artists.length, search, hasNextPage)}
          </p>
        )}
      </div>

      {artists.length === 0 ? (
        <ArtistsEmpty search={search} />
      ) : (
        <ul className="flex w-full flex-col gap-8">
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
