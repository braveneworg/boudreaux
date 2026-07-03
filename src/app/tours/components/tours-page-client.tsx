/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

import { Loader2 } from 'lucide-react';

import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type {
  ArtistScalars as Artist,
  TourDateHeadlinerScalars as TourDateHeadliner,
  TourDateScalars as TourDate,
  TourImageScalars as TourImage,
  TourScalars as Tour,
  VenueScalars as Venue,
} from '@/lib/types/tours';

import { TourList } from './tour-list';
import { TourSearch } from './tour-search';

export interface ToursPageClientProps {
  tours: (Tour & {
    tourDates: Array<
      TourDate & {
        venue: Venue;
        headliners: Array<
          TourDateHeadliner & {
            artist: Artist | null;
          }
        >;
      }
    >;
    images: TourImage[];
  })[];
  /** Current server-side search term. */
  search: string;
  /** Called when the search term changes. */
  onSearchChange: (value: string) => void;
  /** Whether more pages remain to load. */
  hasNextPage: boolean;
  /** Whether the next page is currently loading. */
  isFetchingNextPage: boolean;
  /** Loads the next page of tours. */
  fetchNextPage: () => void;
}

/**
 * Presentational tours listing: a controlled search box plus an
 * infinite-scrolling list. Search is applied server-side by the parent; this
 * component only renders results and triggers `fetchNextPage` as the sentinel
 * scrolls into view.
 */
export const ToursPageClient = ({
  tours,
  search,
  onSearchChange,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: ToursPageClientProps) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 sm:max-w-md">
          <TourSearch value={search} onChange={onSearchChange} />
        </div>
        {search && (
          <div className="text-sm text-zinc-950">
            {tours.length === 1 ? '1 tour found' : `${tours.length} tours found`}
          </div>
        )}
      </div>

      {/* Tour List */}
      {tours.length === 0 && search ? (
        <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center border-2 border-dashed p-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-zinc-950">No tours found</h3>
            <p className="mt-2 text-sm text-zinc-950">
              Try adjusting your search or clear filters to see all tours.
            </p>
          </div>
        </div>
      ) : (
        <>
          <TourList tours={tours} />
          <div
            ref={sentinelRef}
            className="flex min-h-12 items-center justify-center py-6"
            aria-hidden={!hasNextPage}
          >
            {isFetchingNextPage ? <Loader2 className="h-6 w-6 animate-spin text-zinc-950" /> : null}
          </div>
        </>
      )}
    </div>
  );
};
