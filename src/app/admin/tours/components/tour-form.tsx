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

import { TourEditSections } from '@/app/admin/tours/components/tour-edit-sections';
import { TourFormActions } from '@/app/admin/tours/components/tour-form-actions';
import { TextField } from '@/app/components/forms/fields';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
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
import { Textarea } from '@/app/components/ui/textarea';
import {
  useCreateTourMutation,
  useDeleteTourMutation,
  useUpdateTourMutation,
} from '@/app/hooks/mutations/use-tour-mutations';
import { useTourImagesQuery } from '@/app/hooks/use-tour-images-query';
import { useTourQuery } from '@/app/hooks/use-tour-query';
import { setFormErrors } from '@/lib/utils/forms/set-form-errors';
import {
  tourCreateSchema,
  tourUpdateSchema,
  type TourCreateInput,
  type TourUpdateInput,
} from '@/lib/validation/tours/tour-schema';

/**
 * Local interface matching Prisma TourImage model.
 * Client components do not import the generated Prisma client types directly.
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
  const [tourImages, setTourImages] = useState<TourImageFields[]>([]);
  const [isTourDateDialogOpen, setIsTourDateDialogOpen] = useState(false);
  const isEditMode = !!tourId;
  const tourIdOrEmpty = tourId ?? '';
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { createTourAsync, isCreatingTour } = useCreateTourMutation();
  const { updateTourAsync, isUpdatingTour } = useUpdateTourMutation();
  const { deleteTourAsync, isDeletingTour } = useDeleteTourMutation();
  const isSubmitting = isCreatingTour || isUpdatingTour;

  // Edit-mode data loading. `useTourQuery` is skipped when an `initialTour`
  // prop is supplied (the fast-path resets straight from the prop). Tour images
  // are always fetched in edit mode; `refetch` re-pulls them after an upload.
  const { data: tourData, isPending: isTourPending } = useTourQuery(tourIdOrEmpty, {
    enabled: isEditMode && !initialTour,
  });
  const { data: tourImagesData, refetch: refetchTourImages } = useTourImagesQuery(tourIdOrEmpty, {
    enabled: isEditMode,
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

            <TourEditSections
              isEditMode={isEditMode}
              tourId={tourId}
              tourImages={tourImages}
              isSubmitting={isSubmitting}
              isDeletingTour={isDeletingTour}
              onDialogOpenChange={setIsTourDateDialogOpen}
              onUploadComplete={handleImageUploadComplete}
            />
          </div>

          <TourFormActions
            isEditMode={isEditMode}
            isSubmitting={isSubmitting}
            isDeletingTour={isDeletingTour}
            isTourDateDialogOpen={isTourDateDialogOpen}
            onBack={() => router.back()}
            onDelete={handleDelete}
          />
        </form>
      </Form>
    </div>
  );
};
