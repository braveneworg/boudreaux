/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';
import Link from 'next/link';

import { ArrowLeft, Calendar, MapPin, Music, Ticket } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { GetTicketsLink } from '@/app/components/ui/get-tickets-link';
import { Separator } from '@/app/components/ui/separator';
import { VenueDirectionsLink } from '@/app/components/ui/venue-directions-link';
import { getArtistDisplayNameForTour } from '@/lib/utils/artist-display-name';
import { formatTourDate, formatTourTime } from '@/lib/utils/timezone';

import type { Artist, Tour, TourDate, TourDateHeadliner, TourImage, Venue } from '@prisma/client';

export interface TourDetailProps {
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

/**
 * Tour detail component displaying complete tour information including all images
 * Server Component - shows full tour details for individual tour page
 */
export const TourDetail = ({ tour }: TourDetailProps) => {
  // Sort images by displayOrder
  const sortedImages = [...tour.images].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedTourDates = [...tour.tourDates].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const lastTourDate = sortedTourDates[sortedTourDates.length - 1];
  const isPastTour = lastTourDate ? new Date(lastTourDate.startDate) < new Date() : false;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/tours">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tours
          </Link>
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Tour Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="space-y-2">
                {isPastTour && (
                  <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-zinc-950-foreground">
                    Past Event
                  </span>
                )}
                <CardTitle className="text-3xl">{tour.title}</CardTitle>
                {/* Hero Image */}
                {sortedImages.length > 0 && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                    <Image
                      src={sortedImages[0].s3Url}
                      alt={sortedImages[0].altText || tour.title}
                      fill
                      className="object-cover"
                      priority
                      sizes="(max-width: 1200px) 100vw, 1200px"
                    />
                  </div>
                )}
                {tour.subtitle && (
                  <p className="text-xl text-zinc-950-foreground">{tour.subtitle}</p>
                )}
                {tour.subtitle2 && (
                  <p className="text-lg text-zinc-950-foreground">{tour.subtitle2}</p>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Description */}
              {tour.description && (
                <>
                  <div>
                    <h3 className="mb-2 text-lg font-semibold">About</h3>
                    <p className="whitespace-pre-wrap text-zinc-950-foreground">
                      {tour.description}
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Additional Images */}
              {sortedImages.length > 1 && (
                <>
                  <div>
                    <h3 className="mb-4 text-lg font-semibold">Gallery</h3>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {sortedImages.slice(1).map((image) => (
                        <div
                          key={image.id}
                          className="relative aspect-video overflow-hidden rounded-lg bg-muted"
                        >
                          <Image
                            src={image.s3Url}
                            alt={image.altText || tour.title}
                            fill
                            className="object-cover transition-transform hover:scale-105"
                            sizes="(max-width: 768px) 50vw, 33vw"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Tour Dates */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tour Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedTourDates.length === 0 ? (
                <p className="text-sm text-zinc-950-foreground">No tour dates announced yet.</p>
              ) : (
                sortedTourDates.map((tourDate, index) => {
                  const headlinerNames = tourDate.headliners
                    .sort((a, b) => b.sortOrder - a.sortOrder)
                    .map((headliner) => getArtistDisplayNameForTour(headliner.artist))
                    .filter((name): name is string => name !== null);

                  return (
                    <div key={tourDate.id} className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-sm">
                          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950-foreground" />
                          <div>
                            <div className="font-medium">
                              {formatTourDate(tourDate.startDate, tourDate.timeZone, {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                              {tourDate.endDate &&
                              new Date(tourDate.endDate).toISOString() !==
                                new Date(tourDate.startDate).toISOString()
                                ? ` - ${formatTourDate(tourDate.endDate, tourDate.timeZone)}`
                                : ''}
                            </div>
                            <div className="text-zinc-950-foreground">
                              {formatTourTime(tourDate.showStartTime, tourDate.timeZone)}
                              {tourDate.showEndTime
                                ? ` - ${formatTourTime(tourDate.showEndTime, tourDate.timeZone)}`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-sm">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950-foreground" />
                          <VenueDirectionsLink
                            destination={[
                              tourDate.venue.name,
                              tourDate.venue.address,
                              tourDate.venue.city,
                              tourDate.venue.state,
                              tourDate.venue.postalCode,
                              tourDate.venue.country,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                            className="group"
                          >
                            <div className="font-medium group-hover:underline">
                              {tourDate.venue.name}
                            </div>
                            <div className="text-zinc-950-foreground group-hover:underline">
                              {[tourDate.venue.city, tourDate.venue.state]
                                .filter(Boolean)
                                .join(', ')}
                            </div>
                          </VenueDirectionsLink>
                        </div>

                        {headlinerNames.length > 0 && (
                          <div className="flex items-start gap-2 text-sm">
                            <Music className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950-foreground" />
                            <span>{headlinerNames.join(', ')}</span>
                          </div>
                        )}

                        {(tourDate.ticketPrices || tourDate.ticketsUrl) && (
                          <div className="flex items-start gap-2 text-sm">
                            <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-zinc-950-foreground" />
                            <div className="space-y-2">
                              {tourDate.ticketPrices && <div>{tourDate.ticketPrices}</div>}
                              {tourDate.ticketsUrl && (
                                <GetTicketsLink
                                  ticketsUrl={tourDate.ticketsUrl}
                                  ticketIconUrl={tourDate.ticketIconUrl}
                                  size="sm"
                                  showExternalIcon
                                  className="py-0"
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {index < sortedTourDates.length - 1 && <Separator />}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
