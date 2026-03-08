/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { Calendar, MapPin, Music, Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
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
import { deleteTourDateAction } from '@/lib/actions/tour-date-actions';

import type { Artist, Group, TourDate, TourDateHeadliner, Venue } from '@prisma/client';

// Full tour date type with relations
type TourDateWithRelations = TourDate & {
  venue: Venue;
  headliners: Array<
    TourDateHeadliner & {
      artist: Artist | null;
      group: Group | null;
    }
  >;
};

interface TourDateListProps {
  tourId: string;
}

export default function TourDateList({ tourId }: TourDateListProps) {
  const [tourDates, setTourDates] = useState<TourDateWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTourDate, setSelectedTourDate] = useState<TourDateWithRelations | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [tourDateToDelete, setTourDateToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTourDates = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/tours/${tourId}/dates`);
      if (res.ok) {
        const { tourDates: dates } = await res.json();
        setTourDates(dates || []);
      } else {
        toast.error('Failed to load tour dates');
      }
    } catch (err) {
      console.error('Error fetching tour dates:', err);
      toast.error('Failed to load tour dates');
    } finally {
      setIsLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    fetchTourDates();
  }, [fetchTourDates]);

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
        await fetchTourDates();
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
    await fetchTourDates();
    setIsFormOpen(false);
    setSelectedTourDate(null);
  };

  const getArtistDisplayName = (
    headliner: TourDateHeadliner & { artist: Artist | null; group: Group | null }
  ) => {
    if (headliner.artist) {
      return (
        headliner.artist.displayName || `${headliner.artist.firstName} ${headliner.artist.surname}`
      );
    }
    if (headliner.group) {
      return headliner.group.name;
    }
    return 'Unknown Artist';
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
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Tour Dates</h3>
            <p className="text-sm text-muted-foreground">
              Manage individual show dates for this tour
            </p>
          </div>
          <Button onClick={handleAddClick} size="sm">
            <Plus className="mr-2 size-4" />
            Add Date
          </Button>
        </div>

        {tourDates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="mb-4 size-12 text-muted-foreground" />
              <h4 className="mb-2 text-lg font-medium">No tour dates yet</h4>
              <p className="mb-4 text-sm text-muted-foreground">
                Get started by adding your first show date
              </p>
              <Button onClick={handleAddClick} variant="outline">
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
                        <Calendar className="size-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(new Date(tourDate.startDate), 'PPP')}
                          {tourDate.endDate && ` - ${format(new Date(tourDate.endDate), 'PPP')}`}
                        </span>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-muted-foreground">
                          {format(new Date(tourDate.showStartTime), 'p')}
                          {tourDate.showEndTime &&
                            ` - ${format(new Date(tourDate.showEndTime), 'p')}`}
                        </span>
                      </div>

                      {/* Venue */}
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="size-4 text-muted-foreground" />
                        <span>
                          {tourDate.venue.name}
                          {tourDate.venue.city && `, ${tourDate.venue.city}`}
                          {tourDate.venue.state && `, ${tourDate.venue.state}`}
                        </span>
                      </div>

                      {/* Headliners */}
                      <div className="flex items-center gap-2 text-sm">
                        <Music className="size-4 text-muted-foreground" />
                        <span>
                          {tourDate.headliners.length > 0
                            ? tourDate.headliners.map(getArtistDisplayName).join(', ')
                            : 'No headliners'}
                        </span>
                      </div>

                      {/* Tickets */}
                      {tourDate.ticketsUrl && (
                        <div className="flex items-center gap-2 text-sm">
                          <Ticket className="size-4 text-muted-foreground" />
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
                              <span className="text-muted-foreground">{tourDate.ticketPrices}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {tourDate.notes && (
                        <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                          <p className="text-muted-foreground">{tourDate.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditClick(tourDate)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
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
