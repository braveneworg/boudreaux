/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TourDateImageUpload } from '@/app/admin/tours/components/tour-date-image-upload';
import VenueSelect from '@/app/admin/tours/components/venue-select';
import { TextField } from '@/app/components/forms/fields';
import ArtistMultiSelect from '@/app/components/forms/fields/artist-multi-select';
import { Button } from '@/app/components/ui/button';
import { DatePicker } from '@/app/components/ui/datepicker';
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
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { TimePicker } from '@/app/components/ui/timepicker';
import { createTourDateAction, updateTourDateAction } from '@/lib/actions/tour-date-actions';
import type { FormState } from '@/lib/types/form-state';
import {
  tourDateCreateSchema,
  tourDateUpdateSchema,
} from '@/lib/validations/tours/tour-date-schema';

import type { TourDate, TourDateImage } from '@prisma/client';

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
  const [tourDateImages, setTourDateImages] = useState<TourDateImage[]>([]);
  const isEditMode = !!tourDate;

  const form = useForm({
    resolver: zodResolver(isEditMode ? tourDateUpdateSchema : tourDateCreateSchema),
    defaultValues: {
      tourId,
      startDate: '',
      endDate: '',
      showStartTime: '',
      showEndTime: '',
      doorsOpenAt: '',
      venueId: '',
      ticketsUrl: '',
      ticketIconUrl: '',
      ticketPrices: '',
      notes: '',
      headlinerIds: [],
    },
  });

  const { control, handleSubmit, reset, setError } = form;

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
        doorsOpenAt: tourDate.doorsOpenAt ? formatDateTime(tourDate.doorsOpenAt) : '',
        venueId: tourDate.venueId || '',
        ticketsUrl: tourDate.ticketsUrl || '',
        ticketIconUrl: tourDate.ticketIconUrl || '',
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
        doorsOpenAt: '',
        venueId: '',
        ticketsUrl: '',
        ticketIconUrl: '',
        ticketPrices: '',
        notes: '',
        headlinerIds: [],
      });
    }
  }, [tourDate, tourId, reset]);

  // Fetch tour date images in edit mode
  const fetchTourDateImages = useCallback(async () => {
    if (!tourDate?.id) return;
    try {
      const response = await fetch(`/api/tours/${tourId}/dates/${tourDate.id}/images`);
      if (response.ok) {
        const data = await response.json();
        setTourDateImages(data.images ?? []);
      }
    } catch (error) {
      console.error('Failed to fetch tour date images:', error);
    }
  }, [tourId, tourDate?.id]);

  useEffect(() => {
    if (isEditMode && open) {
      fetchTourDateImages();
    }
  }, [isEditMode, open, fetchTourDateImages]);

  const handleImageUploadComplete = useCallback(() => {
    fetchTourDateImages();
  }, [fetchTourDateImages]);

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
          } else if (value instanceof Date) {
            // zodResolver coerces z.coerce.date() fields into Date objects.
            // Use ISO string so the server receives a stable, parseable format.
            formData.append(key, value.toISOString());
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
      } else {
        const errors = result.errors ?? {};
        const fieldErrors: string[] = [];
        for (const [field, messages] of Object.entries(errors)) {
          const msg = Array.isArray(messages) ? messages[0] : String(messages);
          if (!msg) continue;
          if (field === 'general') {
            // Not tied to a specific field — surface via toast
            toast.error(msg);
          } else {
            setError(field as 'tourId', { message: msg });
            fieldErrors.push(field);
          }
        }
        if (fieldErrors.length > 0) {
          toast.error('Please fix the form errors');
        } else if (!Object.keys(errors).includes('general')) {
          toast.error('An unexpected error occurred. Please try again.');
        }
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
          <form
            onSubmit={(e) => {
              // Stop the submit event from bubbling through React's synthetic event
              // tree to the parent tour form. Without this, the parent form receives
              // the propagated submit event and fires its own handleSubmit, causing
              // an unwanted tour update + redirect to /admin/tours.
              e.stopPropagation();
              handleSubmit(onSubmit)(e);
            }}
            className="space-y-6"
          >
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
                        <DatePicker
                          fieldName="startDate"
                          value={String(field.value || '')}
                          onSelect={(dateString) => {
                            if (!dateString) {
                              field.onChange('');
                            } else {
                              const d = new Date(dateString);
                              const dateStr = d.toISOString().split('T')[0];
                              field.onChange(dateStr);
                              // Auto-populate showStartTime to 8 PM if the user has
                              // not yet chosen a time — prevents a required-field
                              // validation error for users who skip the TimePicker.
                              const currentShowStartTime = form.getValues('showStartTime');
                              if (!currentShowStartTime) {
                                form.setValue('showStartTime', `${dateStr}T20:00`);
                              }
                            }
                          }}
                        />
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
                        <DatePicker
                          fieldName="endDate"
                          value={String(field.value || '')}
                          onSelect={(dateString) => {
                            if (!dateString) {
                              field.onChange('');
                            } else {
                              const d = new Date(dateString);
                              field.onChange(d.toISOString().split('T')[0]);
                            }
                          }}
                        />
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
                  render={({ field }) => {
                    // Extract HH:mm from stored YYYY-MM-DDTHH:mm for the picker
                    const raw = String(field.value || '');
                    const timeOnly = raw.includes('T') ? raw.split('T')[1]?.slice(0, 5) : '';
                    return (
                      <FormItem>
                        <FormLabel>Show Start Time *</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={timeOnly}
                            placeholder="Select start time"
                            onSelect={(time) => {
                              if (!time) {
                                field.onChange('');
                                return;
                              }
                              // Combine with startDate if available, else today
                              const startDate = form.getValues('startDate');
                              const datePrefix = startDate
                                ? String(startDate).slice(0, 10)
                                : new Date().toISOString().slice(0, 10);
                              field.onChange(`${datePrefix}T${time}`);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={control}
                  name="showEndTime"
                  render={({ field }) => {
                    const raw = String(field.value || '');
                    const timeOnly = raw.includes('T') ? raw.split('T')[1]?.slice(0, 5) : '';
                    return (
                      <FormItem>
                        <FormLabel>Show End Time</FormLabel>
                        <FormControl>
                          <TimePicker
                            value={timeOnly}
                            placeholder="Select end time"
                            onSelect={(time) => {
                              if (!time) {
                                field.onChange('');
                                return;
                              }
                              const startDate = form.getValues('startDate');
                              const datePrefix = startDate
                                ? String(startDate).slice(0, 10)
                                : new Date().toISOString().slice(0, 10);
                              field.onChange(`${datePrefix}T${time}`);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>

              <FormField
                control={control}
                name="doorsOpenAt"
                render={({ field }) => {
                  const raw = String(field.value || '');
                  const timeOnly = raw.includes('T') ? raw.split('T')[1]?.slice(0, 5) : '';
                  return (
                    <FormItem>
                      <FormLabel>Doors Open At</FormLabel>
                      <FormControl>
                        <TimePicker
                          value={timeOnly}
                          placeholder="Select doors open time"
                          onSelect={(time) => {
                            if (!time) {
                              field.onChange('');
                              return;
                            }
                            const startDate = form.getValues('startDate');
                            const datePrefix = startDate
                              ? String(startDate).slice(0, 10)
                              : new Date().toISOString().slice(0, 10);
                            field.onChange(`${datePrefix}T${time}`);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Time when doors open for entry (before the show starts)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
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

              <FormField
                control={control}
                name="ticketIconUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticket Icon URL</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        value={field.value || ''}
                        type="text"
                        placeholder="https://cdn.example.com/icons/provider-icon.png"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Upload a custom icon to S3 and paste the URL here. If left blank,
                      the icon is auto-detected from the ticket URL domain (Bandsintown, Eventbrite,
                      StubHub, Ticketmaster).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
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

            {/* Images Section (edit mode only) */}
            {isEditMode && tourDate?.id && (
              <>
                <Separator />
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold">Images</h4>
                  <TourDateImageUpload
                    tourDateId={tourDate.id}
                    initialImages={tourDateImages}
                    onUploadComplete={handleImageUploadComplete}
                    disabled={isPending}
                  />
                </section>
              </>
            )}

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
