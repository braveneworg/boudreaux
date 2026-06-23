/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { CalendarDays, Plus } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { SectionHeader } from '@/app/components/ui/section-header';
import { TourService, type TourWithDisplayNames } from '@/lib/services/tours/tour-service';

export const dynamic = 'force-dynamic';

/**
 * Display type for tour list items.
 * Extends TourWithDisplayNames with optional tourDates for display purposes.
 */
interface TourListItem extends TourWithDisplayNames {
  tourDates?: Array<{
    startDate: Date;
    venue?: {
      name: string;
      city?: string | null;
      state?: string | null;
    } | null;
  }>;
}

export default async function ToursPage() {
  let tours: TourListItem[] = [];
  let fetchError: string | null = null;

  try {
    const result = await TourService.findAll();
    tours = result.data;
  } catch (err) {
    console.error('Failed to fetch tours:', err);
    fetchError = 'Failed to load tours. Please try again later.';
  }

  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Tours', url: '/admin/tours', isActive: true },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          icon={CalendarDays}
          title="Tours"
          helpText="Manage tours and their dates, venues, and headlining artists. Open a tour to add or edit its dates."
        />
        <Button asChild>
          <Link href="/admin/tours/new">
            <Plus className="mr-2 h-4 w-4" />
            New Tour
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {fetchError ? (
          <Card>
            <CardContent className="text-destructive py-8 text-center">{fetchError}</CardContent>
          </Card>
        ) : tours.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-zinc-950">
              No tours found. Create your first tour to get started.
            </CardContent>
          </Card>
        ) : (
          tours.map((tour) => {
            const firstTourDate = tour.tourDates?.[0];
            const venue = firstTourDate?.venue;

            return (
              <Card key={tour.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        <Link href={`/admin/tours/${tour.id}`} className="hover:underline">
                          {tour.title}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {firstTourDate
                          ? new Date(firstTourDate.startDate).toLocaleDateString()
                          : 'No dates yet'}
                        {' · '}
                        {venue?.name ?? 'Venue TBD'}
                        {venue?.city && venue?.state ? ` · ${venue.city}, ${venue.state}` : ''}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/tours/${tour.id}`}>Edit</Link>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
