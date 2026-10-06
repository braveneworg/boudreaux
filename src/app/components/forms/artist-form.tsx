/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ArtistBioSection } from '@/app/components/forms/sections/artist-bio-section';
import { ArtistDatesSection } from '@/app/components/forms/sections/artist-dates-section';
import { ArtistDetailsSection } from '@/app/components/forms/sections/artist-details-section';
import { ArtistFormFooter } from '@/app/components/forms/sections/artist-form-footer';
import { ArtistFormHeader } from '@/app/components/forms/sections/artist-form-header';
import { ArtistFormSkeleton } from '@/app/components/forms/sections/artist-form-skeleton';
import { ArtistLinksSection } from '@/app/components/forms/sections/artist-links-section';
import { HidingWarningDialog } from '@/app/components/hiding-warning-dialog';
import { Form } from '@/app/components/ui/form';
import type { RichTextEditorUploadHandler } from '@/app/components/ui/rich-text-editor';
import { Separator } from '@/app/components/ui/separator';
import {
  useCreateArtistMutation,
  useUpdateArtistMutation,
} from '@/hooks/mutations/use-artist-mutations';
import { useGuardedArtistArchive } from '@/hooks/use-guarded-artist-archive';
import { useSession } from '@/hooks/use-session';
import { type FormState } from '@/lib/types/form-state';
import { toArtistLinksFormValues } from '@/lib/utils/artist-links';
import { error } from '@/lib/utils/console-logger';
import { generateSlug } from '@/lib/utils/generate-slug';
import { plainTextToBioHtml } from '@/lib/utils/plain-text-to-bio-html';
import { type GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';
import { isSlug } from '@/lib/validation/primitives';
import { ZinePanel } from '@/ui/zine-panel';

import { useApplyGeneratedBio } from './_hooks/use-apply-generated-bio';
import { useArtistPool } from './_hooks/use-artist-pool';
import { type ArtistDetail, useArtistQuery } from './_hooks/use-artist-query';
import { type SubmitMode, useEntitySubmit } from './_hooks/use-entity-submit';

import type { Control } from 'react-hook-form';

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
    links,
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
  // The stored links composite as the three editor arrays (ADR-0020).
  ...toArtistLinksFormValues(links),
});

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
  // The link arrays are always present (the update action composes `links`
  // only from all three), so a save in the moment between a create and the
  // loaded edit form never drops a link; the create action ignores them.
  ...toArtistLinksFormValues(null),
});

/** Links hang off a persisted artist row, like images (ADR-0020): edit mode only. */
const EditModeLinks = ({
  control,
  isEditMode,
}: {
  control: Control<ArtistFormData>;
  isEditMode: boolean;
}): React.ReactElement | null =>
  isEditMode ? (
    <>
      <Separator />
      <ArtistLinksSection control={control} />
    </>
  ) : null;

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
}

const computeIsSubmitting = ({
  isCreatingArtist,
  isUpdatingArtist,
  isTransitionPending,
}: SubmittingState): boolean => isCreatingArtist || isUpdatingArtist || isTransitionPending;

const fullNameOf = (data: ArtistFormData): string =>
  data.displayName || `${data.firstName} ${data.surname}`.trim();

/** Breadcrumb label for the artist form — "Edit Artist" in edit mode, "Create Artist" otherwise. */
const artistFormBreadcrumbTitle = (isEditMode: boolean): string =>
  isEditMode ? 'Edit Artist' : 'Create Artist';

export const ArtistForm = ({
  artistId: initialArtistId,
  returnTo,
}: ArtistFormProps): React.ReactElement => {
  const [isTransitionPending, startTransition] = useTransition();
  const { createArtistAsync, isCreatingArtist } = useCreateArtistMutation();
  const { updateArtistAsync, isUpdatingArtist } = useUpdateArtistMutation();
  // Archiving hides the artist: warn which public work loses the name first.
  const { archiveArtist, warning } = useGuardedArtistArchive();
  // artistId is set after artist creation or read from the URL param in edit mode.
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

  // The artist pool module: the one live pool (generated, linked and uploaded
  // rows alike) that the editors' insert-image picker offers, and the one
  // upload path — an editor upload joins the display images under the same
  // rule as a manager upload. Disabled until the artist is persisted.
  const pool = useArtistPool(artistId ?? '');

  const handleUploadBioImage = useCallback<RichTextEditorUploadHandler>(
    async (file, meta) => {
      const record = await pool.add(file, {
        alt: null,
        attribution: meta.attribution,
        title: meta.title,
      });
      if (!record) {
        toast.error(pool.addError ?? 'Failed to upload image');
        return null;
      }
      return { url: record.url, alt: record.alt ?? null };
    },
    [pool]
  );

  const bioEditorImages = useMemo(
    () => pool.images.map((image) => ({ url: image.url, alt: image.alt ?? image.title ?? '' })),
    [pool.images]
  );

  const artistForm = useForm<ArtistFormData>({
    resolver: zodResolver(createArtistSchema),
    defaultValues: buildArtistDefaults(user?.id),
  });
  const { control } = artistForm;

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

  // Load the record into the form once per artist. A refetch of the SAME
  // record (a reconnect, a cache marked stale by a finished generation) must
  // not reset the form over the admin's unsaved edits.
  const loadedArtistIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialArtistId || !artistData) return;
    if (loadedArtistIdRef.current === artistData.id) return;
    loadedArtistIdRef.current = artistData.id;

    artistForm.reset(mapArtistToFormValues(artistData, user?.id));

    if (artistData.publishedOn) {
      setIsPublished(true);
    }
  }, [initialArtistId, artistData, artistForm, user?.id]);

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

  const resetArtistForm = useCallback(
    (values: ArtistFormData): void => artistForm.reset(values),
    [artistForm]
  );

  const createArtist = useCallback(
    (values: ArtistFormData): Promise<FormState> => createArtistAsync(values),
    [createArtistAsync]
  );

  const updateArtist = useCallback(
    (id: string, values: ArtistFormData): Promise<FormState> => updateArtistAsync({ id, values }),
    [updateArtistAsync]
  );

  /**
   * Everything the artist form does once the write has landed: adopt the id the
   * create returned, flip the published flag, and announce the outcome. A create
   * always reads as "created" — only an update distinguishes publish from save.
   */
  const onArtistSubmitSuccess = useCallback(
    (newFormState: FormState, data: ArtistFormData, mode: SubmitMode): void => {
      const fullName = fullNameOf(data);

      if (mode === 'update') {
        if (data.publishedOn && !isPublished) {
          setIsPublished(true);
          toast.success(<PublishedToastContent fullName={fullName} />);
        } else {
          toast.success(<UpdatedToastContent fullName={fullName} />);
        }
        return;
      }

      const createdArtistId = newFormState.data?.artistId as string | undefined;
      if (createdArtistId) {
        setArtistId(createdArtistId);
        if (data.publishedOn) {
          setIsPublished(true);
        }
      }
      toast.success(<ToastContent fullName={fullName} />);
    },
    [isPublished]
  );

  const submitArtist = useEntitySubmit<ArtistFormData, FormState>({
    entity: 'artist',
    reset: resetArtistForm,
    create: createArtist,
    update: updateArtist,
    onSuccess: onArtistSubmitSuccess,
  });

  const onSubmitArtistForm = useCallback(
    async (data: ArtistFormData): Promise<void> => {
      startTransition(() => submitArtist(formRef.current, artistId, data));
    },
    [submitArtist, artistId]
  );

  const isSubmitting = computeIsSubmitting({
    isCreatingArtist,
    isUpdatingArtist,
    isTransitionPending,
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
    if (slug && isSlug(slug)) {
      artistForm.clearErrors('slug');
    }
  }, [slug, artistForm]);

  const handleSelectDate = useCallback(
    (dateString: string, fieldName: string): void => {
      artistForm.setValue(fieldName as FormFieldName, dateString, { shouldDirty: true });
    },
    [artistForm]
  );

  // The generation job has already persisted what it produced, so the form
  // adopts it as saved content — no scroll-down-and-Save step — except into a
  // field the admin is editing, which keeps their text and is named here.
  const applyGeneratedBio = useApplyGeneratedBio({ form: artistForm, artistId });

  const handleBioGenerated = useCallback(
    (content: GeneratedBioContent): void => {
      const { kept } = applyGeneratedBio(content);
      toast.success(
        kept.length === 0
          ? 'Bios generated and saved.'
          : `Bios generated and saved — your unsaved ${kept.join(', ')} ${kept.length === 1 ? 'edit was' : 'edits were'} kept.`
      );
    },
    [applyGeneratedBio]
  );

  const onInvalidSubmit = useCallback((errors: Record<string, { message?: string }>): void => {
    console.error('Form validation errors:', errors);
    toast.error(formatValidationErrors(errors));
  }, []);

  const submitForm = artistForm.handleSubmit(onSubmitArtistForm, onInvalidSubmit);

  // Create & Publish (create mode) or Publish (edit mode). The publish date
  // goes into the submitted values, never into the form: a publish that fails
  // validation or is refused by the server leaves nothing for a later Save to
  // send, and a successful one resets the form to the published values.
  const handleClickPublishButton = useCallback(() => {
    void artistForm.handleSubmit(
      (data) => onSubmitArtistForm({ ...data, publishedOn: new Date().toISOString() }),
      onInvalidSubmit
    )();
  }, [artistForm, onSubmitArtistForm, onInvalidSubmit]);

  const isDirty = artistForm.formState.isDirty;

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
          anchorText: artistFormBreadcrumbTitle(isEditMode),
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

              <ArtistDetailsSection control={control} isNameRequired={isNameRequired} />

              <Separator />

              <ArtistBioSection
                control={control}
                isEditMode={isEditMode}
                artistId={artistId}
                isPublished={isPublished}
                bioEditorImages={bioEditorImages}
                onBioGenerated={handleBioGenerated}
                onUploadImage={artistId ? handleUploadBioImage : undefined}
              />

              <EditModeLinks control={control} isEditMode={isEditMode} />

              <Separator />

              <ArtistDatesSection control={control} onSelectDate={handleSelectDate} />
            </div>

            <ArtistFormFooter
              isEditMode={isEditMode}
              artistId={artistId}
              isPublished={isPublished}
              canPublish={pool.chosenIds.length > 0}
              isSubmitting={isSubmitting}
              isDirty={isDirty}
              onPublish={handleClickPublishButton}
              onDelete={() => archiveArtist(artistId ?? '')}
            />
          </form>
        </Form>
      </div>
      <HidingWarningDialog {...warning} />
    </ZinePanel>
  );
};
