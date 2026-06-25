/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  TourDateWithRelations as TourDate,
  TourImageScalars as TourImage,
  VenueScalars as Venue,
} from '@/lib/types/tours';
import { getArtistDisplayNameForTour } from '@/lib/utils/artist-display-name';
import { formatTourDate } from '@/lib/utils/timezone';

/** The primary image (displayOrder 0) for a tour, falling back to the first image. */
export const getPrimaryImage = (images: TourImage[]): TourImage | undefined =>
  images.find((img) => img.displayOrder === 0) || images[0];

/** Returns the tour dates ordered ascending by start date (does not mutate input). */
export const getSortedTourDates = (tourDates: TourDate[]): TourDate[] =>
  [...tourDates].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

/** Formats the announced date range (single date, range, or "No dates announced"). */
export const getDateRange = (
  firstTourDate: TourDate | undefined,
  lastTourDate: TourDate | undefined
): string => {
  if (!firstTourDate) {
    return 'No dates announced';
  }
  if (!lastTourDate || firstTourDate.id === lastTourDate.id) {
    return formatTourDate(firstTourDate.startDate, firstTourDate.timeZone);
  }
  return `${formatTourDate(firstTourDate.startDate, firstTourDate.timeZone)} - ${formatTourDate(lastTourDate.startDate, lastTourDate.timeZone)}`;
};

/** The single venue (when all dates share one) plus the display label for the venue line. */
export interface VenueInfo {
  singleVenue: Venue | null;
  venueDisplay: string;
}

/** Derives the venue summary: one venue, "N venues", or empty when none. */
export const getVenueInfo = (sortedTourDates: TourDate[]): VenueInfo => {
  const venueNames = Array.from(new Set(sortedTourDates.map((date) => date.venue.name)));
  const isSingleVenue = venueNames.length === 1;
  const singleVenue = isSingleVenue ? sortedTourDates[0].venue : null;
  if (venueNames.length === 0) {
    return { singleVenue, venueDisplay: '' };
  }
  return {
    singleVenue,
    venueDisplay: isSingleVenue ? venueNames[0] : `${venueNames.length} venues`,
  };
};

/** Compares two headliners by set time (latest first), then descending sort order. */
const compareHeadlinersBySetTime = (
  a: TourDate['headliners'][number],
  b: TourDate['headliners'][number]
): number => {
  const aTime = a.setTime ? new Date(a.setTime).getTime() : null;
  const bTime = b.setTime ? new Date(b.setTime).getTime() : null;
  if (aTime !== null && bTime !== null) return bTime - aTime;
  if (aTime !== null) return -1;
  if (bTime !== null) return 1;
  return b.sortOrder - a.sortOrder;
};

/** Unique, ordered headliner display names across all tour dates. */
export const getUniqueHeadliners = (sortedTourDates: TourDate[]): string[] => {
  const seen = new Set<string>();
  return sortedTourDates
    .flatMap((date) => date.headliners)
    .sort(compareHeadlinersBySetTime)
    .map((h) => getArtistDisplayNameForTour(h.artist))
    .filter((name): name is string => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
};

/** The comma-joined headliner names, or "TBD" when there are none. */
export const getHeadlinerNames = (sortedTourDates: TourDate[]): string => {
  const uniqueHeadliners = getUniqueHeadliners(sortedTourDates);
  return uniqueHeadliners.length === 0 ? 'TBD' : uniqueHeadliners.join(', ');
};

/** The first ticket URL plus the tour date it belongs to (for its ticket icon). */
export interface TicketInfo {
  primaryTicketUrl: string | undefined;
  primaryTicketDate: TourDate | undefined;
}

/** Derives the primary ticket link and the date that owns it. */
export const getTicketInfo = (sortedTourDates: TourDate[]): TicketInfo => {
  const ticketLinks = Array.from(
    new Set(
      sortedTourDates.map((date) => date.ticketsUrl).filter((url): url is string => Boolean(url))
    )
  );
  const primaryTicketUrl = ticketLinks[0];
  const primaryTicketDate = primaryTicketUrl
    ? sortedTourDates.find((date) => date.ticketsUrl === primaryTicketUrl)
    : undefined;
  return { primaryTicketUrl, primaryTicketDate };
};
