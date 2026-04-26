/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { Calendar, MapPin, Music, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import TourDateForm from '@/app/admin/tours/components/tour-date-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { Skeleton } from '@/app/components/ui/skeleton';
import { TicketProviderIcon } from '@/app/components/ui/ticket-provider-icon';
import { useTourDatesQuery } from '@/app/hooks/use-tour-dates-query';
import { deleteTourDateAction } from '@/lib/actions/tour-date-actions';
import { formatTourDate, formatTourTime } from '@/lib/utils/timezone';

import ArtistPillList from './artist-pill-list';

import type { HeadlinerWithRelations } from './artist-pill';

/**
 * Local interfaces matching Prisma model shapes.
 * Client components should not import directly from @prisma/client.
 */
interface VenueFields {
  id: string;
  name: string;
  address: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  capacity: number | null;
  notes: string | null;
  timeZone: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

interface TourDateFields {
  id: string;
  tourId: string;
  startDate: Date;
  endDate: Date | null;
  showStartTime: Date;
  showEndTime: Date | null;
  doorsOpenAt: Date | null;
  venueId: string;
  timeZone: string | null;
  utcOffset: number | null;
  ticketsUrl: string | null;
  ticketIconUrl: string | null;
  ticketPrices: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Full tour date type with relations
type TourDateWithRelations = TourDateFields & {
  venue: VenueFields;
  headliners: HeadlinerWithRelations[];
};

interface TourDateListProps {
  tourId: string;
  onDialogOpenChange?: (open: boolean) => void;
}

export default function TourDateList({ tourId, onDialogOpenChange }: TourDateListProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const { isPending: isLoading, data: tourDatesData, refetch } = useTourDatesQuery(tourId);
  const tourDates = (tourDatesData?.tourDates ?? []) as unknown as TourDateWithRelations[];
  const [selectedTourDate, setSelectedTourDate] = useState<TourDateWithRelations | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tourDateToDelete, setTourDateToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notify the parent component when the dialog open state changes
  // so it can disable its own submit button while the dialog is open.
  useEffect(() => {
    onDialogOpenChange?.(isFormOpen);
  }, [isFormOpen, onDialogOpenChange]);

  const handleAddClick = () => {
    setSelectedTourDate(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (tourDate: TourDateWithRelations) => {
    setSelectedTourDate(tourDate);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (tourDateId: string) => {
    setTourDateToDelete(tourDateId);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tourDateToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteTourDateAction(tourDateToDelete);
      if (result.success) {
        toast.success('Tour date deleted successfully');
        await refetch();
        setIsDeleteDialogOpen(false);
        setTourDateToDelete(null);
      } else {
        toast.error(result.error || 'Failed to delete tour date');
      }
    } catch (err) {
      console.error('Error deleting tour date:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFormSuccess = async () => {
    await refetch();
    setIsFormOpen(false);
    setSelectedTourDate(null);

    // Scroll the Tour Dates heading into view so the user can see the
    // list of dates just added/updated.
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tour Dates</h3>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section ref={sectionRef} className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Tour Dates</h3>
            <p className="text-sm text-zinc-950-foreground">
              Manage individual show dates for this tour
            </p>
          </div>
          {tourDates.length > 0 && (
            <Button type="button" onClick={handleAddClick} size="sm">
              <Plus className="mr-2 size-4" />
              Add Date
            </Button>
          )}
        </div>

        {tourDates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="mb-4 size-12 text-zinc-950-foreground" />
              <h4 className="mb-2 text-lg font-medium">No tour dates yet</h4>
              <p className="mb-4 text-sm text-zinc-950-foreground">
                Get started by adding your first show date
              </p>
              <Button type="button" onClick={handleAddClick} variant="outline">
                <Plus className="mr-2 size-4" />
                Add Tour Date
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tourDates.map((tourDate) => (
              <Card key={tourDate.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      {/* Date and Time */}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="size-4 text-zinc-950-foreground" />
                        <span className="font-medium">
                          {formatTourDate(tourDate.startDate, tourDate.timeZone)}
                          {tourDate.endDate &&
                            ` - ${formatTourDate(tourDate.endDate, tourDate.timeZone)}`}
                        </span>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-zinc-950-foreground">
                          {formatTourTime(tourDate.showStartTime, tourDate.timeZone, {
                            ...(tourDate.timeZone ? { timeZoneName: 'short' } : {}),
                          })}{' '}
                          &mdash;{' '}
                          {tourDate.showEndTime
                            ? formatTourTime(tourDate.showEndTime, tourDate.timeZone)
                            : '—'}
                        </span>
                      </div>

                      {/* Doors Open */}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="size-4 text-zinc-950-foreground" />
                        <span className="text-zinc-950-foreground">
                          Doors:{' '}
                          {tourDate.doorsOpenAt
                            ? formatTourTime(tourDate.doorsOpenAt, tourDate.timeZone)
                            : '—'}
                        </span>
                      </div>

                      {/* Venue */}
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="size-4 text-zinc-950-foreground" />
                        <span>
                          {tourDate.venue.name}
                          {tourDate.venue.city && `, ${tourDate.venue.city}`}
                          {tourDate.venue.state && `, ${tourDate.venue.state}`}
                        </span>
                      </div>

                      {/* Headliners */}
                      <div className="flex items-start gap-2 text-sm">
                        <Music className="mt-0.5 size-4 shrink-0 text-zinc-950-foreground" />
                        <ArtistPillList
                          tourDateId={tourDate.id}
                          headliners={tourDate.headliners}
                          onHeadlinersChange={async () => {
                            await refetch();
                          }}
                        />
                      </div>

                      {/* Tickets */}
                      {tourDate.ticketsUrl && (
                        <div className="flex items-center gap-2 text-sm">
                          <TicketProviderIcon
                            ticketsUrl={tourDate.ticketsUrl}
                            ticketIconUrl={tourDate.ticketIconUrl}
                            size={16}
                            className="shrink-0"
                          />
                          <a
                            href={tourDate.ticketsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Buy Tickets
                          </a>
                          {tourDate.ticketPrices && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <span className="text-zinc-950-foreground">
                                {tourDate.ticketPrices}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {tourDate.notes && (
                        <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                          <p className="text-zinc-950-foreground">{tourDate.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(tourDate)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(tourDate.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Tour Date Form Dialog */}
      <TourDateForm
        tourId={tourId}
        tourDate={selectedTourDate || undefined}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tour Date</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tour date? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
