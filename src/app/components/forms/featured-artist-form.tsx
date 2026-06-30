/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { EntityDeleteButton } from '@/app/components/forms/entity-delete-button';
import type { ReleaseOption } from '@/app/components/forms/fields/release-select';
import { Button } from '@/app/components/ui/button';
import { Form } from '@/app/components/ui/form';
import { Separator } from '@/app/components/ui/separator';
import {
  useCreateFeaturedArtistMutation,
  useDeleteFeaturedArtistMutation,
  useUpdateFeaturedArtistCoverArtMutation,
} from '@/app/hooks/mutations/use-featured-artist-mutations';
import { useSession } from '@/hooks/use-session';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { generateObjectId } from '@/lib/utils/generate-object-id';
import {
  createFeaturedArtistSchema,
  type FeaturedArtistFormData,
} from '@/lib/validation/create-featured-artist-schema';

import { DisplaySettingsSection } from './sections/display-settings-section';
import { FeaturedArtistFormHeader } from './sections/featured-artist-form-header';
import { MediaAssociationsSection } from './sections/media-associations-section';
import { useDigitalFormatSync } from './sections/use-digital-format-sync';
import { useFeaturedArtistFormLoad } from './sections/use-featured-artist-form-load';

type FormFieldName = keyof FeaturedArtistFormData;

interface FeaturedArtistFormProps {
  featuredArtistId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

/**
 * Builds the PATCH payload for an edit submission: drops empty values, coerces
 * numeric fields, and attaches derived artist IDs. Extracted as a pure helper to
 * keep the edit handler under the cyclomatic-complexity ceiling.
 */
const buildPatchBody = (
  values: FeaturedArtistFormData,
  derivedArtistIds: string[]
): Record<string, unknown> => {
  const patchEntries = new Map<string, unknown>();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      const isNumericField = key === 'position' || key === 'featuredTrackNumber';
      patchEntries.set(key, isNumericField ? Number(value) : value);
    }
  }
  if (derivedArtistIds.length > 0) {
    patchEntries.set('artistIds', derivedArtistIds);
  }
  return Object.fromEntries(patchEntries);
};

/**
 * Composes the toast message for a failed create submission from the server
 * error map. Extracted as a pure helper to keep the create handler under the
 * cyclomatic-complexity ceiling.
 */
const buildCreateErrorMessage = (errors: FormState['errors']): string => {
  const generalMsg = errors?.general?.[0];
  if (generalMsg) return generalMsg;
  const errorDetails = errors
    ? Object.entries(errors)
        .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
        .join('; ')
    : 'Unknown error';
  return `Failed to create featured artist: ${errorDetails}`;
};

const ToastContent = ({
  displayName,
  isEditMode,
}: {
  displayName: string;
  isEditMode: boolean;
}) => (
  <>
    Featured artist <b>{displayName || 'entry'}</b> {isEditMode ? 'updated' : 'created'}{' '}
    successfully.
  </>
);

export const FeaturedArtistForm = ({
  featuredArtistId: initialFeaturedArtistId,
}: FeaturedArtistFormProps) => {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isPending, setIsPending] = useState(false);
  const [featuredArtistId, setFeaturedArtistId] = useState<string | null>(
    initialFeaturedArtistId || null
  );
  const [preGeneratedId] = useState<string>(() => initialFeaturedArtistId ?? generateObjectId());
  const isEditMode = featuredArtistId !== null;
  const router = useRouter();
  const { createFeaturedArtistAsync } = useCreateFeaturedArtistMutation();
  const { updateFeaturedArtistCoverArtAsync } = useUpdateFeaturedArtistCoverArtMutation();
  const { deleteFeaturedArtistAsync } = useDeleteFeaturedArtistMutation();
  const { data: _session } = useSession();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FeaturedArtistFormData>({
    resolver: zodResolver(createFeaturedArtistSchema),
    defaultValues: {
      displayName: '',
      description: '',
      coverArt: '',
      position: 0,
      featuredOn: new Date().toISOString().split('T')[0],
      featuredUntil: '',
      digitalFormatId: '',
      releaseId: '',
    },
  });
  const { control, setValue } = form;
  const watchedReleaseId = useWatch({ control, name: 'releaseId' }) as string | undefined;
  const [derivedArtistIds, setDerivedArtistIds] = useState<string[]>([]);
  const [derivedArtistNames, setDerivedArtistNames] = useState<string[]>([]);
  const [formatStatus, setFormatStatus] = useState<'idle' | 'loading' | 'found' | 'missing'>(
    'idle'
  );
  const [formatFileCount, setFormatFileCount] = useState(0);
  const [formatTracks, setFormatTracks] = useState<
    { trackNumber: number; title: string | null; fileName: string }[]
  >([]);

  const isLoadingFeaturedArtist = useFeaturedArtistFormLoad(initialFeaturedArtistId, form, {
    setDerivedArtistIds,
    setDerivedArtistNames,
    setFormatStatus,
  });

  // Sync server-side field errors with React Hook Form for inline display
  useEffect(() => {
    if (formState.errors) {
      Object.entries(formState.errors).forEach(([field, messages]) => {
        if (field !== 'general' && messages && messages.length > 0) {
          form.setError(field as FormFieldName, {
            type: 'server',
            message: messages[0],
          });
        }
      });
    }
  }, [formState.errors, form]);

  useDigitalFormatSync(watchedReleaseId, isLoadingFeaturedArtist, form, {
    setFormatStatus,
    setFormatFileCount,
    setFormatTracks,
  });

  const handleDateSelect = (dateString: string, fieldName: string) => {
    const dateOnly = dateString ? dateString.split('T')[0] : '';
    setValue(fieldName as FormFieldName, dateOnly);
  };

  const handleReleaseChange = (release: ReleaseOption | null) => {
    if (release?.artistReleases && release.artistReleases.length > 0) {
      const ids = release.artistReleases.map((ar) => ar.artist.id);
      const names = release.artistReleases
        .map((ar) => {
          if (ar.artist.displayName) return ar.artist.displayName;
          const first = ar.artist.firstName ?? '';
          const last = ar.artist.surname ?? '';
          const full = `${first} ${last}`.trim();
          return full || null;
        })
        .filter((n): n is string => !!n);
      setDerivedArtistIds(ids);
      setDerivedArtistNames(names);
    } else if (!release) {
      setDerivedArtistIds([]);
      setDerivedArtistNames([]);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const errorFields = Object.keys(errors);
      toast.error(`Validation failed on: ${errorFields.join(', ')}`);
      return;
    }
    const values = form.getValues();
    setIsPending(true);
    try {
      await handleFormSubmit(values);
    } catch (err) {
      error('Featured artist submission failed:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsPending(false);
    }
  };

  const handleFormSubmit = async (values: FeaturedArtistFormData) => {
    if (isEditMode && featuredArtistId) {
      await handleEditSubmit(values, featuredArtistId);
    } else {
      await handleCreateSubmit(values);
    }
  };

  const handleEditSubmit = async (values: FeaturedArtistFormData, id: string) => {
    const patchBody = buildPatchBody(values, derivedArtistIds);
    const response = await fetch(`/api/featured-artists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
    if (response.ok) {
      const displayName = form.getValues('displayName');
      toast.success(<ToastContent displayName={displayName || ''} isEditMode />);
      router.push('/admin?entity=featuredArtist');
    } else {
      const errorData = await response.json();
      toast.error(errorData.error || 'Failed to update featured artist');
    }
  };

  const handleCreateSubmit = async (values: FeaturedArtistFormData) => {
    const result = await createFeaturedArtistAsync({ ...values, artistIds: derivedArtistIds });
    setFormState(result);
    if (result.success && result.data?.featuredArtistId) {
      const displayName = form.getValues('displayName');
      toast.success(<ToastContent displayName={displayName || ''} isEditMode={false} />);
      const newId =
        typeof result.data.featuredArtistId === 'string' ? result.data.featuredArtistId : null;
      setFeaturedArtistId(newId);
      router.push('/admin?entity=featuredArtist');
    } else if (!result.success) {
      toast.error(buildCreateErrorMessage(result.errors));
    }
  };

  const handleCancel = () => {
    router.push('/admin/featured-artists');
  };

  const handleUploadComplete = featuredArtistId
    ? async (cdnUrl: string) => {
        const result = await updateFeaturedArtistCoverArtAsync({
          featuredArtistId,
          coverArt: cdnUrl,
        });
        if (!result.success) {
          throw new Error(result.error ?? 'Failed to save cover art');
        }
      }
    : undefined;

  if (isLoadingFeaturedArtist) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-950">Loading featured artist...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeaturedArtistFormHeader isEditMode={isEditMode} />

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="space-y-6">
            <MediaAssociationsSection
              control={control}
              setValue={setValue}
              formatStatus={formatStatus}
              formatFileCount={formatFileCount}
              formatTracks={formatTracks}
              derivedArtistNames={derivedArtistNames}
              onReleaseChange={handleReleaseChange}
            />

            <Separator />

            <DisplaySettingsSection
              control={control}
              setValue={setValue}
              form={form}
              isPending={isPending}
              derivedArtistIds={derivedArtistIds}
              preGeneratedId={preGeneratedId}
              featuredArtistId={featuredArtistId}
              onDateSelect={handleDateSelect}
              onUploadComplete={handleUploadComplete}
            />
          </div>

          <div className="flex justify-between pt-6">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
                Cancel
              </Button>
              {isEditMode && featuredArtistId && (
                <EntityDeleteButton
                  label="Delete Featured Artist"
                  title="Delete this featured artist?"
                  description="This permanently removes the featured artist entry and cannot be undone."
                  successMessage="Featured artist deleted successfully"
                  failureMessage="Failed to delete featured artist"
                  redirectTo="/admin/featured-artists"
                  disabled={isPending}
                  onDelete={() => deleteFeaturedArtistAsync({ featuredArtistId })}
                />
              )}
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Featured Artist'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
