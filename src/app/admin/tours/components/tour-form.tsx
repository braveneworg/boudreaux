/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TourDateList } from '@/app/admin/tours/components/tour-date-list';
import { TourImageUpload } from '@/app/admin/tours/components/tour-image-upload';
import { TextField } from '@/app/components/forms/fields';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { SectionHeader } from '@/app/components/ui/section-header';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import {
  useCreateTourMutation,
  useDeleteTourMutation,
  useUpdateTourMutation,
} from '@/app/hooks/mutations/use-tour-mutations';
import { useTourImagesQuery } from '@/app/hooks/use-tour-images-query';
import { useTourQuery } from '@/app/hooks/use-tour-query';
import type { FormState } from '@/lib/types/form-state';
import { tourCreateSchema, tourUpdateSchema } from '@/lib/validation/tours/tour-schema';

/**
 * Local interface matching Prisma TourImage model.
 * Client components should not import directly from @prisma/client.
 */
interface TourImageFields {
  id: string;
  tourId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText: string | null;
  createdAt: Date;
  uploadedBy: string | null;
}

interface TourFormProps {
  tourId?: string;
  initialTour?: {
    title?: string | null;
    subtitle?: string | null;
    subtitle2?: string | null;
    description?: string | null;
    notes?: string | null;
  } | null;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

export const TourForm = ({ tourId, initialTour = null }: TourFormProps) => {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isPending, setIsPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tourImages, setTourImages] = useState<TourImageFields[]>([]);
  const [isTourDateDialogOpen, setIsTourDateDialogOpen] = useState(false);
  const isEditMode = !!tourId;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { mutateAsync: createTour } = useCreateTourMutation();
  const { mutateAsync: updateTour } = useUpdateTourMutation();
  const { mutateAsync: deleteTour } = useDeleteTourMutation();

  // Edit-mode data loading. `useTourQuery` is skipped when an `initialTour`
  // prop is supplied (the fast-path resets straight from the prop). Tour images
  // are always fetched in edit mode; `refetch` re-pulls them after an upload.
  const { data: tourData, isPending: isTourPending } = useTourQuery(tourId ?? '', {
    enabled: !!tourId && !initialTour,
  });
  const { data: tourImagesData, refetch: refetchTourImages } = useTourImagesQuery(tourId ?? '', {
    enabled: !!tourId,
  });

  // In edit mode the form renders only after its data has been applied
  // client-side (create mode is ready immediately). Starting `true` for any
  // edit keeps the form out of the SSR markup, so the reset-on-data effect
  // can't trigger a hydration mismatch — which would otherwise mount a second,
  // empty copy of the form.
  const [isLoadingTour, setIsLoadingTour] = useState(!!tourId);

  const form = useForm({
    resolver: zodResolver(isEditMode ? tourUpdateSchema : tourCreateSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      subtitle2: '',
      description: '',
      notes: '',
    },
  });

  const { control, handleSubmit, reset, setError } = form;

  // Reset the form from the `initialTour` fast-path prop when provided.
  useEffect(() => {
    if (tourId && initialTour) {
      reset({
        title: initialTour.title || '',
        subtitle: initialTour.subtitle || '',
        subtitle2: initialTour.subtitle2 || '',
        description: initialTour.description || '',
        notes: initialTour.notes || '',
      });
      setIsLoadingTour(false);
    }
  }, [tourId, initialTour, reset]);

  // Reset the form from the fetched tour (non-`initialTour` edit mode).
  useEffect(() => {
    if (tourId && !initialTour && tourData) {
      reset({
        title: tourData.title || '',
        subtitle: tourData.subtitle || '',
        subtitle2: tourData.subtitle2 || '',
        description: tourData.description || '',
        notes: tourData.notes || '',
      });
      setIsLoadingTour(false);
    }
  }, [tourId, initialTour, tourData, reset]);

  // Non-`initialTour` edit mode: once the tour query settles, stop showing the
  // loading state even when the tour was not found (404 → null data), so the
  // empty form (and its "Edit Tour" heading) renders instead of a perpetual
  // skeleton.
  useEffect(() => {
    if (tourId && !initialTour && !isTourPending) {
      setIsLoadingTour(false);
    }
  }, [tourId, initialTour, isTourPending]);

  // Project the tour-images query result into local state for the uploader.
  useEffect(() => {
    if (tourImagesData) {
      setTourImages(tourImagesData.images);
    }
  }, [tourImagesData]);

  const onSubmit = async (data: Record<string, unknown>) => {
    setIsPending(true);
    try {
      const formData = new FormData();

      // Add all form fields to FormData
      Object.entries(data).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          return;
        }

        if (key === 'headlinerIds' && Array.isArray(value)) {
          // Encode array as JSON string for FormData
          formData.append(key, JSON.stringify(value));
          return;
        }

        // In edit mode, preserve empty string values so optional fields can be cleared.
        if (isEditMode || value !== '') {
          formData.append(key, String(value));
        }
      });

      let result: FormState;
      if (isEditMode && tourId) {
        result = await updateTour({ tourId, formState, formData });
      } else {
        result = await createTour({ formState, formData });
      }

      setFormState(result);

      if (result.success) {
        toast.success(isEditMode ? 'Tour updated successfully' : 'Tour created successfully');
        router.push('/admin/tours');
        router.refresh();
      } else {
        const errors = result.errors ?? {};
        const fieldErrors: string[] = [];
        for (const [field, messages] of Object.entries(errors)) {
          const msg = Array.isArray(messages) ? messages[0] : String(messages);
          if (!msg) continue;
          if (field === 'general') {
            toast.error(msg);
          } else {
            setError(field as 'title', { message: msg });
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

  const handleDelete = async () => {
    if (!tourId) return;
    if (!confirm('Are you sure you want to delete this tour? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteTour({ tourId });
      if (result.success) {
        toast.success('Tour deleted successfully');
        router.push('/admin/tours');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to delete tour');
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageUploadComplete = async () => {
    // Refresh images after upload via the query's refetch; the projection
    // effect above syncs the result into local state.
    if (tourId) {
      await refetchTourImages();
    }
  };

  if (isLoadingTour) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center p-8">
          <p>Loading tour...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Tours', url: '/admin/tours', isActive: false },
          {
            anchorText: isEditMode ? 'Edit Tour' : 'Create Tour',
            url: isEditMode ? `/admin/tours/${tourId}` : '/admin/tours/new',
            isActive: true,
          },
        ]}
      />

      <SectionHeader
        icon={CalendarDays}
        title={isEditMode ? 'Edit Tour' : 'Create New Tour'}
        helpText="Set the tour's basic information, then add tour dates, venues, and headlining artists. Images can be added after the tour is created."
      />

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-6">
            {/* Basic Information Section */}
            <section className="space-y-4">
              <h3>Basic Information</h3>

              <TextField
                control={control}
                name="title"
                label="Tour Title"
                placeholder="Enter tour title"
              />

              <TextField
                control={control}
                name="subtitle"
                label="Subtitle"
                placeholder="Optional subtitle"
              />

              <TextField
                control={control}
                name="subtitle2"
                label="Second Subtitle"
                placeholder="Optional second subtitle"
              />

              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ''}
                        placeholder="Enter tour description"
                        rows={4}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        placeholder="Internal notes (not displayed publicly)"
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      These notes are for internal use only and will not be shown to the public.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {/* Tour Dates - Only show in edit mode */}
            {isEditMode && tourId && (
              <>
                <Separator />
                <TourDateList tourId={tourId} onDialogOpenChange={setIsTourDateDialogOpen} />
              </>
            )}

            {/* Images Section - Only show in edit mode after tour is created */}
            {isEditMode && tourId && (
              <>
                <Separator />
                <section className="space-y-4">
                  <div className="space-y-2">
                    <h3>Tour Images</h3>
                    <p className="text-zinc-950-foreground text-sm">
                      Upload images for this tour. You can add up to 10 images. Images can be
                      reordered by dragging and dropping.
                    </p>
                  </div>
                  <TourImageUpload
                    tourId={tourId}
                    initialImages={tourImages}
                    onUploadComplete={handleImageUploadComplete}
                    disabled={isPending || isDeleting}
                  />
                </section>
              </>
            )}
          </div>

          <div className="flex justify-between pt-6">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isPending || isDeleting}
              >
                Cancel
              </Button>
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending || isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Tour'}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={isPending || isDeleting || isTourDateDialogOpen}>
              {isPending
                ? isEditMode
                  ? 'Updating...'
                  : 'Creating...'
                : isEditMode
                  ? 'Update Tour'
                  : 'Create Tour'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
