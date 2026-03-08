/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import VenueSelect from '@/app/admin/tours/components/venue-select';
import { TextField } from '@/app/components/forms/fields';
import ArtistMultiSelect from '@/app/components/forms/fields/artist-multi-select';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { createTourDateAction, updateTourDateAction } from '@/lib/actions/tour-date-actions';
import type { FormState } from '@/lib/types/form-state';
import { tourDateCreateSchema } from '@/lib/validations/tours/tour-date-schema';

import type { TourDate } from '@prisma/client';

interface TourDateFormProps {
  tourId: string;
  tourDate?: TourDate & {
    headliners: Array<{ artistId: string | null }>;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

export default function TourDateForm({
  tourId,
  tourDate,
  open,
  onOpenChange,
  onSuccess,
}: TourDateFormProps) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isPending, setIsPending] = useState(false);
  const isEditMode = !!tourDate;

  const form = useForm({
    resolver: zodResolver(tourDateCreateSchema),
    defaultValues: {
      tourId,
      startDate: '',
      endDate: '',
      showStartTime: '',
      showEndTime: '',
      venueId: '',
      ticketsUrl: '',
      ticketPrices: '',
      notes: '',
      headlinerIds: [],
    },
  });

  const { control, handleSubmit, reset } = form;

  // Load tour date data in edit mode
  useEffect(() => {
    if (tourDate) {
      const formatDateTime = (date: string | Date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
      };

      const formatDate = (date: string | Date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0]; // YYYY-MM-DD
      };

      reset({
        tourId,
        startDate: formatDate(tourDate.startDate),
        endDate: tourDate.endDate ? formatDate(tourDate.endDate) : '',
        showStartTime: formatDateTime(tourDate.showStartTime),
        showEndTime: tourDate.showEndTime ? formatDateTime(tourDate.showEndTime) : '',
        venueId: tourDate.venueId || '',
        ticketsUrl: tourDate.ticketsUrl || '',
        ticketPrices: tourDate.ticketPrices || '',
        notes: tourDate.notes || '',
        headlinerIds:
          tourDate.headliners?.map((h) => h.artistId).filter((id): id is string => id !== null) ||
          [],
      });
    } else {
      // Reset form for new tour date
      reset({
        tourId,
        startDate: '',
        endDate: '',
        showStartTime: '',
        showEndTime: '',
        venueId: '',
        ticketsUrl: '',
        ticketPrices: '',
        notes: '',
        headlinerIds: [],
      });
    }
  }, [tourDate, tourId, reset]);

  const onSubmit = async (data: Record<string, unknown>) => {
    setIsPending(true);
    try {
      const formData = new FormData();

      // Add all form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (key === 'headlinerIds' && Array.isArray(value)) {
            // Encode array as JSON string for FormData
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });

      let result: FormState;
      if (isEditMode && tourDate?.id) {
        result = await updateTourDateAction(tourDate.id, formState, formData);
      } else {
        result = await createTourDateAction(formState, formData);
      }

      setFormState(result);

      if (result.success) {
        toast.success(
          isEditMode ? 'Tour date updated successfully' : 'Tour date created successfully'
        );
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
      } else if (result.errors) {
        toast.error('Please fix the form errors');
      }
    } catch (err) {
      console.error('Form submission error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-150">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Tour Date' : 'Add Tour Date'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the details for this show date.'
              : 'Add a new show date for this tour.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Venue Section */}
            <section className="space-y-4">
              <h4 className="text-sm font-semibold">Venue</h4>
              <VenueSelect
                control={control}
                name="venueId"
                label="Venue"
                placeholder="Select a venue"
                description="Choose an existing venue or create a new one"
              />
            </section>

            <Separator />

            {/* Artists Section */}
            <section className="space-y-4">
              <h4 className="text-sm font-semibold">Headliners</h4>
              <ArtistMultiSelect
                control={control}
                name="headlinerIds"
                label="Headlining Artists"
                placeholder="Select artists"
              />
            </section>

            <Separator />

            {/* Dates and Times Section */}
            <section className="space-y-4">
              <h4 className="text-sm font-semibold">Dates and Times</h4>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={String(field.value || '')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={String(field.value || '')} />
                      </FormControl>
                      <FormDescription>Leave blank if single-day event</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={control}
                  name="showStartTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show Start Time *</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} value={String(field.value || '')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="showEndTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show End Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} value={String(field.value || '')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator />

            {/* Ticketing Section */}
            <section className="space-y-4">
              <h4 className="text-sm font-semibold">Ticketing</h4>

              <TextField
                control={control}
                name="ticketsUrl"
                label="Tickets URL"
                placeholder="https://example.com/tickets"
                type="text"
              />

              <TextField
                control={control}
                name="ticketPrices"
                label="Ticket Price"
                placeholder="$25 - $100"
              />
            </section>

            <Separator />

            {/* Notes Section */}
            <section className="space-y-4">
              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ''}
                        placeholder="Optional notes about this show"
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional notes specific to this show (e.g., special guests, venue details)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : isEditMode ? 'Update' : 'Add Tour Date'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
