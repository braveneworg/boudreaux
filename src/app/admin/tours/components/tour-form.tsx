/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import TourDateList from '@/app/admin/tours/components/tour-date-list';
import { TourImageUpload } from '@/app/admin/tours/components/tour-image-upload';
import { TextField } from '@/app/components/forms/fields';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/app/components/ui/card';
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
import { createTourAction, updateTourAction, deleteTourAction } from '@/lib/actions/tour-actions';
import type { FormState } from '@/lib/types/form-state';
import { tourCreateSchema, type TourCreateInput } from '@/lib/validations/tours/tour-schema';

import type { TourImage } from '@prisma/client';

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

export default function TourForm({ tourId, initialTour = null }: TourFormProps) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isPending, setIsPending] = useState(false);
  const [isLoadingTour, setIsLoadingTour] = useState(!!tourId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tourImages, setTourImages] = useState<TourImage[]>([]);
  const isEditMode = !!tourId;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm({
    resolver: zodResolver(tourCreateSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      subtitle2: '',
      description: '',
      notes: '',
    },
  });

  const { control, handleSubmit, reset } = form;

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

  const onSubmit = async (data: TourCreateInput) => {
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
        result = await updateTourAction(tourId, formState, formData);
      } else {
        result = await createTourAction(formState, formData);
      }

      setFormState(result);

      if (result.success) {
        toast.success(isEditMode ? 'Tour updated successfully' : 'Tour created successfully');
        router.push('/admin/tours');
        router.refresh();
      } else if (result.errors) {
        // Form validation errors are automatically handled by React Hook Form
        toast.error('Please fix the form errors');
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
      const result = await deleteTourAction(tourId);
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
    <div className="container mx-auto py-6">
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

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{isEditMode ? 'Edit Tour' : 'Create New Tour'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information Section */}
              <section className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>

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
                  <TourDateList tourId={tourId} />
                </>
              )}

              {/* Images Section - Only show in edit mode after tour is created */}
              {isEditMode && tourId && (
                <>
                  <Separator />
                  <section className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Tour Images</h3>
                      <p className="text-sm text-muted-foreground">
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
            </CardContent>

            <CardFooter className="flex justify-between">
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
              <Button type="submit" disabled={isPending || isDeleting}>
                {isPending
                  ? isEditMode
                    ? 'Updating...'
                    : 'Creating...'
                  : isEditMode
                    ? 'Update Tour'
                    : 'Create Tour'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
