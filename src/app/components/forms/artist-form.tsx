/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useImageOperations } from '@/app/components/forms/hooks/use-image-operations';
import { ArtistBioSection } from '@/app/components/forms/sections/artist-bio-section';
import { ArtistFormFooter } from '@/app/components/forms/sections/artist-form-footer';
import { ArtistFormHeader } from '@/app/components/forms/sections/artist-form-header';
import { ArtistFormSkeleton } from '@/app/components/forms/sections/artist-form-skeleton';
import { ArtistImagesSection } from '@/app/components/forms/sections/artist-images-section';
import { ArtistMusicAndDatesSection } from '@/app/components/forms/sections/artist-music-dates-section';
import { ArtistNameSection } from '@/app/components/forms/sections/artist-name-section';
import { uploadBioImage } from '@/app/components/forms/utils/upload-bio-image';
import { Form } from '@/app/components/ui/form';
import { type ImageItem } from '@/app/components/ui/image-uploader';
import type {
  RichTextEditorImage,
  RichTextEditorUploadHandler,
} from '@/app/components/ui/rich-text-editor';
import { Separator } from '@/app/components/ui/separator';
import {
  useArchiveArtistMutation,
  useCreateArtistMutation,
  useUpdateArtistMutation,
} from '@/app/hooks/mutations/use-artist-mutations';
import { type ArtistDetail, useArtistQuery } from '@/app/hooks/use-artist-query';
import { useSession } from '@/hooks/use-session';
import {
  deleteArtistImageAction,
  reorderArtistImagesAction,
} from '@/lib/actions/artist-image-actions';
import { registerArtistImagesAction } from '@/lib/actions/register-image-actions';
import { queryKeys } from '@/lib/query-keys';
import { error } from '@/lib/utils/console-logger';
import { generateSlug } from '@/lib/utils/generate-slug';
import { plainTextToBioHtml } from '@/lib/utils/plain-text-to-bio-html';
import { type GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';
import { ZinePanel } from '@/ui/zine-panel';

import type { UseFormReturn } from 'react-hook-form';

type FormFieldName = keyof ArtistFormData;

interface ArtistFormProps {
  artistId?: string;
  /**
   * Where to navigate after a successful create. Used by the create-from-release
   * flow to return to the originating release instead of the new artist's edit
   * page. Ignored in edit mode.
   */
  returnTo?: string;
}

/**
 * Validates a URL slug (lowercase alphanumeric segments joined by single
 * dashes, with no leading/trailing/double dashes). Implemented with a single
 * character-class quantifier plus boundary checks to avoid the catastrophic
 * backtracking risk of a nested-quantifier pattern.
 */
const isValidSlug = (value: string): boolean =>
  /^[a-z0-9-]+$/.test(value) &&
  !value.startsWith('-') &&
  !value.endsWith('-') &&
  !value.includes('--');

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

const CreatedWithImagesToast = ({ fullName, count }: { fullName: string; count: number }) => (
  <>
    Artist <b>{fullName}</b> created with {count} image{count !== 1 ? 's' : ''}.
  </>
);

const formatDateForForm = (dateValue: Date | null): string => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

/** Coalesce a nullable string field to the empty-string default the form uses. */
const orEmpty = (value: string | null | undefined): string => value ?? '';

/** Project a loaded artist record into the form's default values (pure mapping). */
const mapArtistToFormValues = (
  {
    firstName,
    middleName,
    surname,
    akaNames,
    displayName,
    title,
    suffix,
    slug,
    bio,
    shortBio,
    altBio,
    genres,
    tags,
    bornOn,
    diedOn,
    formedOn,
    publishedOn,
    createdBy,
  }: ArtistDetail,
  userId?: string
): ArtistFormData => ({
  firstName: orEmpty(firstName),
  middleName: orEmpty(middleName),
  surname: orEmpty(surname),
  akaNames: orEmpty(akaNames),
  displayName: orEmpty(displayName),
  title: orEmpty(title),
  suffix: orEmpty(suffix),
  slug: orEmpty(slug),
  // Convert legacy plain-text bios to HTML so the rich-text editor preserves
  // their line breaks instead of collapsing them.
  bio: plainTextToBioHtml(bio),
  shortBio: plainTextToBioHtml(shortBio),
  altBio: plainTextToBioHtml(altBio),
  genres: orEmpty(genres),
  tags: orEmpty(tags),
  bornOn: formatDateForForm(bornOn),
  diedOn: formatDateForForm(diedOn),
  formedOn: formatDateForForm(formedOn),
  publishedOn: formatDateForForm(publishedOn),
  createdBy: createdBy || userId,
});

/** Map a loaded artist's persisted images into uploader items. */
const mapArtistImages = (artist: ArtistDetail): ImageItem[] =>
  artist.images.map(({ id, src, caption, altText, sortOrder }) => ({
    id,
    preview: src ?? '',
    uploadedUrl: src ?? '',
    caption: caption || '',
    altText: altText || '',
    sortOrder: sortOrder ?? 0,
  }));

/** Build the create-mode default form values (only `createdBy` is dynamic). */
const buildArtistDefaults = (userId: string | undefined): ArtistFormData => ({
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
  formedOn: '',
  createdBy: userId,
  publishedOn: '',
});

/**
 * Images selectable in the bio editor: uploaded artist images plus re-hosted bio
 * images, deduped by URL (uploaded first).
 */
const computeBioEditorImages = (
  images: ImageItem[],
  bioPickerImages: RichTextEditorImage[]
): RichTextEditorImage[] => {
  const seen = new Set<string>();
  const collected: RichTextEditorImage[] = [];
  for (const image of images) {
    const url = image.uploadedUrl;
    if (url && !seen.has(url)) {
      seen.add(url);
      collected.push({ url, alt: image.altText ?? '' });
    }
  }
  for (const image of bioPickerImages) {
    if (!seen.has(image.url)) {
      seen.add(image.url);
      collected.push(image);
    }
  }
  return collected;
};

/** Derive the slug source from the name fields (display name wins). */
const deriveSlugSource = (
  displayName: string | undefined,
  firstName: string | undefined,
  middleName: string | undefined,
  surname: string | undefined
): string => {
  if (displayName?.trim()) {
    return displayName.trim();
  }
  return [firstName?.trim(), middleName?.trim(), surname?.trim()].filter(Boolean).join(' ');
};

/** firstName/surname are only required when both displayName and akaNames are empty. */
const computeIsNameRequired = (
  displayName: string | undefined,
  akaNames: string | undefined
): boolean => !displayName?.trim() && !akaNames?.trim();

const formatValidationErrors = (errors: Record<string, { message?: string }>): string => {
  const errorMessages = Object.entries(errors)
    .map(([field, err]) => `${field}: ${err.message || 'Invalid'}`)
    .join(', ');
  return errorMessages || 'Please check the form for errors.';
};

interface SubmittingState {
  isCreatingArtist: boolean;
  isUpdatingArtist: boolean;
  isTransitionPending: boolean;
  isUploadingImages: boolean;
}

const computeIsSubmitting = ({
  isCreatingArtist,
  isUpdatingArtist,
  isTransitionPending,
  isUploadingImages,
}: SubmittingState): boolean =>
  isCreatingArtist || isUpdatingArtist || isTransitionPending || isUploadingImages;

const computeIsDirty = (
  formIsDirty: boolean,
  imagesReordered: boolean,
  hasPendingImages: boolean
): boolean => formIsDirty || imagesReordered || hasPendingImages;

const fullNameOf = (data: ArtistFormData): string =>
  data.displayName || `${data.firstName} ${data.surname}`.trim();

const pendingImages = (images: ImageItem[]): ImageItem[] =>
  images.filter((img) => img.file && !img.uploadedUrl);

interface SubmitArtistDeps {
  artistForm: UseFormReturn<ArtistFormData>;
  images: ReturnType<typeof useImageOperations>;
  isPublished: boolean;
  setIsPublished: (value: boolean) => void;
  setArtistId: (id: string) => void;
  createArtistAsync: ReturnType<typeof useCreateArtistMutation>['createArtistAsync'];
  updateArtistAsync: ReturnType<typeof useUpdateArtistMutation>['updateArtistAsync'];
}

const submitArtistUpdate = async (
  artistId: string,
  data: ArtistFormData,
  deps: SubmitArtistDeps
): Promise<void> => {
  const { artistForm, images, isPublished, setIsPublished, updateArtistAsync } = deps;
  const fullName = fullNameOf(data);

  const newFormState = await updateArtistAsync({ id: artistId, values: data });
  if (!newFormState.success) {
    toast.error('Failed to update artist. Please check the form for errors.');
    return;
  }

  const imagesToUpload = pendingImages(images.images);
  if (imagesToUpload.length > 0) {
    await images.uploadImages(imagesToUpload, artistId, {
      register: registerArtistImagesAction,
      mergeStrategy: 'counter',
      onSuccess: () => {},
    });
  }

  if (data.publishedOn && !isPublished) {
    setIsPublished(true);
    toast.success(<PublishedToastContent fullName={fullName} />);
  } else {
    toast.success(<UpdatedToastContent fullName={fullName} />);
  }
  artistForm.reset(data);
  images.resetImagesReordered();
};

const submitArtistCreate = async (data: ArtistFormData, deps: SubmitArtistDeps): Promise<void> => {
  const { artistForm, images, setIsPublished, setArtistId, createArtistAsync } = deps;
  const fullName = fullNameOf(data);

  const newFormState = await createArtistAsync(data);
  if (!newFormState.success) {
    toast.error('Failed to create artist. Please check the form for errors.');
    return;
  }

  const createdArtistId = newFormState.data?.artistId as string | undefined;
  if (!createdArtistId) {
    toast.success(<ToastContent fullName={fullName} />);
    return;
  }

  setArtistId(createdArtistId);
  if (data.publishedOn) {
    setIsPublished(true);
  }

  const imagesToUpload = pendingImages(images.images);
  if (imagesToUpload.length > 0) {
    await images.uploadImages(imagesToUpload, createdArtistId, {
      register: registerArtistImagesAction,
      mergeStrategy: 'by-index',
      onSuccess: (uploaded) =>
        toast.success(<CreatedWithImagesToast fullName={fullName} count={uploaded.length} />),
      onError: () => toast.success(<ToastContent fullName={fullName} />),
    });
  } else {
    toast.success(<ToastContent fullName={fullName} />);
  }

  artistForm.reset(data);
  images.resetImagesReordered();
};

/** Guard the form ref then dispatch to the create/update submit path. */
const runArtistSubmit = async (
  formEl: HTMLFormElement | null,
  artistId: string | null,
  data: ArtistFormData,
  deps: SubmitArtistDeps
): Promise<void> => {
  if (!formEl) {
    error('ArtistForm: Form reference is null on submit.');
    toast.error('Please refresh the page and try again, or check back later.');
    return;
  }

  if (artistId) {
    await submitArtistUpdate(artistId, data, deps);
  } else {
    await submitArtistCreate(data, deps);
  }
};

export const ArtistForm = ({
  artistId: initialArtistId,
  returnTo,
}: ArtistFormProps): React.ReactElement => {
  const [isTransitionPending, startTransition] = useTransition();
  const { createArtistAsync, isCreatingArtist } = useCreateArtistMutation();
  const { updateArtistAsync, isUpdatingArtist } = useUpdateArtistMutation();
  const { archiveArtistAsync } = useArchiveArtistMutation();
  // Re-hosted bio images (existing + freshly generated) offered in the
  // rich-text editor's insert-image picker, alongside uploaded images.
  const [bioPickerImages, setBioPickerImages] = useState<RichTextEditorImage[]>([]);
  // artistId will be set after artist creation or from URL param for persisting image reordering
  const [artistId, setArtistId] = useState<string | null>(initialArtistId || null);
  // Track if artist is published (publishedOn date exists)
  const [isPublished, setIsPublished] = useState(false);
  // Track if we're in edit mode (after artist creation or when loading existing artist)
  const isEditMode = artistId !== null;
  const hasNavigatedToEditRef = useRef(false);
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  const handleUploadBioImage = useCallback<RichTextEditorUploadHandler>(
    async (file, meta) => {
      if (!artistId) return null;
      const result = await uploadBioImage(file, {
        artistId,
        attribution: meta.attribution,
        title: meta.title,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to upload image');
        return null;
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.artists.bioGeneration(artistId),
      });
      return { url: result.data.url, alt: result.data.alt ?? null };
    },
    [artistId, queryClient]
  );

  const images = useImageOperations({
    entityType: 'artists',
    entityId: artistId,
    reorderAction: reorderArtistImagesAction,
    deleteAction: deleteArtistImageAction,
  });

  const bioEditorImages = useMemo(
    () => computeBioEditorImages(images.images, bioPickerImages),
    [images.images, bioPickerImages]
  );

  const artistForm = useForm<ArtistFormData>({
    resolver: zodResolver(createArtistSchema),
    defaultValues: buildArtistDefaults(user?.id),
  });
  const { control, setValue } = artistForm;

  // Fetch artist data when initialArtistId is provided. The gated hook owns the
  // request lifecycle; the effects below project its data/error into form state.
  const {
    data: artistData,
    isPending: isArtistPending,
    isError: isArtistError,
    error: artistError,
  } = useArtistQuery(initialArtistId ?? '', { enabled: !!initialArtistId });

  // In edit mode the form is "loading" until the gated query resolves; in
  // create mode there's nothing to load.
  const isLoadingArtist = !!initialArtistId && isArtistPending;

  const { setImages } = images;
  useEffect(() => {
    if (!initialArtistId || !artistData) return;

    artistForm.reset(mapArtistToFormValues(artistData, user?.id));

    if (artistData.publishedOn) {
      setIsPublished(true);
    }

    // Load existing images if any. The by-id route returns scalars + `images`
    // only (no `bioImages` relation), so there's no bio-picker hydration here.
    if (artistData.images.length > 0) {
      setImages(mapArtistImages(artistData));
    }
  }, [initialArtistId, artistData, artistForm, user?.id, setImages]);

  // Surface a load failure (edit mode only) without unmounting the form. Gate
  // on `isError` — `artistError` is defaulted to a non-null Error, so it is
  // truthy even on a successful load.
  useEffect(() => {
    if (initialArtistId && isArtistError) {
      error('Failed to fetch artist:', artistError);
      toast.error('Failed to load artist data');
    }
  }, [initialArtistId, isArtistError, artistError]);

  // After artist creation, navigate away — outside of startTransition so the router
  // navigation doesn't keep isTransitionPending true for the form submission. When a
  // `returnTo` is provided (create-from-release flow) go back there; otherwise drop
  // into the new artist's edit page.
  useEffect(() => {
    if (artistId && !initialArtistId && !hasNavigatedToEditRef.current) {
      hasNavigatedToEditRef.current = true;
      if (returnTo) {
        router.push(returnTo);
      } else {
        router.replace(`/admin/artists/${artistId}`, { scroll: false });
      }
    }
  }, [artistId, initialArtistId, returnTo, router]);

  const onSubmitArtistForm = useCallback(
    async (data: ArtistFormData): Promise<void> => {
      const deps: SubmitArtistDeps = {
        artistForm,
        images,
        isPublished,
        setIsPublished,
        setArtistId,
        createArtistAsync,
        updateArtistAsync,
      };
      startTransition(() => runArtistSubmit(formRef.current, artistId, data, deps));
    },
    [artistForm, images, artistId, isPublished, createArtistAsync, updateArtistAsync]
  );

  const isSubmitting = computeIsSubmitting({
    isCreatingArtist,
    isUpdatingArtist,
    isTransitionPending,
    isUploadingImages: images.isUploadingImages,
  });

  // Watch name fields for auto-generating slug (using useWatch for React Compiler compatibility)
  const displayName = useWatch({ control, name: 'displayName' });
  const firstName = useWatch({ control, name: 'firstName' });
  const middleName = useWatch({ control, name: 'middleName' });
  const surname = useWatch({ control, name: 'surname' });
  const akaNames = useWatch({ control, name: 'akaNames' });
  const slug = useWatch({ control, name: 'slug' });

  // firstName and surname are only required when both displayName and akaNames are empty
  const isNameRequired = computeIsNameRequired(displayName, akaNames);

  // Auto-generate slug from name fields
  useEffect(() => {
    const slugSource = deriveSlugSource(displayName, firstName, middleName, surname);
    if (slugSource) {
      artistForm.setValue('slug', generateSlug(slugSource), { shouldValidate: false });
    }
  }, [displayName, firstName, middleName, surname, artistForm]);

  // Clear slug error when the value becomes valid (lowercase alphanumeric with dashes)
  useEffect(() => {
    if (slug && isValidSlug(slug)) {
      artistForm.clearErrors('slug');
    }
  }, [slug, artistForm]);

  const handleSelectDate = useCallback(
    (dateString: string, fieldName: string): void => {
      artistForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
    },
    [artistForm]
  );

  const handleBioGenerated = useCallback(
    (content: GeneratedBioContent): void => {
      setValue('shortBio', content.shortBio, { shouldDirty: true });
      setValue('bio', content.longBio, { shouldDirty: true });
      setValue('altBio', content.altBio, { shouldDirty: true });
      if (content.genres) {
        setValue('genres', content.genres, { shouldDirty: true });
      }
      setBioPickerImages(
        content.images.map((image) => ({ url: image.url, alt: image.title ?? '' }))
      );
    },
    [setValue]
  );

  const onInvalidSubmit = useCallback((errors: Record<string, { message?: string }>): void => {
    console.error('Form validation errors:', errors);
    toast.error(formatValidationErrors(errors));
  }, []);

  const submitForm = artistForm.handleSubmit(onSubmitArtistForm, onInvalidSubmit);

  // Handler for Create & Publish (create mode) or Publish (edit mode)
  const handleClickPublishButton = useCallback(() => {
    artistForm.setValue('publishedOn', new Date().toISOString(), { shouldDirty: true });
    artistForm.handleSubmit(onSubmitArtistForm, onInvalidSubmit)();
  }, [artistForm, onSubmitArtistForm, onInvalidSubmit]);

  const isDirty = computeIsDirty(
    artistForm.formState.isDirty,
    images.imagesReordered,
    images.hasPendingImages
  );

  if (isLoadingArtist) {
    return <ArtistFormSkeleton isEditMode={!!initialArtistId} />;
  }

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        {
          anchorText: isEditMode ? 'Edit Artist' : 'Create Artist',
          url: '/admin/artists',
          isActive: true,
        },
      ]}
    >
      <div className="space-y-6">
        <ArtistFormHeader isEditMode={isEditMode} />
        <Form {...artistForm}>
          <form ref={formRef} onSubmit={submitForm} noValidate>
            <div className="space-y-6">
              <Separator />

              <ArtistNameSection control={control} isNameRequired={isNameRequired} />

              <Separator />

              <ArtistImagesSection
                images={images.images}
                isSubmitting={isSubmitting}
                onImagesChange={images.handleImagesChange}
                onReorder={images.handleReorder}
                onDelete={images.handleDeleteImage}
              />

              <Separator />

              <ArtistBioSection
                control={control}
                isEditMode={isEditMode}
                artistId={artistId}
                bioEditorImages={bioEditorImages}
                onBioGenerated={handleBioGenerated}
                onUploadImage={artistId ? handleUploadBioImage : undefined}
              />

              <Separator />

              <ArtistMusicAndDatesSection control={control} onSelectDate={handleSelectDate} />
            </div>

            <ArtistFormFooter
              isEditMode={isEditMode}
              artistId={artistId}
              isPublished={isPublished}
              isSubmitting={isSubmitting}
              isDirty={isDirty}
              onPublish={handleClickPublishButton}
              onDelete={() => archiveArtistAsync({ artistId: artistId ?? '' })}
            />
          </form>
        </Form>
      </div>
    </ZinePanel>
  );
};
