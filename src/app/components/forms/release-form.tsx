/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useEntitySubmit } from '@/app/components/forms/_hooks/use-entity-submit';
import type {
  ExistingFormat,
  ExtractedAudioMetadata,
  ReleaseAutoCreatedPayload,
} from '@/app/components/forms/digital-formats/types';
import { useImageOperations } from '@/app/components/forms/hooks/use-image-operations';
import { ReleaseFormContent } from '@/app/components/forms/sections/release-form-content';
import { ReleaseFormFooter } from '@/app/components/forms/sections/release-form-footer';
import { ReleaseCardHeader } from '@/app/components/forms/sections/release-form-header';
import { ReleaseFormSkeleton } from '@/app/components/forms/sections/release-form-skeleton';
import { Card } from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import { type ImageItem } from '@/app/components/ui/image-uploader';
import {
  useCreateReleaseMutation,
  useDeleteReleaseMutation,
  useUpdateReleaseCoverArtMutation,
  useUpdateReleaseMutation,
} from '@/hooks/mutations/use-release-mutations';
import { type ReleaseDetail, useReleaseDetailQuery } from '@/hooks/use-release-query';
import { useSession } from '@/hooks/use-session';
import { registerReleaseImagesAction } from '@/lib/actions/register-image-actions';
import {
  deleteReleaseImageAction,
  reorderReleaseImagesAction,
} from '@/lib/actions/release-image-actions';
import { type DigitalFormatType } from '@/lib/constants/digital-formats';
import { type FormState } from '@/lib/types/form-state';
import { type Format } from '@/lib/types/media-models';
import { error } from '@/lib/utils/console-logger';
import { generateObjectId } from '@/lib/utils/generate-object-id';
import { createReleaseSchema } from '@/lib/validation/create-release-schema';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';
import { ZinePanel } from '@/ui/zine-panel';

import type { UseFormReturn, UseFormSetValue } from 'react-hook-form';

type FormFieldName = keyof ReleaseFormData;

export interface ReleaseFormProps {
  releaseId?: string;
}

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

const formatDateForForm = (dateValue: string | Date | null | undefined): string => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

/** Project a loaded release into the form's default values (pure mapping). */
const mapReleaseToFormValues = (release: ReleaseDetail, userId?: string): ReleaseFormData => ({
  title: release.title || '',
  releasedOn: formatDateForForm(release.releasedOn),
  coverArt: release.coverArt || '',
  formats: release.formats.length > 0 ? release.formats : ['DIGITAL'],
  artistIds: release.artistReleases.map((ar) => ar.artistId),
  labels: release.labels.join(', '),
  catalogNumber: release.catalogNumber || '',
  description: release.description || '',
  notes: release.notes.join(', '),
  executiveProducedBy: release.executiveProducedBy.join(', '),
  coProducedBy: release.coProducedBy.join(', '),
  masteredBy: release.masteredBy.join(', '),
  mixedBy: release.mixedBy.join(', '),
  recordedBy: release.recordedBy.join(', '),
  artBy: release.artBy.join(', '),
  designBy: release.designBy.join(', '),
  photographyBy: release.photographyBy.join(', '),
  linerNotesBy: release.linerNotesBy.join(', '),
  publishedAt: formatDateForForm(release.publishedAt),
  featuredOn: formatDateForForm(release.featuredOn),
  featuredUntil: formatDateForForm(release.featuredUntil),
  featuredDescription: release.featuredDescription || '',
  suggestedPrice: release.suggestedPrice ? (release.suggestedPrice / 100).toFixed(2) : '',
  createdBy: userId,
});

/** Map a loaded release's persisted images into uploader items. */
const mapReleaseImages = (release: ReleaseDetail): ImageItem[] =>
  release.images.map((img) => ({
    id: img.id,
    preview: img.src ?? '',
    uploadedUrl: img.src ?? '',
    caption: img.caption || '',
    altText: img.altText || '',
    sortOrder: img.sortOrder ?? 0,
  }));

/** Derive the accordion's existing-formats list from a loaded release. */
const mapExistingFormats = (releaseData: ReleaseDetail | null | undefined): ExistingFormat[] =>
  (releaseData?.digitalFormats ?? [])
    .filter((df) => df.deletedAt == null)
    .map((df) => ({
      formatType: df.formatType as DigitalFormatType,
      trackCount: df.trackCount ?? df.files.length,
      totalFileSize: Number(df.totalFileSize ?? 0),
      files: df.files.map((f) => ({
        trackNumber: f.trackNumber,
        title: f.title ?? null,
        fileName: f.fileName,
        fileSize: Number(f.fileSize),
        duration: f.duration ?? null,
      })),
    }));

/** Build the create-mode default form values (only `createdBy` is dynamic). */
const buildReleaseDefaults = (userId: string | undefined): ReleaseFormData => ({
  title: '',
  releasedOn: '',
  coverArt: '',
  formats: ['DIGITAL'],
  artistIds: [],
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
  suggestedPrice: '',
  createdBy: userId,
});

const formatValidationErrors = (errors: Record<string, { message?: string }>): string => {
  const errorMessages = Object.entries(errors)
    .map(([field, err]) => `${field}: ${err.message || 'Invalid'}`)
    .join(', ');
  return errorMessages || 'Please check the form for errors.';
};

/** Pre-populate release fields from audio metadata extracted on first upload. */
const applyExtractedMetadata = (
  metadata: ExtractedAudioMetadata,
  setValue: UseFormSetValue<ReleaseFormData>
): void => {
  if (metadata.album) {
    setValue('title', metadata.album, { shouldDirty: true });
  }
  if (metadata.year) {
    setValue('releasedOn', `${metadata.year}-01-01`, { shouldDirty: true });
  }
  if (metadata.label) {
    setValue('labels', metadata.label, { shouldDirty: true });
  }
  if (metadata.coverArt) {
    setValue('coverArt', metadata.coverArt, { shouldDirty: true });
  }
  const detectedArtist = metadata.albumArtist ?? metadata.artist;
  if (detectedArtist) {
    toast.success(`Artist "${detectedArtist}" auto-connected to this release.`);
  }
};

const pendingImages = (images: ImageItem[]): ImageItem[] =>
  images.filter((img) => img.file && !img.uploadedUrl);

interface SubmittingState {
  isCreatingRelease: boolean;
  isUpdatingRelease: boolean;
  isTransitionPending: boolean;
  isUploadingImages: boolean;
}

const computeIsSubmitting = ({
  isCreatingRelease,
  isUpdatingRelease,
  isTransitionPending,
  isUploadingImages,
}: SubmittingState): boolean =>
  isCreatingRelease || isUpdatingRelease || isTransitionPending || isUploadingImages;

const computeIsDirty = (
  formIsDirty: boolean,
  imagesReordered: boolean,
  hasPendingImages: boolean
): boolean => formIsDirty || imagesReordered || hasPendingImages;

/** Toggle a format in the list, falling back to DIGITAL when none remain. */
const computeNextFormats = (
  current: string[] | undefined,
  format: Format,
  checked: boolean
): string[] => {
  const currentFormats = current ?? [];
  const newFormats = checked
    ? [...currentFormats, format]
    : currentFormats.filter((f) => f !== format);
  return newFormats.length === 0 ? ['DIGITAL'] : newFormats;
};

const SavedWithImagesToast = ({ title, count }: { title: string; count: number }) => (
  <>
    Release <b>{title}</b> saved with {count} image{count !== 1 ? 's' : ''}.
  </>
);

/**
 * Edit mode only: persist the new cover art to the release row immediately
 * (after S3 upload + variant generation). Avoids losing the cover if the user
 * navigates away before submitting the full form. For new releases there's no
 * row to update yet — the create flow saves it on form submit.
 */
const persistReleaseCoverArt = async (
  releaseId: string | null,
  cdnUrl: string,
  updateCoverArt: ReturnType<typeof useUpdateReleaseCoverArtMutation>['updateReleaseCoverArtAsync']
): Promise<void> => {
  if (!releaseId) return;
  const result = await updateCoverArt({ releaseId, coverArt: cdnUrl });
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to save cover art');
  }
};

interface ApplyLoadedReleaseTarget {
  releaseForm: UseFormReturn<ReleaseFormData>;
  userId: string | undefined;
  setIsPublished: (value: boolean) => void;
  setImages: (images: ImageItem[]) => void;
}

/** Project a loaded release into form/image/publish state (edit mode load). */
const applyLoadedRelease = (
  releaseData: ReleaseDetail,
  { releaseForm, userId, setIsPublished, setImages }: ApplyLoadedReleaseTarget
): void => {
  releaseForm.reset(mapReleaseToFormValues(releaseData, userId));
  if (releaseData.publishedAt) {
    setIsPublished(true);
  }
  if (releaseData.images.length > 0) {
    setImages(mapReleaseImages(releaseData));
  }
};

export const ReleaseForm = ({
  releaseId: initialReleaseId,
}: ReleaseFormProps): React.ReactElement => {
  const [isTransitionPending, startTransition] = useTransition();
  const { createReleaseAsync, isCreatingRelease } = useCreateReleaseMutation();
  const { updateReleaseAsync, isUpdatingRelease } = useUpdateReleaseMutation();
  const { updateReleaseCoverArtAsync } = useUpdateReleaseCoverArtMutation();
  const { deleteReleaseAsync } = useDeleteReleaseMutation();
  const [releaseId, setReleaseId] = useState<string | null>(initialReleaseId || null);
  const [isPublished, setIsPublished] = useState(false);
  const isEditMode = releaseId !== null;

  // Pre-generate a MongoDB ObjectId so digital format uploads can begin before the release
  // is saved. In edit mode this equals initialReleaseId; in create mode it enables immediate
  // uploads whose DB confirms are flushed after createReleaseAction succeeds.
  const [preGeneratedId] = useState<string>(() => initialReleaseId ?? generateObjectId());

  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);

  const images = useImageOperations({
    entityType: 'releases',
    entityId: releaseId,
    reorderAction: reorderReleaseImagesAction,
    deleteAction: deleteReleaseImageAction,
  });

  const releaseForm = useForm<ReleaseFormData>({
    resolver: zodResolver(createReleaseSchema),
    defaultValues: buildReleaseDefaults(user?.id),
  });
  const { control, setValue } = releaseForm;

  // Fetch release data when initialReleaseId is provided. The gated hook owns
  // the request lifecycle; the effects below project its data/error into form
  // state, preserving the original side effects (reset, publish flag, images).
  // Existing digital formats are derived synchronously instead (see below).
  const {
    data: releaseData,
    isPending: isReleasePending,
    isError: isReleaseError,
    error: releaseError,
  } = useReleaseDetailQuery(initialReleaseId ?? '', { enabled: !!initialReleaseId });

  // In edit mode the form is "loading" until the gated query resolves; in
  // create mode there's nothing to load.
  const isLoadingRelease = !!initialReleaseId && isReleasePending;

  // Existing digital formats are DERIVED from the loaded release, not projected
  // into state via an effect. `DigitalFormatsAccordion` snapshots `existingFormats`
  // into its own state at mount (one-time `useState` initializers), so it must
  // receive the final list on the same render it first mounts — i.e. the render
  // the loading gate opens. Setting it in an effect would populate it one render
  // late, after the accordion has already mounted empty, and the "uploaded"
  // checkmarks would never appear.
  const existingFormats = useMemo(() => mapExistingFormats(releaseData), [releaseData]);

  const { setImages } = images;
  useEffect(() => {
    if (!initialReleaseId || !releaseData) return;
    applyLoadedRelease(releaseData, { releaseForm, userId: user?.id, setIsPublished, setImages });
  }, [initialReleaseId, releaseData, releaseForm, user?.id, setImages]);

  // Surface a load failure (edit mode only) without unmounting the form.
  useEffect(() => {
    if (initialReleaseId && isReleaseError) {
      error('Failed to fetch release:', releaseError);
      toast.error('Failed to load release data');
    }
  }, [initialReleaseId, isReleaseError, releaseError]);

  const uploadImages = useCallback(
    (imagesToUpload: ImageItem[], targetReleaseId: string, title: string): Promise<void> =>
      images.uploadImages(imagesToUpload, targetReleaseId, {
        register: registerReleaseImagesAction,
        onSuccess: (uploaded) =>
          toast.success(<SavedWithImagesToast title={title} count={uploaded.length} />),
      }),
    [images]
  );

  const resetReleaseForm = useCallback(
    (values: ReleaseFormData): void => releaseForm.reset(values),
    [releaseForm]
  );

  const createRelease = useCallback(
    (values: ReleaseFormData): Promise<FormState> =>
      createReleaseAsync({ ...values, preGeneratedId }),
    [createReleaseAsync, preGeneratedId]
  );

  const updateRelease = useCallback(
    (id: string, values: ReleaseFormData): Promise<FormState> => updateReleaseAsync({ id, values }),
    [updateReleaseAsync]
  );

  /**
   * Everything the release form does once the write has landed: flush any images
   * the user staged before saving, adopt the id a create returned and route to
   * its edit page, flip the published flag, and announce the outcome. Awaited by
   * `useEntitySubmit` before the form resets, so the image upload still lands
   * ahead of the success toast the way it did before.
   *
   * Branches on `releaseId` rather than the hook's `mode` because the update path
   * needs the id itself as the upload target — they are the same signal, since
   * the hook derives `mode` from exactly this value.
   */
  const onReleaseSubmitSuccess = useCallback(
    async (newFormState: FormState, data: ReleaseFormData): Promise<void> => {
      const title = data.title;

      if (releaseId) {
        const staged = pendingImages(images.images);
        if (staged.length > 0) {
          await uploadImages(staged, releaseId, title);
        }
        if (data.publishedAt && !isPublished) {
          setIsPublished(true);
          toast.success(<PublishedToastContent title={title} />);
        } else {
          toast.success(<UpdatedToastContent title={title} />);
        }
        images.resetImagesReordered();
        return;
      }

      const createdReleaseId = newFormState.data?.releaseId as string | undefined;
      if (!createdReleaseId) {
        toast.success(<ToastContent title={title} />);
        return;
      }

      setReleaseId(createdReleaseId);
      router.replace(`/admin/releases/${createdReleaseId}`, { scroll: false });
      if (data.publishedAt) {
        setIsPublished(true);
      }

      // The image upload announces itself via `SavedWithImagesToast`, so the
      // plain "created" toast is only for a release saved without new images.
      const staged = pendingImages(images.images);
      if (staged.length > 0) {
        await uploadImages(staged, createdReleaseId, title);
      } else {
        toast.success(<ToastContent title={title} />);
      }
      images.resetImagesReordered();
    },
    [images, uploadImages, releaseId, isPublished, router]
  );

  const submitRelease = useEntitySubmit<ReleaseFormData, FormState>({
    entity: 'release',
    reset: resetReleaseForm,
    create: createRelease,
    update: updateRelease,
    onSuccess: onReleaseSubmitSuccess,
  });

  const onSubmitReleaseForm = useCallback(
    async (data: ReleaseFormData): Promise<void> => {
      startTransition(() => submitRelease(formRef.current, releaseId, data));
    },
    [submitRelease, releaseId]
  );

  const isSubmitting = computeIsSubmitting({
    isCreatingRelease,
    isUpdatingRelease,
    isTransitionPending,
    isUploadingImages: images.isUploadingImages,
  });

  const formats = useWatch({ control, name: 'formats' });
  const watchedArtistIds = useWatch({ control, name: 'artistIds' }) as string[] | undefined;

  const handleSelectDate = useCallback(
    (dateString: string, fieldName: string): void => {
      releaseForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
    },
    [releaseForm]
  );

  const handleReleaseAutoCreated = useCallback(
    (result: ReleaseAutoCreatedPayload): void => {
      router.replace(`/admin/releases/${result.releaseId}`, { scroll: false });
    },
    [router]
  );

  const handleMetadataExtracted = useCallback(
    (metadata: ExtractedAudioMetadata): void => applyExtractedMetadata(metadata, setValue),
    [setValue]
  );

  const onInvalidSubmit = useCallback((errors: Record<string, { message?: string }>): void => {
    console.error('Form validation errors:', errors);
    toast.error(formatValidationErrors(errors));
  }, []);

  const submitForm = releaseForm.handleSubmit(onSubmitReleaseForm, onInvalidSubmit);

  const handleClickPublishButton = useCallback(() => {
    releaseForm.setValue('publishedAt', new Date().toISOString(), { shouldDirty: true });
    releaseForm.handleSubmit(onSubmitReleaseForm, onInvalidSubmit)();
  }, [releaseForm, onSubmitReleaseForm, onInvalidSubmit]);

  const handleFormatChange = useCallback(
    (format: Format, checked: boolean) => {
      releaseForm.setValue('formats', computeNextFormats(formats, format, checked), {
        shouldDirty: true,
      });
    },
    [formats, releaseForm]
  );

  const persistCoverArt = useCallback(
    (cdnUrl: string): Promise<void> =>
      persistReleaseCoverArt(releaseId, cdnUrl, updateReleaseCoverArtAsync),
    [releaseId, updateReleaseCoverArtAsync]
  );
  const onCoverArtUploadComplete = releaseId ? persistCoverArt : undefined;

  const isDirty = computeIsDirty(
    releaseForm.formState.isDirty,
    images.imagesReordered,
    images.hasPendingImages
  );

  if (isLoadingRelease) {
    return <ReleaseFormSkeleton isEditMode={!!initialReleaseId} />;
  }

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        {
          anchorText: isEditMode ? 'Edit Release' : 'Create Release',
          url: '/admin/releases',
          isActive: true,
        },
      ]}
    >
      <Card className="w-full border-none px-0 pb-0">
        <ReleaseCardHeader isEditMode={isEditMode} />
        <Form {...releaseForm}>
          <form ref={formRef} onSubmit={submitForm} noValidate>
            <ReleaseFormContent
              control={control}
              setValue={setValue}
              isSubmitting={isSubmitting}
              isEditMode={isEditMode}
              initialReleaseId={initialReleaseId}
              releaseId={releaseId}
              preGeneratedId={preGeneratedId}
              existingFormats={existingFormats}
              formats={formats}
              watchedArtistIds={watchedArtistIds}
              images={images.images}
              onSelectDate={handleSelectDate}
              onCoverArtUploadComplete={onCoverArtUploadComplete}
              onFormatChange={handleFormatChange}
              onReleaseAutoCreated={handleReleaseAutoCreated}
              onMetadataExtracted={handleMetadataExtracted}
              onImagesChange={images.handleImagesChange}
              onReorder={images.handleReorder}
              onDelete={images.handleDeleteImage}
            />

            <ReleaseFormFooter
              isEditMode={isEditMode}
              releaseId={releaseId}
              isPublished={isPublished}
              isSubmitting={isSubmitting}
              isDirty={isDirty}
              onPublish={handleClickPublishButton}
              onDelete={() => deleteReleaseAsync({ releaseId: releaseId ?? '' })}
            />
          </form>
        </Form>
      </Card>
    </ZinePanel>
  );
};
