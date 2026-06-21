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
import { setFormErrors } from '@/lib/utils/forms/set-form-errors';
import {
  tourCreateSchema,
  tourUpdateSchema,
  type TourCreateInput,
  type TourUpdateInput,
} from '@/lib/validation/tours/tour-schema';

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

export const TourForm = ({ tourId, initialTour = null }: TourFormProps) => {
  const [isLoadingTour, setIsLoadingTour] = useState(!!tourId);
  const [tourImages, setTourImages] = useState<TourImageFields[]>([]);
  const [isTourDateDialogOpen, setIsTourDateDialogOpen] = useState(false);
  const isEditMode = !!tourId;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { createTourAsync, isCreatingTour } = useCreateTourMutation();
  const { updateTourAsync, isUpdatingTour } = useUpdateTourMutation();
  const { deleteTourAsync, isDeletingTour } = useDeleteTourMutation();
  const isSubmitting = isCreatingTour || isUpdatingTour;

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

  // Fetch tour data in edit mode
  useEffect(() => {
    if (tourId) {
      if (initialTour) {
        reset({
          title: initialTour.title || '',
          subtitle: initialTour.subtitle || '',
          subtitle2: initialTour.subtitle2 || '',
          description: initialTour.description || '',
          notes: initialTour.notes || '',
        });
        setIsLoadingTour(false);

        const fetchImages = async () => {
          try {
            const imagesRes = await fetch(`/api/tours/${tourId}/images`);
            if (imagesRes.ok) {
              const { images } = await imagesRes.json();
              setTourImages(images || []);
            }
          } catch (err) {
            console.error('Failed to fetch tour images:', err);
          }
        };

        fetchImages();
        return;
      }

      const fetchTour = async () => {
        setIsLoadingTour(true);
        try {
          const res = await fetch(`/api/tours/${tourId}`);
          if (res.ok) {
            const { tour } = await res.json();
            reset({
              title: tour.title || '',
              subtitle: tour.subtitle || '',
              subtitle2: tour.subtitle2 || '',
              description: tour.description || '',
              notes: tour.notes || '',
            });

            // Fetch tour images separately
            const imagesRes = await fetch(`/api/tours/${tourId}/images`);
            if (imagesRes.ok) {
              const { images } = await imagesRes.json();
              setTourImages(images || []);
            }
          }
        } catch (err) {
          console.error('Failed to fetch tour:', err);
          toast.error('Failed to load tour data');
        } finally {
          setIsLoadingTour(false);
        }
      };
      fetchTour();
    }
  }, [tourId, initialTour, reset]);

  const onSubmit = async (values: TourCreateInput | TourUpdateInput) => {
    try {
      const result =
        isEditMode && tourId
          ? await updateTourAsync({ id: tourId, values: values as TourUpdateInput })
          : await createTourAsync(values as TourCreateInput);

      if (result.success) {
        toast.success(isEditMode ? 'Tour updated successfully' : 'Tour created successfully');
        router.push('/admin/tours');
        router.refresh();
        return;
      }

      const { generalError } = setFormErrors(setError, result);
      toast.error(generalError ?? 'Please fix the form errors');
    } catch (err) {
      console.error('Form submission error:', err);
      toast.error('An unexpected error occurred');
    }
  };

  const handleDelete = async () => {
    if (!tourId) return;
    if (!confirm('Are you sure you want to delete this tour? This action cannot be undone.')) {
      return;
    }

    try {
      const result = await deleteTourAsync({ tourId });
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
    }
  };

  const handleImageUploadComplete = async () => {
    // Refresh images after upload
    if (tourId) {
      try {
        const imagesRes = await fetch(`/api/tours/${tourId}/images`);
        if (imagesRes.ok) {
          const { images } = await imagesRes.json();
          setTourImages(images || []);
        }
      } catch (err) {
        console.error('Failed to refresh images:', err);
      }
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
                    disabled={isSubmitting || isDeletingTour}
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
                disabled={isSubmitting || isDeletingTour}
              >
                Cancel
              </Button>
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isSubmitting || isDeletingTour}
                >
                  {isDeletingTour ? 'Deleting...' : 'Delete Tour'}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={isSubmitting || isDeletingTour || isTourDateDialogOpen}>
              {isSubmitting
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
