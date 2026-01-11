'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/app/components/ui/form';
import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import {
  deleteArtistImageAction,
  reorderArtistImagesAction,
  uploadArtistImagesAction,
} from '@/lib/actions/artist-image-actions';
import { createArtistAction } from '@/lib/actions/create-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof ArtistFormData;

interface ArtistFormProps {
  artistId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ fullName }: { fullName: string }) => (
  <>
    Artist <b>{`${fullName}`}</b> created successfully.
  </>
);

const UpdatedToastContent = ({ fullName }: { fullName: string }) => (
  <>
    Artist <b>{`${fullName}`}</b> saved successfully.
  </>
);

const PublishedToastContent = ({ fullName }: { fullName: string }) => (
  <>
    Artist <b>{`${fullName}`}</b> published successfully.
  </>
);

export default function ArtistForm({ artistId: initialArtistId }: ArtistFormProps) {
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createArtistAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isLoadingArtist, setIsLoadingArtist] = useState(!!initialArtistId);
  // artistId will be set after artist creation or from URL param for persisting image reordering
  const [artistId, setArtistId] = useState<string | null>(initialArtistId || null);
  // Track if artist is published (publishedOn date exists)
  const [isPublished, setIsPublished] = useState(false);
  // Track if images have been reordered (for enabling Save button)
  const [imagesReordered, setImagesReordered] = useState(false);
  // Track if we're in edit mode (after artist creation or when loading existing artist)
  const isEditMode = artistId !== null;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);
  const artistForm = useForm<ArtistFormData>({
    resolver: zodResolver(createArtistSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      surname: '',
      akaNames: '',
      displayName: '',
      title: '',
      suffix: '',
      slug: '',
      bio: '',
      shortBio: '',
      altBio: '',
      genres: '',
      tags: '',
      bornOn: '',
      diedOn: '',
      createdBy: user?.id,
      publishedOn: '',
    },
  });
  const { control } = artistForm;

  // Fetch artist data when initialArtistId is provided
  useEffect(() => {
    if (!initialArtistId) return;

    const fetchArtist = async () => {
      try {
        setIsLoadingArtist(true);
        const response = await fetch(`/api/artists/${initialArtistId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load artist');
          return;
        }

        const artist = await response.json();

        // Format dates for the form (YYYY-MM-DD format)
        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        // Reset form with fetched data
        artistForm.reset({
          firstName: artist.firstName || '',
          middleName: artist.middleName || '',
          surname: artist.surname || '',
          akaNames: artist.akaNames || '',
          displayName: artist.displayName || '',
          title: artist.title || '',
          suffix: artist.suffix || '',
          slug: artist.slug || '',
          bio: artist.bio || '',
          shortBio: artist.shortBio || '',
          altBio: artist.altBio || '',
          genres: artist.genres || '',
          tags: artist.tags || '',
          bornOn: formatDate(artist.bornOn),
          diedOn: formatDate(artist.diedOn),
          publishedOn: formatDate(artist.publishedOn),
          createdBy: artist.createdBy || user?.id,
        });

        // Set published state
        if (artist.publishedOn) {
          setIsPublished(true);
        }

        // Load existing images if any
        if (artist.images && artist.images.length > 0) {
          const existingImages: ImageItem[] = artist.images.map(
            (img: {
              id: string;
              src: string;
              caption?: string;
              altText?: string;
              sortOrder?: number;
            }) => ({
              id: img.id,
              preview: img.src,
              uploadedUrl: img.src,
              caption: img.caption || '',
              altText: img.altText || '',
              sortOrder: img.sortOrder ?? 0,
            })
          );
          setImages(existingImages);
        }
      } catch (err) {
        error('Failed to fetch artist:', err);
        toast.error('Failed to load artist data');
      } finally {
        setIsLoadingArtist(false);
      }
    };

    fetchArtist();
  }, [initialArtistId, artistForm, user?.id]);

  const handleImagesChange = useCallback((newImages: ImageItem[]) => {
    setImages(newImages);
  }, []);

  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      // Mark images as reordered for Save button enablement
      setImagesReordered(true);

      // Only persist reorder if we have an artistId (after artist creation)
      // and there are uploaded images to reorder
      if (!artistId) {
        // In create mode, local reordering is handled by ImageUploader
        // The order will be preserved when images are uploaded after artist creation
        return;
      }

      const result = await reorderArtistImagesAction(artistId, imageIds);

      if (!result.success) {
        toast.error(result.error || 'Failed to save image order');
      }
    },
    [artistId]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string): Promise<{ success: boolean; error?: string }> => {
      // Call the server action to delete from database and CDN
      const result = await deleteArtistImageAction(imageId);

      if (!result.success) {
        toast.error(result.error || 'Failed to delete image');
      }

      return result;
    },
    []
  );

  const onSubmitArtistForm = useCallback(
    async (data: ArtistFormData) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          formData.append(key, String(value));
        }
      });
      startTransition(async () => {
        if (formRef.current) {
          const fullName = data.displayName || `${data.firstName} ${data.surname}`.trim();

          // If we already have an artistId, this is an update
          if (artistId) {
            const newFormState = await updateArtistAction(artistId, formState, formData);
            if (newFormState.success) {
              // Check if this was a publish action (publishedOn was set)
              if (data.publishedOn && !isPublished) {
                setIsPublished(true);
                toast.success(<PublishedToastContent fullName={fullName} />);
              } else {
                toast.success(<UpdatedToastContent fullName={fullName} />);
              }
              // Reset form dirty state after successful save
              artistForm.reset(data);
              setImagesReordered(false);
            } else {
              toast.error('Failed to update artist. Please check the form for errors.');
            }
          } else {
            // This is a create action
            const newFormState = await createArtistAction(formState, formData);
            if (newFormState.success) {
              const createdArtistId = newFormState.data?.artistId as string | undefined;

              // Set artistId for image reordering persistence
              if (createdArtistId) {
                setArtistId(createdArtistId);

                // Update URL to include the artist ID (shallow update, no navigation)
                router.replace(`/admin/artists/${createdArtistId}`, { scroll: false });

                // Check if this was a publish action
                if (data.publishedOn) {
                  setIsPublished(true);
                }

                // Upload images if any were added
                const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
                if (imagesToUpload.length > 0) {
                  setIsUploadingImages(true);

                  // Update image states to show uploading
                  setImages((prev) =>
                    prev.map((img) =>
                      img.file && !img.uploadedUrl ? { ...img, isUploading: true } : img
                    )
                  );

                  try {
                    // Create FormData for image upload
                    const imageFormData = new FormData();
                    for (const img of imagesToUpload) {
                      if (img.file) {
                        imageFormData.append('files', img.file);
                        imageFormData.append('captions', img.caption || '');
                        imageFormData.append('altTexts', img.altText || '');
                      }
                    }

                    const uploadResult = await uploadArtistImagesAction(
                      createdArtistId,
                      imageFormData
                    );

                    if (uploadResult.success && uploadResult.data) {
                      // Update images with uploaded URLs
                      setImages((prev) => {
                        const uploadedData = uploadResult.data || [];
                        return prev.map((img, index) => {
                          if (img.file && !img.uploadedUrl && uploadedData[index]) {
                            return {
                              ...img,
                              id: uploadedData[index].id,
                              uploadedUrl: uploadedData[index].src,
                              isUploading: false,
                              sortOrder: uploadedData[index].sortOrder,
                            };
                          }
                          return { ...img, isUploading: false };
                        });
                      });
                      // Show combined success message for artist + images
                      toast.success(
                        <>
                          Artist <b>{fullName}</b> created with {uploadResult.data.length} image
                          {uploadResult.data.length !== 1 ? 's' : ''}.
                        </>
                      );
                    } else {
                      // Mark images as failed
                      setImages((prev) =>
                        prev.map((img) =>
                          img.file && !img.uploadedUrl
                            ? { ...img, isUploading: false, error: uploadResult.error }
                            : img
                        )
                      );
                      toast.error(uploadResult.error || 'Failed to upload images');
                      // Still show artist creation success
                      toast.success(<ToastContent fullName={fullName} />);
                    }
                  } catch (uploadError) {
                    error('Image upload error:', uploadError);
                    setImages((prev) =>
                      prev.map((img) =>
                        img.file && !img.uploadedUrl
                          ? { ...img, isUploading: false, error: 'Upload failed' }
                          : img
                      )
                    );
                    toast.error('Failed to upload images');
                    // Still show artist creation success
                    toast.success(<ToastContent fullName={fullName} />);
                  } finally {
                    setIsUploadingImages(false);
                  }
                } else {
                  // No images to upload, just show artist creation success
                  toast.success(<ToastContent fullName={fullName} />);
                }

                // Reset form dirty state
                artistForm.reset(data);
                setImagesReordered(false);
              } else {
                // No artistId returned but success - show generic success
                toast.success(<ToastContent fullName={fullName} />);
              }
            } else {
              toast.error('Failed to create artist. Please check the form for errors.');
            }
          }
        } else {
          error('ArtistForm: Form reference is null on submit.');
          toast.error('Please refresh the page and try again, or check back later.');
        }
      });
    },
    [formState, images, artistId, isPublished, artistForm, router]
  );

  const isSubmitting = isPending || isTransitionPending || isUploadingImages;

  // Watch name fields for auto-generating slug (using useWatch for React Compiler compatibility)
  const displayName = useWatch({ control, name: 'displayName' });
  const firstName = useWatch({ control, name: 'firstName' });
  const middleName = useWatch({ control, name: 'middleName' });
  const surname = useWatch({ control, name: 'surname' });
  const slug = useWatch({ control, name: 'slug' });

  // Auto-generate slug from name fields
  useEffect(() => {
    let slugSource = '';

    if (displayName?.trim()) {
      slugSource = displayName.trim();
    } else {
      const nameParts = [firstName?.trim(), middleName?.trim(), surname?.trim()].filter(Boolean);
      slugSource = nameParts.join(' ');
    }

    if (slugSource) {
      const generatedSlug = slugSource
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      artistForm.setValue('slug', generatedSlug, { shouldValidate: false });
    }
  }, [displayName, firstName, middleName, surname, artistForm]);

  // Clear slug error when the value becomes valid (lowercase alphanumeric with dashes)
  useEffect(() => {
    if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      artistForm.clearErrors('slug');
    }
  }, [slug, artistForm]);

  const handleSelectDate = (dateString: string, fieldName: string): void => {
    artistForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
  };

  // Helper to format validation errors for toast display
  const formatValidationErrors = useCallback((errors: Record<string, { message?: string }>) => {
    const errorMessages = Object.entries(errors)
      .map(([field, error]) => `${field}: ${error.message || 'Invalid'}`)
      .join(', ');
    return errorMessages || 'Please check the form for errors.';
  }, []);

  // Handler for Create & Publish (create mode) or Publish (edit mode)
  const handleClickPublishButton = useCallback(() => {
    artistForm.setValue('publishedOn', new Date().toISOString(), { shouldDirty: true });
    artistForm.handleSubmit(onSubmitArtistForm, (errors) => {
      console.error('Form validation errors:', errors);
      toast.error(formatValidationErrors(errors));
    })();
  }, [artistForm, onSubmitArtistForm, formatValidationErrors]);

  // Track form dirty state for Save button enablement (includes image reordering)
  const isDirty = artistForm.formState.isDirty || imagesReordered;

  // Ensure form is fully initialized before rendering
  if (!artistForm || !control || isLoadingArtist) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialArtistId ? 'Edit Artist' : 'Create New Artist'}</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <BreadcrumbMenu
        items={[
          {
            anchorText: 'Admin',
            url: '/admin',
            isActive: false,
          },
          {
            anchorText: isEditMode ? 'Edit Artist' : 'Create Artist',
            url: '/admin/artists',
            isActive: true,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Artist' : 'Create New Artist'}</CardTitle>
          <CardDescription>
            {isEditMode
              ? 'Update artist information. Changes are saved when you click Save.'
              : 'Required fields are marked with an asterisk *'}
          </CardDescription>
        </CardHeader>
        <Form {...artistForm}>
          <form
            action={formAction}
            ref={formRef}
            onSubmit={artistForm.handleSubmit(onSubmitArtistForm, (errors) => {
              console.error('Form validation errors:', errors);
              toast.error(formatValidationErrors(errors));
            })}
            noValidate
          >
            <CardContent className="space-y-6">
              <Separator />
              {/* Name Section */}
              <section className="space-y-4 pt-0">
                <h2 className="font-semibold">Name Information</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="title"
                    label="Title"
                    placeholder="e.g., Dr., Prof., DJ"
                  />
                  <TextField
                    control={control}
                    name="firstName"
                    label="First Name *"
                    placeholder="First name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="middleName"
                    label="Middle Name"
                    placeholder="Middle name"
                  />
                  <TextField
                    control={control}
                    name="surname"
                    label="Surname *"
                    placeholder="Last name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="suffix"
                    label="Suffix"
                    placeholder="e.g., Jr., Sr., III"
                  />
                  <TextField
                    control={control}
                    name="displayName"
                    label="Display Name"
                    placeholder="Public display name (optional)"
                  />
                </div>
                <TextField
                  control={control}
                  name="akaNames"
                  label="AKA Names"
                  placeholder="Also known as (comma-separated)"
                />
                <TextField
                  control={control}
                  name="slug"
                  label="Slug *"
                  placeholder="url-friendly-identifier"
                />
              </section>

              <Separator />

              {/* Images Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Images</h2>
                <p className="text-sm text-muted-foreground">
                  Add images for this artist. You can drag to reorder them. Images will be uploaded
                  after the artist is created or updated.
                </p>
                <ImageUploader
                  images={images}
                  onImagesChange={handleImagesChange}
                  onReorder={handleReorder}
                  onDelete={handleDeleteImage}
                  maxImages={10}
                  disabled={isSubmitting}
                  label="Upload artist images"
                />
              </section>

              <Separator />

              {/* Biography Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Biography</h2>
                <FormField
                  control={control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Artist biography" className="min-h-32" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="shortBio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief artist description"
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="altBio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alternative Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Alternative biography for special use cases"
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              {/* Music Information */}
              <section className="space-y-4">
                <h2 className="font-semibold">Music Information</h2>
                <TextField
                  control={control}
                  name="genres"
                  label="Genres"
                  placeholder="e.g., indie-rock, synth-pop (comma-separated)"
                />
                <TextField
                  control={control}
                  name="tags"
                  label="Tags"
                  placeholder="e.g., experimental, electronic (comma-separated)"
                />
              </section>

              <Separator />

              {/* Dates Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Important Dates</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="bornOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Born on</FormLabel>
                        <FormControl>
                          <DatePicker
                            fieldName={field.name}
                            onSelect={handleSelectDate}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="diedOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Died on</FormLabel>
                        <FormControl>
                          <DatePicker
                            fieldName={field.name}
                            onSelect={handleSelectDate}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </CardContent>

            <CardFooter className="flex justify-end gap-4">
              {isEditMode ? (
                // Edit mode buttons
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || isPublished}
                    onClick={handleClickPublishButton}
                  >
                    {isPublished ? 'Published' : 'Publish'}
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                // Create mode buttons
                <>
                  <Button type="button" disabled={isSubmitting} onClick={handleClickPublishButton}>
                    Create &amp; Publish
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                </>
              )}
            </CardFooter>
          </form>
        </Form>
      </Card>
    </>
  );
}
