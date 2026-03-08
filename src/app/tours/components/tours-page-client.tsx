/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { TourList } from './tour-list';
import { TourSearch } from './tour-search';

import type {
  Artist,
  Group,
  Tour,
  TourDate,
  TourDateHeadliner,
  TourImage,
  Venue,
} from '@prisma/client';

export interface ToursPageClientProps {
  tours: (Tour & {
    tourDates: Array<
      TourDate & {
        venue: Venue;
        headliners: Array<
          TourDateHeadliner & {
            artist: (Artist & { groups: Array<{ group: Group }> }) | null;
            group: Group | null;
          }
        >;
      }
    >;
    images: TourImage[];
  })[];
}

/**
 * Client-side wrapper for tours page with search functionality
 * Implements case-insensitive partial match filtering by artist name
 */
export const ToursPageClient = ({ tours }: ToursPageClientProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const getHeadlinerDisplayName = (headliner: {
    artist: (Artist & { groups: Array<{ group: Group }> }) | null;
    group: Group | null;
  }): string => {
    if (headliner.artist?.displayName) {
      return headliner.artist.displayName;
    }

    if (headliner.group?.name) {
      return headliner.group.name;
    }

    if (headliner.artist) {
      return `${headliner.artist.firstName} ${headliner.artist.surname}`.trim() || 'Unknown Artist';
    }

    return 'Unknown Artist';
  };

  // Filter tours based on search query
  const filteredTours = useMemo(() => {
    if (!searchQuery.trim()) {
      return tours;
    }

    const query = searchQuery.toLowerCase();

    return tours.filter((tour) => {
      // Search in tour title
      if (tour.title.toLowerCase().includes(query)) {
        return true;
      }

      // Search in tour subtitle
      if (tour.subtitle?.toLowerCase().includes(query)) {
        return true;
      }

      const hasHeadlinerMatch = tour.tourDates.some((tourDate) =>
        tourDate.headliners.some((headliner) => {
          const artistName = getHeadlinerDisplayName(headliner);
          return artistName.toLowerCase().includes(query);
        })
      );

      if (hasHeadlinerMatch) {
        return true;
      }

      return tour.tourDates.some((tourDate) => {
        const venueName = tourDate.venue.name.toLowerCase();
        const city = tourDate.venue.city?.toLowerCase() || '';
        const state = tourDate.venue.state?.toLowerCase() || '';
        return venueName.includes(query) || city.includes(query) || state.includes(query);
      });
    });
  }, [tours, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 sm:max-w-md">
          <TourSearch value={searchQuery} onChange={setSearchQuery} />
        </div>
        {searchQuery && (
          <div className="text-sm text-muted-foreground">
            {filteredTours.length === 1 ? '1 tour found' : `${filteredTours.length} tours found`}
          </div>
        )}
      </div>

      {/* Tour List */}
      {filteredTours.length === 0 && searchQuery ? (
        <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-muted-foreground">No tours found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try adjusting your search or clear filters to see all tours.
            </p>
          </div>
        </div>
      ) : (
        <TourList tours={filteredTours} />
      )}
    </div>
  );
};
