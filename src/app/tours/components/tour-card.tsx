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
import { formatTourDate, formatTourTime } from '@/lib/utils/timezone';

import type {
  Artist,
  Group,
  Tour,
  TourDate,
  TourDateHeadliner,
  TourImage,
  Venue,
} from '@prisma/client';

export interface TourCardProps {
  tour: Tour & {
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
  };
}

/**
 * Tour card component displaying tour summary with image, venue, dates, and headliners
 */
export const TourCard = ({ tour }: TourCardProps) => {
  const primaryImage = tour.images.find((img) => img.displayOrder === 0) || tour.images[0];
  const hasTourDates = tour.tourDates.length > 0;

  const getArtistDisplayName = (headliner: {
    artist: (Artist & { groups: Array<{ group: Group }> }) | null;
    group: Group | null;
  }) => {
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

  const sortedTourDates = [...tour.tourDates].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  const firstTourDate = sortedTourDates[0];
  const lastTourDate = sortedTourDates[sortedTourDates.length - 1];

  const dateRange = !firstTourDate
    ? 'No dates announced'
    : !lastTourDate || firstTourDate.id === lastTourDate.id
      ? formatTourDate(firstTourDate.startDate, firstTourDate.timeZone)
      : `${formatTourDate(firstTourDate.startDate, firstTourDate.timeZone)} - ${formatTourDate(lastTourDate.startDate, lastTourDate.timeZone)}`;

  const venueNames = Array.from(new Set(sortedTourDates.map((date) => date.venue.name)));
  const isSingleVenue = venueNames.length === 1;
  const singleVenue = isSingleVenue ? sortedTourDates[0].venue : null;
  const venueDisplay =
    venueNames.length === 0 ? '' : isSingleVenue ? venueNames[0] : `${venueNames.length} venues`;

  const uniqueHeadliners = (() => {
    const seen = new Set<string>();
    return sortedTourDates
      .flatMap((date) => date.headliners)
      .sort((a, b) => {
        const aTime = a.setTime ? new Date(a.setTime).getTime() : null;
        const bTime = b.setTime ? new Date(b.setTime).getTime() : null;
        if (aTime !== null && bTime !== null) return bTime - aTime;
        if (aTime !== null) return -1;
        if (bTime !== null) return 1;
        return b.sortOrder - a.sortOrder;
      })
      .map((h) => getArtistDisplayName(h))
      .filter((name): name is string => {
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  })();

  const headlinerNames = uniqueHeadliners.length === 0 ? 'TBD' : uniqueHeadliners.join(', ');

  const ticketLinks = Array.from(
    new Set(
      sortedTourDates.map((date) => date.ticketsUrl).filter((url): url is string => Boolean(url))
    )
  );
  const primaryTicketUrl = ticketLinks[0];
  const primaryTicketDate = primaryTicketUrl
    ? sortedTourDates.find((date) => date.ticketsUrl === primaryTicketUrl)
    : undefined;

  return (
    <Card
      className="group overflow-hidden transition-shadow hover:shadow-lg"
      data-testid="tour-card"
    >
      {/* Tour Image */}
      {primaryImage && (
        <Link href={`/tours/${tour.id}`} className="block">
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
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
        <CardTitle className="line-clamp-2 mt-4">
          <Link
            href={`/tours/${tour.id}`}
            className="hover:text-primary transition-colors block pt-4"
          >
            {tour.title}
          </Link>
        </CardTitle>
        {tour.subtitle && (
          <p className="text-sm text-muted-foreground line-clamp-1">{tour.subtitle}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Headliners */}
        {headlinerNames && (
          <div className="flex items-start gap-2">
            <Music className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm line-clamp-2">{headlinerNames}</span>
          </div>
        )}

        {/* Venue */}
        {venueDisplay && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                <span className="text-sm text-muted-foreground">
                  {singleVenue.city}, {singleVenue.state}
                </span>
              </>
            ) : (
              <span className="text-sm line-clamp-1">{venueDisplay}</span>
            )}
          </div>
        )}

        {/* Date & Time */}
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div>{dateRange}</div>
            {hasTourDates && firstTourDate?.showStartTime && (
              <>
                <div className="text-muted-foreground">
                  {sortedTourDates.length === 1
                    ? `${formatTourTime(firstTourDate.showStartTime, firstTourDate.timeZone)}${firstTourDate.showEndTime ? ` - ${formatTourTime(firstTourDate.showEndTime, firstTourDate.timeZone)}` : ''}`
                    : `${sortedTourDates.length} shows`}
                </div>
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

        {/* Ticket Price */}
        {firstTourDate?.ticketPrices && (
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">{firstTourDate.ticketPrices}</span>
          </div>
        )}
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
