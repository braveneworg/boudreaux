'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import ArtistMultiSelect from '@/app/components/forms/fields/artist-multi-select';
import ReleaseMultiSelect from '@/app/components/forms/fields/release-multi-select';
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
import { Input } from '@/app/components/ui/input';
import { Separator } from '@/app/components/ui/separator';
import { createTrackAction } from '@/lib/actions/create-track-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { registerTrackImagesAction } from '@/lib/actions/register-image-actions';
import {
  deleteTrackImageAction,
  reorderTrackImagesAction,
} from '@/lib/actions/track-image-actions';
import { updateTrackAction } from '@/lib/actions/update-track-action';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';
import { createTrackSchema } from '@/lib/validation/create-track-schema';
import type { TrackFormData } from '@/lib/validation/create-track-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';

export interface TrackFormProps {
  trackId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ title }: { title: string }) => (
  <>
    Track <b>{title}</b> created successfully.
  </>
);

const UpdatedToastContent = ({ title }: { title: string }) => (
  <>
    Track <b>{title}</b> saved successfully.
  </>
);

const PublishedToastContent = ({ title }: { title: string }) => (
  <>
    Track <b>{title}</b> published successfully.
  </>
);

/**
 * Format seconds to MM:SS or HH:MM:SS display
 */
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Parse MM:SS or HH:MM:SS format to seconds
 */
const parseDuration = (value: string): number => {
  if (!value) return 0;

  // If it's already a number, return it
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  const parts = value.split(':').map((p) => parseInt(p, 10) || 0);

  if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  }

  return parseInt(value, 10) || 0;
};

export default function TrackForm({ trackId: initialTrackId }: TrackFormProps) {
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createTrackAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isLoadingTrack, setIsLoadingTrack] = useState(!!initialTrackId);
  const [trackId, setTrackId] = useState<string | null>(initialTrackId || null);
  const [isPublished, setIsPublished] = useState(false);
  const [imagesReordered, setImagesReordered] = useState(false);
  const [durationDisplay, setDurationDisplay] = useState('');
  const isEditMode = trackId !== null;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);

  const trackForm = useForm<TrackFormData>({
    resolver: zodResolver(createTrackSchema),
    defaultValues: {
      title: '',
      duration: 0,
      audioUrl: '',
      coverArt: '',
      position: 0,
      artistIds: [],
      releaseIds: [],
      publishedOn: '',
      createdBy: user?.id,
    },
  });
  const { control } = trackForm;

  // Fetch track data when initialTrackId is provided
  useEffect(() => {
    if (!initialTrackId) return;

    const fetchTrack = async () => {
      try {
        setIsLoadingTrack(true);
        const response = await fetch(`/api/tracks/${initialTrackId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load track');
          return;
        }

        const track = await response.json();

        // Format dates for the form (YYYY-MM-DD format)
        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        // Reset form with fetched data
        trackForm.reset({
          title: track.title || '',
          duration: track.duration || 0,
          audioUrl: track.audioUrl || '',
          coverArt: track.coverArt || '',
          position: track.position || 0,
          artistIds: track.artists?.map((ta: { artistId: string }) => ta.artistId) || [],
          releaseIds: track.releaseTracks?.map((rt: { releaseId: string }) => rt.releaseId) || [],
          publishedOn: formatDate(track.publishedOn),
          createdBy: track.createdBy || user?.id,
        });

        // Set duration display
        setDurationDisplay(formatDuration(track.duration || 0));

        // Set published state
        if (track.publishedOn) {
          setIsPublished(true);
        }

        // Load existing images if any
        if (track.images && track.images.length > 0) {
          const existingImages: ImageItem[] = track.images.map(
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
        error('Failed to fetch track:', err);
        toast.error('Failed to load track data');
      } finally {
        setIsLoadingTrack(false);
      }
    };

    fetchTrack();
  }, [initialTrackId, trackForm, user?.id]);

  const handleImagesChange = useCallback((newImages: ImageItem[]) => {
    setImages(newImages);
  }, []);

  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      setImagesReordered(true);

      if (!trackId) {
        return;
      }

      const result = await reorderTrackImagesAction(trackId, imageIds);

      if (!result.success) {
        toast.error(result.error || 'Failed to save image order');
      }
    },
    [trackId]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await deleteTrackImageAction(imageId);

      if (!result.success) {
        toast.error(result.error || 'Failed to delete image');
      }

      return result;
    },
    []
  );

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDurationDisplay(value);

      // Parse and set the duration in seconds
      const seconds = parseDuration(value);
      trackForm.setValue('duration', seconds, { shouldDirty: true });
    },
    [trackForm]
  );

  const handleDurationBlur = useCallback(() => {
    // Re-format the duration display on blur
    const seconds = trackForm.getValues('duration');
    setDurationDisplay(formatDuration(seconds));
  }, [trackForm]);

  const onSubmitTrackForm = useCallback(
    async (data: TrackFormData) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });

      startTransition(async () => {
        if (formRef.current) {
          const title = data.title;

          if (trackId) {
            // Update existing track
            const newFormState = await updateTrackAction(trackId, formState, formData);
            if (newFormState.success) {
              // Upload any pending images
              const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
              if (imagesToUpload.length > 0) {
                await uploadImages(imagesToUpload, trackId, title);
              }

              // Check if this was a publish action
              if (data.publishedOn && !isPublished) {
                setIsPublished(true);
                toast.success(<PublishedToastContent title={title} />);
              } else {
                toast.success(<UpdatedToastContent title={title} />);
              }
              trackForm.reset(data);
              setImagesReordered(false);
            } else {
              toast.error('Failed to update track. Please check the form for errors.');
            }
          } else {
            // Create new track
            const newFormState = await createTrackAction(formState, formData);
            if (newFormState.success) {
              const createdTrackId = newFormState.data?.trackId as string | undefined;

              if (createdTrackId) {
                setTrackId(createdTrackId);
                router.replace(`/admin/tracks/${createdTrackId}`, { scroll: false });

                if (data.publishedOn) {
                  setIsPublished(true);
                }

                // Upload images if any were added
                const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
                if (imagesToUpload.length > 0) {
                  await uploadImages(imagesToUpload, createdTrackId, title);
                } else {
                  toast.success(<ToastContent title={title} />);
                }

                trackForm.reset(data);
                setImagesReordered(false);
              } else {
                toast.success(<ToastContent title={title} />);
              }
            } else {
              toast.error('Failed to create track. Please check the form for errors.');
            }
          }
        } else {
          error('TrackForm: Form reference is null on submit.');
          toast.error('Please refresh the page and try again, or check back later.');
        }
      });
    },
    [formState, images, trackId, isPublished, trackForm, router]
  );

  const uploadImages = async (
    imagesToUpload: ImageItem[],
    targetTrackId: string,
    title: string
  ) => {
    setIsUploadingImages(true);
    setImages((prev) =>
      prev.map((img) => (img.file && !img.uploadedUrl ? { ...img, isUploading: true } : img))
    );

    try {
      const fileInfos = imagesToUpload.map((img) => ({
        fileName: img.file!.name,
        contentType: img.file!.type,
        fileSize: img.file!.size,
      }));

      const presignedResult = await getPresignedUploadUrlsAction(
        'tracks',
        targetTrackId,
        fileInfos
      );

      if (!presignedResult.success || !presignedResult.data) {
        throw Error(presignedResult.error || 'Failed to get upload URLs');
      }

      const files = imagesToUpload.map((img) => img.file!);
      const uploadResults = await uploadFilesToS3(files, presignedResult.data);

      const failedUploads = uploadResults.filter((r) => !r.success);
      if (failedUploads.length > 0) {
        throw Error(`Failed to upload ${failedUploads.length} image(s)`);
      }

      const imageInfos = presignedResult.data.map((presigned, index) => ({
        s3Key: presigned.s3Key,
        cdnUrl: presigned.cdnUrl,
        caption: imagesToUpload[index].caption || '',
        altText: imagesToUpload[index].altText || '',
      }));

      const registerResult = await registerTrackImagesAction(targetTrackId, imageInfos);

      if (registerResult.success && registerResult.data) {
        setImages((prev) => {
          const uploadedData = registerResult.data || [];
          let uploadIndex = 0;
          return prev.map((img) => {
            if (img.file && !img.uploadedUrl && uploadedData[uploadIndex]) {
              const uploaded = uploadedData[uploadIndex];
              uploadIndex++;
              return {
                ...img,
                id: uploaded.id,
                uploadedUrl: uploaded.src,
                isUploading: false,
                sortOrder: uploaded.sortOrder,
              };
            }
            return { ...img, isUploading: false };
          });
        });
        toast.success(
          <>
            Track <b>{title}</b> saved with {registerResult.data.length} image
            {registerResult.data.length !== 1 ? 's' : ''}.
          </>
        );
      } else {
        throw Error(registerResult.error || 'Failed to register images');
      }
    } catch (uploadError) {
      error('Image upload error:', uploadError);
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setImages((prev) =>
        prev.map((img) =>
          img.file && !img.uploadedUrl ? { ...img, isUploading: false, error: errorMessage } : img
        )
      );
      toast.error(errorMessage);
    } finally {
      setIsUploadingImages(false);
    }
  };

  const isSubmitting = isPending || isTransitionPending || isUploadingImages;

  const formatValidationErrors = useCallback((errors: Record<string, { message?: string }>) => {
    const errorMessages = Object.entries(errors)
      .map(([field, err]) => `${field}: ${err.message || 'Invalid'}`)
      .join(', ');
    return errorMessages || 'Please check the form for errors.';
  }, []);

  const handleClickPublishButton = useCallback(() => {
    trackForm.setValue('publishedOn', new Date().toISOString(), { shouldDirty: true });
    trackForm.handleSubmit(onSubmitTrackForm, (errors) => {
      console.error('Form validation errors:', errors);
      toast.error(formatValidationErrors(errors));
    })();
  }, [trackForm, onSubmitTrackForm, formatValidationErrors]);

  const hasPendingImages = images.some((img) => img.file && !img.uploadedUrl);
  const isDirty = trackForm.formState.isDirty || imagesReordered || hasPendingImages;

  if (!trackForm || !control || isLoadingTrack) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialTrackId ? 'Edit Track' : 'Create New Track'}</CardTitle>
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
            anchorText: isEditMode ? 'Edit Track' : 'Create Track',
            url: '/admin/tracks',
            isActive: true,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Track' : 'Create New Track'}</CardTitle>
          <CardDescription>
            {isEditMode
              ? 'Update track information. Changes are saved when you click Save.'
              : 'Required fields are marked with an asterisk *'}
          </CardDescription>
        </CardHeader>
        <Form {...trackForm}>
          <form
            action={formAction}
            ref={formRef}
            onSubmit={trackForm.handleSubmit(onSubmitTrackForm, (errors) => {
              console.error('Form validation errors:', errors);
              toast.error(formatValidationErrors(errors));
            })}
            noValidate
          >
            <CardContent className="space-y-6">
              <Separator />

              {/* Basic Information Section */}
              <section className="space-y-4 pt-0">
                <h2 className="font-semibold">Basic Information</h2>
                <TextField
                  control={control}
                  name="title"
                  label="Title *"
                  placeholder="Track title"
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration * (MM:SS or seconds)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={durationDisplay}
                            onChange={handleDurationChange}
                            onBlur={handleDurationBlur}
                            placeholder="3:45 or 225"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Track Position</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            placeholder="0"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <TextField
                  control={control}
                  name="audioUrl"
                  label="Audio URL *"
                  placeholder="https://example.com/track.mp3"
                />
                <TextField
                  control={control}
                  name="coverArt"
                  label="Cover Art URL"
                  placeholder="https://example.com/cover.jpg"
                />
              </section>

              <Separator />

              {/* Artists & Releases Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Artists & Releases</h2>
                <ArtistMultiSelect
                  control={control}
                  name="artistIds"
                  label="Artists"
                  placeholder="Select artists..."
                  searchPlaceholder="Search artists..."
                  emptyMessage="No artists found."
                  setValue={trackForm.setValue}
                  releaseId={trackId}
                  disabled={isSubmitting}
                />
                <ReleaseMultiSelect
                  control={control}
                  name="releaseIds"
                  label="Releases"
                  placeholder="Select releases..."
                  searchPlaceholder="Search releases..."
                  emptyMessage="No releases found."
                  setValue={trackForm.setValue}
                  trackId={trackId}
                  disabled={isSubmitting}
                />
              </section>

              <Separator />

              {/* Images Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Images</h2>
                <p className="text-sm text-muted-foreground">
                  Add images for this track. You can drag to reorder them. Images will be uploaded
                  after the track is created or updated.
                </p>
                <ImageUploader
                  images={images}
                  onImagesChange={handleImagesChange}
                  onReorder={handleReorder}
                  onDelete={handleDeleteImage}
                  maxImages={10}
                  disabled={isSubmitting}
                  label="Upload track images"
                />
              </section>
            </CardContent>

            <CardFooter className="flex justify-end gap-4">
              {isEditMode ? (
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
