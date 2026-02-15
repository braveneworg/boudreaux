/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import ArtistMultiSelect from '@/app/components/forms/fields/artist-multi-select';
import CoverArtField from '@/app/components/forms/fields/cover-art-field';
import GroupMultiSelect, {
  type GroupOption,
} from '@/app/components/forms/fields/group-multi-select';
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
  FormDescription,
} from '@/app/components/ui/form';
import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import { Separator } from '@/app/components/ui/separator';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { createReleaseAction } from '@/lib/actions/create-release-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { registerReleaseImagesAction } from '@/lib/actions/register-image-actions';
import {
  deleteReleaseImageAction,
  reorderReleaseImagesAction,
} from '@/lib/actions/release-image-actions';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import type { FormState } from '@/lib/types/form-state';
import { FORMATS, type Format } from '@/lib/types/media-models';
import { error } from '@/lib/utils/console-logger';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof ReleaseFormData;

export interface ReleaseFormProps {
  releaseId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

// Common formats grouped for easier selection
const FORMAT_GROUPS = {
  Digital: ['DIGITAL', 'MP3_320KBPS', 'FLAC', 'WAV', 'AAC'] as Format[],
  Vinyl: [
    'VINYL',
    'VINYL_7_INCH',
    'VINYL_10_INCH',
    'VINYL_12_INCH',
    'VINYL_180G',
    'VINYL_COLORED',
    'VINYL_GATEFOLD',
    'VINYL_DOUBLE_LP',
  ] as Format[],
  Physical: ['CD', 'CASSETTE'] as Format[],
};

const formatDisplayName = (format: string): string => {
  return format
    .replace(/_/g, ' ')
    .replace(/KBPS/g, 'kbps')
    .replace(/(\d+)G/g, '$1g')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const ToastContent = ({ title }: { title: string }) => (
  <>
    Release <b>{title}</b> created successfully.
  </>
);

const UpdatedToastContent = ({ title }: { title: string }) => (
  <>
    Release <b>{title}</b> saved successfully.
  </>
);

const PublishedToastContent = ({ title }: { title: string }) => (
  <>
    Release <b>{title}</b> published successfully.
  </>
);

export default function ReleaseForm({ releaseId: initialReleaseId }: ReleaseFormProps) {
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createReleaseAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isLoadingRelease, setIsLoadingRelease] = useState(!!initialReleaseId);
  const [releaseId, setReleaseId] = useState<string | null>(initialReleaseId || null);
  const [isPublished, setIsPublished] = useState(false);
  const [imagesReordered, setImagesReordered] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<GroupOption[]>([]);
  const isEditMode = releaseId !== null;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);

  const releaseForm = useForm<ReleaseFormData>({
    resolver: zodResolver(createReleaseSchema),
    defaultValues: {
      title: '',
      releasedOn: '',
      coverArt: '',
      formats: ['DIGITAL'],
      artistIds: [],
      groupIds: [],
      labels: '',
      catalogNumber: '',
      description: '',
      notes: '',
      executiveProducedBy: '',
      coProducedBy: '',
      masteredBy: '',
      mixedBy: '',
      recordedBy: '',
      artBy: '',
      designBy: '',
      photographyBy: '',
      linerNotesBy: '',
      publishedAt: '',
      featuredOn: '',
      featuredUntil: '',
      featuredDescription: '',
      createdBy: user?.id,
    },
  });
  const { control } = releaseForm;

  // Fetch release data when initialReleaseId is provided
  useEffect(() => {
    if (!initialReleaseId) return;

    const fetchRelease = async () => {
      try {
        setIsLoadingRelease(true);
        const response = await fetch(`/api/releases/${initialReleaseId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load release');
          return;
        }

        const release = await response.json();

        // Format dates for the form (YYYY-MM-DD format)
        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        // Reset form with fetched data
        releaseForm.reset({
          title: release.title || '',
          releasedOn: formatDate(release.releasedOn),
          coverArt: release.coverArt || '',
          formats: release.formats || ['DIGITAL'],
          artistIds: release.artistReleases?.map((ar: { artistId: string }) => ar.artistId) || [],
          groupIds: release.groupReleases?.map((gr: { groupId: string }) => gr.groupId) || [],
          labels: Array.isArray(release.labels) ? release.labels.join(', ') : '',
          catalogNumber: release.catalogNumber || '',
          description: release.description || '',
          notes: Array.isArray(release.notes) ? release.notes.join(', ') : '',
          executiveProducedBy: Array.isArray(release.executiveProducedBy)
            ? release.executiveProducedBy.join(', ')
            : '',
          coProducedBy: Array.isArray(release.coProducedBy) ? release.coProducedBy.join(', ') : '',
          masteredBy: Array.isArray(release.masteredBy) ? release.masteredBy.join(', ') : '',
          mixedBy: Array.isArray(release.mixedBy) ? release.mixedBy.join(', ') : '',
          recordedBy: Array.isArray(release.recordedBy) ? release.recordedBy.join(', ') : '',
          artBy: Array.isArray(release.artBy) ? release.artBy.join(', ') : '',
          designBy: Array.isArray(release.designBy) ? release.designBy.join(', ') : '',
          photographyBy: Array.isArray(release.photographyBy)
            ? release.photographyBy.join(', ')
            : '',
          linerNotesBy: Array.isArray(release.linerNotesBy) ? release.linerNotesBy.join(', ') : '',
          publishedAt: formatDate(release.publishedAt),
          featuredOn: formatDate(release.featuredOn),
          featuredUntil: formatDate(release.featuredUntil),
          featuredDescription: release.featuredDescription || '',
          createdBy: release.createdBy || user?.id,
        });

        // Set published state
        if (release.publishedAt) {
          setIsPublished(true);
        }

        // Load existing images if any
        if (release.images && release.images.length > 0) {
          const existingImages: ImageItem[] = release.images.map(
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
        error('Failed to fetch release:', err);
        toast.error('Failed to load release data');
      } finally {
        setIsLoadingRelease(false);
      }
    };

    fetchRelease();
  }, [initialReleaseId, releaseForm, user?.id]);

  const handleImagesChange = useCallback((newImages: ImageItem[]) => {
    setImages(newImages);
  }, []);

  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      setImagesReordered(true);

      if (!releaseId) {
        return;
      }

      const result = await reorderReleaseImagesAction(releaseId, imageIds);

      if (!result.success) {
        toast.error(result.error || 'Failed to save image order');
      }
    },
    [releaseId]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await deleteReleaseImageAction(imageId);

      if (!result.success) {
        toast.error(result.error || 'Failed to delete image');
      }

      return result;
    },
    []
  );

  const onSubmitReleaseForm = useCallback(
    async (data: ReleaseFormData) => {
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

          if (releaseId) {
            // Update existing release
            const newFormState = await updateReleaseAction(releaseId, formState, formData);
            if (newFormState.success) {
              // Upload any pending images
              const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
              if (imagesToUpload.length > 0) {
                await uploadImages(imagesToUpload, releaseId, title);
              }

              // Check if this was a publish action
              if (data.publishedAt && !isPublished) {
                setIsPublished(true);
                toast.success(<PublishedToastContent title={title} />);
              } else {
                toast.success(<UpdatedToastContent title={title} />);
              }
              releaseForm.reset(data);
              setImagesReordered(false);
            } else {
              toast.error('Failed to update release. Please check the form for errors.');
            }
          } else {
            // Create new release
            const newFormState = await createReleaseAction(formState, formData);
            if (newFormState.success) {
              const createdReleaseId = newFormState.data?.releaseId as string | undefined;

              if (createdReleaseId) {
                setReleaseId(createdReleaseId);
                router.replace(`/admin/releases/${createdReleaseId}`, { scroll: false });

                if (data.publishedAt) {
                  setIsPublished(true);
                }

                // Upload images if any were added
                const imagesToUpload = images.filter((img) => img.file && !img.uploadedUrl);
                if (imagesToUpload.length > 0) {
                  await uploadImages(imagesToUpload, createdReleaseId, title);
                } else {
                  toast.success(<ToastContent title={title} />);
                }

                releaseForm.reset(data);
                setImagesReordered(false);
              } else {
                toast.success(<ToastContent title={title} />);
              }
            } else {
              toast.error('Failed to create release. Please check the form for errors.');
            }
          }
        } else {
          error('ReleaseForm: Form reference is null on submit.');
          toast.error('Please refresh the page and try again, or check back later.');
        }
      });
    },
    [formState, images, releaseId, isPublished, releaseForm, router]
  );

  const uploadImages = async (
    imagesToUpload: ImageItem[],
    targetReleaseId: string,
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
        'releases',
        targetReleaseId,
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

      const registerResult = await registerReleaseImagesAction(targetReleaseId, imageInfos);

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
            Release <b>{title}</b> saved with {registerResult.data.length} image
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

  const _title = useWatch({ control, name: 'title' });
  const formats = useWatch({ control, name: 'formats' });
  const watchedArtistIds = useWatch({ control, name: 'artistIds' }) as string[] | undefined;

  const handleSelectDate = (dateString: string, fieldName: string): void => {
    releaseForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
  };

  const formatValidationErrors = useCallback((errors: Record<string, { message?: string }>) => {
    const errorMessages = Object.entries(errors)
      .map(([field, err]) => `${field}: ${err.message || 'Invalid'}`)
      .join(', ');
    return errorMessages || 'Please check the form for errors.';
  }, []);

  const handleClickPublishButton = useCallback(() => {
    releaseForm.setValue('publishedAt', new Date().toISOString(), { shouldDirty: true });
    releaseForm.handleSubmit(onSubmitReleaseForm, (errors) => {
      console.error('Form validation errors:', errors);
      toast.error(formatValidationErrors(errors));
    })();
  }, [releaseForm, onSubmitReleaseForm, formatValidationErrors]);

  const handleFormatChange = useCallback(
    (format: Format, checked: boolean) => {
      const currentFormats = (formats || []) as string[];
      let newFormats: string[];

      if (checked) {
        newFormats = [...currentFormats, format];
      } else {
        newFormats = currentFormats.filter((f) => f !== format);
      }

      // Ensure at least one format is selected
      if (newFormats.length === 0) {
        newFormats = ['DIGITAL'];
      }

      releaseForm.setValue('formats', newFormats, { shouldDirty: true });
    },
    [formats, releaseForm]
  );

  const hasPendingImages = images.some((img) => img.file && !img.uploadedUrl);
  const isDirty = releaseForm.formState.isDirty || imagesReordered || hasPendingImages;

  if (!releaseForm || !control || isLoadingRelease) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialReleaseId ? 'Edit Release' : 'Create New Release'}</CardTitle>
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
            anchorText: isEditMode ? 'Edit Release' : 'Create Release',
            url: '/admin/releases',
            isActive: true,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? 'Edit Release' : 'Create New Release'}</CardTitle>
          <CardDescription>
            {isEditMode
              ? 'Update release information. Changes are saved when you click Save.'
              : 'Required fields are marked with an asterisk *'}
          </CardDescription>
        </CardHeader>
        <Form {...releaseForm}>
          <form
            action={formAction}
            ref={formRef}
            onSubmit={releaseForm.handleSubmit(onSubmitReleaseForm, (errors) => {
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="title"
                    label="Title *"
                    placeholder="Release title"
                  />
                  <TextField
                    control={control}
                    name="catalogNumber"
                    label="Catalog Number"
                    placeholder="e.g., CAT-001"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={control}
                    name="releasedOn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Release Date *</FormLabel>
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
                  <TextField
                    control={control}
                    name="labels"
                    label="Labels"
                    placeholder="Label names (comma-separated)"
                  />
                </div>
                <ArtistMultiSelect
                  control={control}
                  name="artistIds"
                  label={
                    <>
                      <b>Artists: </b>{' '}
                      <span className="text-muted text-sm">
                        (and/or add one or more Groups below)
                      </span>
                    </>
                  }
                  placeholder="Select artists..."
                  searchPlaceholder="Search artists..."
                  emptyMessage="No artists found."
                  setValue={releaseForm.setValue}
                  releaseId={releaseId}
                  disabled={isSubmitting}
                />
                <GroupMultiSelect
                  control={control}
                  name="groupIds"
                  label="Groups"
                  placeholder="Select groups..."
                  searchPlaceholder="Search groups..."
                  emptyMessage="No groups found."
                  setValue={releaseForm.setValue}
                  releaseId={releaseId}
                  disabled={isSubmitting}
                  onGroupsChange={setSelectedGroups}
                />
                {/* Display artists from selected groups */}
                {selectedGroups.length > 0 &&
                  selectedGroups.some((g) => g.artistGroups && g.artistGroups.length > 0) && (
                    <div className="rounded-md border p-3 text-sm">
                      {selectedGroups
                        .filter((g) => g.artistGroups && g.artistGroups.length > 0)
                        .map((group, index, filteredGroups) => {
                          const groupName = group.displayName || group.name;
                          const artistNames =
                            group.artistGroups?.map((ag) => {
                              if (ag.artist.displayName) {
                                return ag.artist.displayName;
                              }
                              const parts = [ag.artist.firstName, ag.artist.surname].filter(
                                Boolean
                              );
                              return parts.join(' ') || 'Unknown Artist';
                            }) || [];
                          const isLast = index === filteredGroups.length - 1;
                          return (
                            <span key={group.id}>
                              <span className="font-medium">{groupName}:</span>{' '}
                              {artistNames.join(', ')}
                              {!isLast && '; '}
                            </span>
                          );
                        })}
                    </div>
                  )}
                <CoverArtField
                  control={control}
                  name="coverArt"
                  setValue={releaseForm.setValue}
                  artistIds={watchedArtistIds || []}
                  disabled={isSubmitting}
                />
                <FormField
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Release description"
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              {/* Formats Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Formats *</h2>
                <FormDescription>Select all formats this release is available in.</FormDescription>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {Object.entries(FORMAT_GROUPS).map(([groupName, groupFormats]) => (
                    <div key={groupName} className="space-y-3">
                      <h3 className="text-2xl font-medium text-foreground">{groupName}</h3>
                      <div className="space-y-4">
                        {groupFormats.map((format) => (
                          <div key={format} className="flex items-center justify-between">
                            <label
                              htmlFor={`format-${format}`}
                              className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {formatDisplayName(format)}
                            </label>
                            <Switch
                              id={`format-${format}`}
                              checked={formats?.includes(format) || false}
                              onCheckedChange={(checked) =>
                                handleFormatChange(format, checked as boolean)
                              }
                              disabled={isSubmitting}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Show all other formats in a collapsible section */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    Show all formats ({Object.keys(FORMATS).length} total)
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                    {Object.values(FORMATS)
                      .filter(
                        (format) =>
                          !FORMAT_GROUPS.Digital.includes(format as Format) &&
                          !FORMAT_GROUPS.Vinyl.includes(format as Format) &&
                          !FORMAT_GROUPS.Physical.includes(format as Format)
                      )
                      .map((format) => (
                        <div key={format} className="flex items-center justify-between">
                          <label
                            htmlFor={`format-${format}`}
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {formatDisplayName(format)}
                          </label>
                          <Switch
                            id={`format-${format}`}
                            checked={formats?.includes(format) || false}
                            onCheckedChange={(checked) =>
                              handleFormatChange(format as Format, checked as boolean)
                            }
                            disabled={isSubmitting}
                          />
                        </div>
                      ))}
                  </div>
                </details>
              </section>

              <Separator />

              {/* Images Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Images</h2>
                <p className="text-sm text-muted-foreground">
                  Add images for this release. You can drag to reorder them. Images will be uploaded
                  after the release is created or updated.
                </p>
                <ImageUploader
                  images={images}
                  onImagesChange={handleImagesChange}
                  onReorder={handleReorder}
                  onDelete={handleDeleteImage}
                  maxImages={20}
                  disabled={isSubmitting}
                  label="Upload release images"
                />
              </section>

              <Separator />

              {/* Credits Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Credits</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="executiveProducedBy"
                    label="Executive Produced By"
                    placeholder="Names (comma-separated)"
                  />
                  <TextField
                    control={control}
                    name="coProducedBy"
                    label="Co-Produced By"
                    placeholder="Names (comma-separated)"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="masteredBy"
                    label="Mastered By"
                    placeholder="Names (comma-separated)"
                  />
                  <TextField
                    control={control}
                    name="mixedBy"
                    label="Mixed By"
                    placeholder="Names (comma-separated)"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="recordedBy"
                    label="Recorded By"
                    placeholder="Names (comma-separated)"
                  />
                  <TextField
                    control={control}
                    name="linerNotesBy"
                    label="Liner Notes By"
                    placeholder="Names (comma-separated)"
                  />
                </div>
              </section>

              <Separator />

              {/* Artwork Credits Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Artwork Credits</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={control}
                    name="artBy"
                    label="Art By"
                    placeholder="Names (comma-separated)"
                  />
                  <TextField
                    control={control}
                    name="designBy"
                    label="Design By"
                    placeholder="Names (comma-separated)"
                  />
                </div>
                <TextField
                  control={control}
                  name="photographyBy"
                  label="Photography By"
                  placeholder="Names (comma-separated)"
                />
              </section>

              <Separator />

              {/* Notes Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Notes</h2>
                <FormField
                  control={control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Release Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes (comma-separated for multiple)"
                          className="min-h-20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {isEditMode && (
                <>
                  <Separator />

                  {/* Featured Section - Edit mode only */}
                  <section className="space-y-4">
                    <h2 className="font-semibold">Featured Settings</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={control}
                        name="featuredOn"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Featured On</FormLabel>
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
                        name="featuredUntil"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Featured Until</FormLabel>
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
                    <TextField
                      control={control}
                      name="featuredDescription"
                      label="Featured Description"
                      placeholder="Special description when featured"
                    />
                  </section>
                </>
              )}
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
