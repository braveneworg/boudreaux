/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';
import Link from 'next/link';

import { Calendar, MapPin, Music, Ticket } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/app/components/ui/card';
import { GetTicketsLink } from '@/app/components/ui/get-tickets-link';
import { Separator } from '@/app/components/ui/separator';
import { VenueDirectionsLink } from '@/app/components/ui/venue-directions-link';
import type {
  ArtistScalars as Artist,
  TourDateHeadlinerScalars as TourDateHeadliner,
  TourDateScalars as TourDate,
  TourImageScalars as TourImage,
  TourScalars as Tour,
  VenueScalars as Venue,
} from '@/lib/types/tours';
import { formatTourTime } from '@/lib/utils/timezone';

import {
  getDateRange,
  getHeadlinerNames,
  getPrimaryImage,
  getSortedTourDates,
  getTicketInfo,
  getVenueInfo,
} from './tour-card-helpers';

export interface TourCardProps {
  tour: Tour & {
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
  };
}

type EnrichedTourDate = TourCardProps['tour']['tourDates'][number];

interface TourCardVenueProps {
  venueDisplay: string;
  singleVenue: Venue | null;
}

/** The venue line: a directions link + city/state for a single venue, or static text. */
const TourCardVenue = ({ venueDisplay, singleVenue }: TourCardVenueProps) => {
  if (!venueDisplay) {
    return null;
  }
  return (
    <div className="flex items-start gap-2">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950" />
      {singleVenue ? (
        <>
          <VenueDirectionsLink
            destination={[
              singleVenue.name,
              singleVenue.address,
              singleVenue.city,
              singleVenue.state,
              singleVenue.postalCode,
              singleVenue.country,
            ]
              .filter(Boolean)
              .join(', ')}
            className="group/venue text-sm"
          >
            <span className="underline">{venueDisplay}</span>
            <span className="sr-only">Get directions to {venueDisplay}</span>{' '}
            <span>&middot;</span>{' '}
          </VenueDirectionsLink>
          <span className="text-sm text-zinc-950">
            {singleVenue.city}, {singleVenue.state}
          </span>
        </>
      ) : (
        <span className="line-clamp-1 text-sm">{venueDisplay}</span>
      )}
    </div>
  );
};

interface TourCardDateTimeProps {
  dateRange: string;
  hasTourDates: boolean;
  firstTourDate: EnrichedTourDate | undefined;
  sortedTourDates: EnrichedTourDate[];
}

/** Builds the show-time line for a single date (with optional end time) or an "N shows" summary. */
const formatShowTimeLine = (
  firstTourDate: EnrichedTourDate,
  sortedTourDates: EnrichedTourDate[]
): string => {
  if (sortedTourDates.length !== 1 || !firstTourDate.showStartTime) {
    return `${sortedTourDates.length} shows`;
  }
  const start = formatTourTime(firstTourDate.showStartTime, firstTourDate.timeZone);
  if (!firstTourDate.showEndTime) {
    return start;
  }
  return `${start} - ${formatTourTime(firstTourDate.showEndTime, firstTourDate.timeZone)}`;
};

/** The date + time block: announced date range, show time(s), and doors-open time. */
const TourCardDateTime = ({
  dateRange,
  hasTourDates,
  firstTourDate,
  sortedTourDates,
}: TourCardDateTimeProps) => (
  <div className="flex items-start gap-2">
    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950" />
    <div className="text-sm">
      <div>{dateRange}</div>
      {hasTourDates && firstTourDate?.showStartTime && (
        <>
          <div className="text-zinc-950">{formatShowTimeLine(firstTourDate, sortedTourDates)}</div>
          {sortedTourDates.length === 1 && firstTourDate?.doorsOpenAt && (
            <div>
              <strong style={{ fontWeight: 400 }}>Doors:</strong>{' '}
              {formatTourTime(firstTourDate.doorsOpenAt, firstTourDate.timeZone)}
            </div>
          )}
        </>
      )}
    </div>
  </div>
);

/** The ticket-price line, shown only when the first date has prices. */
const TourCardTicketPrice = ({
  firstTourDate,
}: {
  firstTourDate: EnrichedTourDate | undefined;
}) => {
  if (!firstTourDate?.ticketPrices) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <Ticket className="h-4 w-4 shrink-0 text-zinc-950" />
      <span className="text-sm font-medium">{firstTourDate.ticketPrices}</span>
    </div>
  );
};

/**
 * Tour card component displaying tour summary with image, venue, dates, and headliners
 */
export const TourCard = ({ tour }: TourCardProps) => {
  const primaryImage = getPrimaryImage(tour.images);
  const hasTourDates = tour.tourDates.length > 0;

  const sortedTourDates = getSortedTourDates(tour.tourDates);
  const firstTourDate = sortedTourDates[0];
  const lastTourDate = sortedTourDates[sortedTourDates.length - 1];

  const dateRange = getDateRange(firstTourDate, lastTourDate);
  const { singleVenue, venueDisplay } = getVenueInfo(sortedTourDates);
  const headlinerNames = getHeadlinerNames(sortedTourDates);
  const { primaryTicketUrl, primaryTicketDate } = getTicketInfo(sortedTourDates);

  return (
    <Card
      className="group overflow-hidden transition-shadow hover:shadow-lg"
      data-testid="tour-card"
    >
      {/* Tour Image */}
      {primaryImage && (
        <Link href={`/tours/${tour.id}`} className="block">
          <div className="bg-muted relative aspect-video w-full overflow-hidden">
            <Image
              src={primaryImage.s3Url}
              alt={primaryImage.altText || tour.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </div>
        </Link>
      )}

      <CardHeader>
        <CardTitle className="mt-4 line-clamp-2">
          <Link
            href={`/tours/${tour.id}`}
            className="hover:text-primary block pt-4 transition-colors"
          >
            {tour.title}
          </Link>
        </CardTitle>
        {tour.subtitle && <p className="line-clamp-1 text-sm text-zinc-950">{tour.subtitle}</p>}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Headliners */}
        {headlinerNames && (
          <div className="flex items-start gap-2">
            <Music className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950" />
            <span className="line-clamp-2 text-sm">{headlinerNames}</span>
          </div>
        )}

        {/* Venue */}
        <TourCardVenue venueDisplay={venueDisplay} singleVenue={singleVenue} />

        {/* Date & Time */}
        <TourCardDateTime
          dateRange={dateRange}
          hasTourDates={hasTourDates}
          firstTourDate={firstTourDate}
          sortedTourDates={sortedTourDates}
        />

        {/* Ticket Price */}
        <TourCardTicketPrice firstTourDate={firstTourDate} />
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button asChild variant="default" className="flex-1">
          <Link href={`/tours/${tour.id}`}>View Details</Link>
        </Button>
        {primaryTicketUrl && (
          <GetTicketsLink
            ticketsUrl={primaryTicketUrl}
            ticketIconUrl={primaryTicketDate?.ticketIconUrl}
            variant="outline"
            className="flex-1 py-0"
          />
        )}
      </CardFooter>
      <Separator className="my-4 !opacity-100" />
    </Card>
  );
};
