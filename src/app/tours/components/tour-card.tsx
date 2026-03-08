/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';
import Link from 'next/link';

import { Calendar, MapPin, Music, Ticket } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/app/components/ui/card';

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

  // Format dates
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

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
      ? formatDate(firstTourDate.startDate)
      : `${formatDate(firstTourDate.startDate)} - ${formatDate(lastTourDate.startDate)}`;

  const venueNames = Array.from(new Set(sortedTourDates.map((date) => date.venue.name)));
  const venueDisplay =
    venueNames.length === 0
      ? ''
      : venueNames.length === 1
        ? venueNames[0]
        : `${venueNames.length} venues`;

  const uniqueHeadliners = Array.from(
    new Set(
      sortedTourDates
        .flatMap((date) => date.headliners)
        .map((headliner) => getArtistDisplayName(headliner))
        .filter(Boolean)
    )
  );

  const headlinerNames =
    uniqueHeadliners.length === 0
      ? ''
      : uniqueHeadliners.length > 3
        ? `${uniqueHeadliners.slice(0, 3).join(', ')} +${uniqueHeadliners.length - 3} more`
        : uniqueHeadliners.join(', ');

  const ticketLinks = Array.from(
    new Set(
      sortedTourDates.map((date) => date.ticketsUrl).filter((url): url is string => Boolean(url))
    )
  );
  const primaryTicketUrl = ticketLinks[0];

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
        <CardTitle className="line-clamp-2">
          <Link href={`/tours/${tour.id}`} className="hover:text-primary transition-colors">
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
            <span className="text-sm line-clamp-1">{venueDisplay}</span>
          </div>
        )}

        {/* Date & Time */}
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div>{dateRange}</div>
            {hasTourDates && firstTourDate?.showStartTime && (
              <div className="text-muted-foreground">
                {sortedTourDates.length === 1
                  ? `${formatTime(firstTourDate.showStartTime)}${firstTourDate.showEndTime ? ` - ${formatTime(firstTourDate.showEndTime)}` : ''}`
                  : `${sortedTourDates.length} shows`}
              </div>
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
          <Button asChild variant="outline" className="flex-1">
            <a href={primaryTicketUrl} target="_blank" rel="noopener noreferrer">
              Get Tickets
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
