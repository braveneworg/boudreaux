/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Star, XCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { EntityDeleteButton } from '@/app/components/forms/entity-delete-button';
import { TextField } from '@/app/components/forms/fields';
import { CoverArtField } from '@/app/components/forms/fields/cover-art-field';
import { ReleaseSelect, type ReleaseOption } from '@/app/components/forms/fields/release-select';
import { Button } from '@/app/components/ui/button';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { SectionHeader } from '@/app/components/ui/section-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import {
  useCreateFeaturedArtistMutation,
  useDeleteFeaturedArtistMutation,
  useUpdateFeaturedArtistCoverArtMutation,
} from '@/app/hooks/mutations/use-featured-artist-mutations';
import { useFeaturedArtistQuery } from '@/app/hooks/use-featured-artist-query';
import { useReleaseDigitalFormatQuery } from '@/app/hooks/use-release-digital-format-query';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { generateObjectId } from '@/lib/utils/generate-object-id';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import {
  createFeaturedArtistSchema,
  type FeaturedArtistFormData,
} from '@/lib/validation/create-featured-artist-schema';
import { BreadcrumbMenu } from '@/ui/breadcrumb-menu';
import { DatePicker } from '@/ui/datepicker';

type FormFieldName = keyof FeaturedArtistFormData;

interface TrackOption {
  trackNumber: number;
  title: string | null;
  fileName: string;
}

interface FeaturedArtistFormProps {
  featuredArtistId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
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
  // Stable ID for the cover-art upload key. Uses the real ID in edit mode and
  // a freshly minted ObjectID in create mode. Same pattern as release-form so
  // re-uploads land on the canonical `cover.{ext}` key and overwrite cleanly.
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
  const [formatTracks, setFormatTracks] = useState<TrackOption[]>([]);

  // Fetch featured artist data when initialFeaturedArtistId is provided. The
  // gated hook owns the request lifecycle; the effects below project its
  // data/error into form state, preserving the original side effects.
  const {
    data: featuredArtistData,
    isPending: isFeaturedArtistPending,
    isError: isFeaturedArtistError,
    error: featuredArtistError,
  } = useFeaturedArtistQuery(initialFeaturedArtistId ?? '', {
    enabled: !!initialFeaturedArtistId,
  });

  // In edit mode the form is "loading" until the gated query resolves; in
  // create mode there's nothing to load. This flag also gates the
  // release-change effect below so it doesn't clobber the initial reset.
  const isLoadingFeaturedArtist = !!initialFeaturedArtistId && isFeaturedArtistPending;

  useEffect(() => {
    if (!initialFeaturedArtistId || !featuredArtistData) return;

    const featuredArtist = featuredArtistData;

    // Format dates for the form (YYYY-MM-DD format)
    const formatDate = (dateValue: Date | null): string => {
      if (!dateValue) return '';
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
    };

    // Reset form with fetched data
    form.reset({
      displayName: featuredArtist.displayName || '',
      description: featuredArtist.description || '',
      coverArt: featuredArtist.coverArt || '',
      position: featuredArtist.position ?? 0,
      featuredOn: formatDate(featuredArtist.featuredOn),
      featuredUntil: formatDate(featuredArtist.featuredUntil),
      digitalFormatId: featuredArtist.digitalFormatId || '',
      releaseId: featuredArtist.releaseId || '',
      featuredTrackNumber: featuredArtist.featuredTrackNumber ?? undefined,
    });

    // Set format status if editing an existing entry
    if (featuredArtist.digitalFormatId) {
      setFormatStatus('found');
    }

    // Populate derived artist data for display and CoverArtField
    const ids = featuredArtist.artists.map((a) => a.id);
    setDerivedArtistIds(ids);
    const names = featuredArtist.artists
      .map((a) => {
        if (a.displayName) return a.displayName;
        const full = `${a.firstName} ${a.surname}`.trim();
        return full || null;
      })
      .filter((n): n is string => !!n);
    setDerivedArtistNames(names);
  }, [initialFeaturedArtistId, featuredArtistData, form]);

  // Surface a load failure (edit mode only) without unmounting the form.
  useEffect(() => {
    if (initialFeaturedArtistId && isFeaturedArtistError) {
      error('Failed to fetch featured artist:', featuredArtistError);
      toast.error('Failed to load featured artist data');
    }
  }, [initialFeaturedArtistId, isFeaturedArtistError, featuredArtistError]);

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

  // The featured-track selector needs the release's MP3 320kbps format: its id
  // gates submission and its files populate the selector. Fetched reactively for
  // the selected release once the featured-artist edit load has settled.
  const {
    data: digitalFormat,
    isPending: isDigitalFormatPending,
    isError: isDigitalFormatError,
  } = useReleaseDigitalFormatQuery(watchedReleaseId ?? '', 'MP3_320KBPS', {
    enabled: !!watchedReleaseId && !isLoadingFeaturedArtist,
  });

  // Mirror the digital-format query state into the form: clear while loading or
  // when no release is selected, surface a field error when the release has no
  // MP3 320kbps format, and populate `digitalFormatId` + tracks when found.
  useEffect(() => {
    if (isLoadingFeaturedArtist) return;

    if (!watchedReleaseId) {
      setFormatStatus('idle');
      setFormatFileCount(0);
      setFormatTracks([]);
      setValue('digitalFormatId', '');
      setValue('featuredTrackNumber', undefined);
      return;
    }

    if (isDigitalFormatPending) {
      setFormatStatus('loading');
      setFormatFileCount(0);
      setFormatTracks([]);
      setValue('digitalFormatId', '');
      setValue('featuredTrackNumber', undefined);
      return;
    }

    if (!digitalFormat) {
      setFormatStatus('missing');
      form.setError('digitalFormatId', {
        type: 'manual',
        message: isDigitalFormatError
          ? 'Failed to check digital format availability.'
          : 'Selected release has no MP3 320kbps format. Please upload format files first.',
      });
      return;
    }

    setValue('digitalFormatId', digitalFormat.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setFormatStatus('found');
    setFormatFileCount(digitalFormat.files.length);
    setFormatTracks(
      [...digitalFormat.files]
        .sort((a, b) => a.trackNumber - b.trackNumber)
        .map((f) => ({
          trackNumber: f.trackNumber,
          title: f.title,
          fileName: f.fileName,
        }))
    );
    form.clearErrors('digitalFormatId');
  }, [
    isLoadingFeaturedArtist,
    watchedReleaseId,
    isDigitalFormatPending,
    isDigitalFormatError,
    digitalFormat,
    setValue,
    form,
  ]);

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

    // Trigger form validation
    const isValid = await form.trigger();
    if (!isValid) {
      const errors = form.formState.errors;
      const errorFields = Object.keys(errors);
      toast.error(`Validation failed on: ${errorFields.join(', ')}`);
      return;
    }

    // Read values from React Hook Form state instead of the DOM. Custom select
    // components (ReleaseSelect) and DatePicker don't render <input> elements with
    // name attributes, so new FormData(formRef) would miss their values.
    const values = form.getValues();

    setIsPending(true);
    try {
      if (isEditMode && featuredArtistId) {
        // In edit mode, use the PATCH API route. Build the body in a Map so the
        // dynamic field keys are assigned without object-injection risk, then
        // materialize the plain object at the JSON boundary.
        const patchEntries = new Map<string, unknown>();
        for (const [key, value] of Object.entries(values)) {
          if (value !== undefined && value !== null && value !== '') {
            patchEntries.set(
              key,
              key === 'position' || key === 'featuredTrackNumber' ? Number(value) : value
            );
          }
        }

        // Include derived artistIds so the PATCH handler can reconnect the artists relation
        if (derivedArtistIds.length > 0) {
          patchEntries.set('artistIds', derivedArtistIds);
        }

        const patchBody: Record<string, unknown> = Object.fromEntries(patchEntries);

        const response = await fetch(`/api/featured-artists/${featuredArtistId}`, {
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
      } else {
        // In create mode, use the server action via the mutation hook. The hook
        // serializes the values and appends each derived artistId individually.
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
          const generalMsg = result.errors?.general?.[0];
          const errorDetails = result.errors
            ? Object.entries(result.errors)
                .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
                .join('; ')
            : 'Unknown error';
          toast.error(generalMsg || `Failed to create featured artist: ${errorDetails}`);
        }
      }
    } catch (err) {
      error('Featured artist submission failed:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    router.push('/admin/featured-artists');
  };

  if (isLoadingFeaturedArtist) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-950-foreground">Loading featured artist...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Featured Artists', url: '/admin/featured-artists', isActive: false },
          { anchorText: isEditMode ? 'Edit' : 'New', url: '#', isActive: true },
        ]}
      />

      <div className="space-y-1">
        <SectionHeader
          icon={Star}
          title={isEditMode ? 'Edit Featured Artist' : 'Create Featured Artist'}
          helpText="Spotlight an artist and track on the landing page. Associate a release; the MP3 320kbps format is used for playback."
        />
        <p className="text-muted-foreground text-sm">
          {isEditMode
            ? 'Update the featured artist details below.'
            : 'Create a new featured artist entry to highlight on the landing page.'}
        </p>
      </div>

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="space-y-6">
            {/* Media Associations */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Media Associations</h3>
              <p className="text-zinc-950-foreground text-sm">
                Associate this featured artist with a release. The MP3 320kbps digital format is
                automatically used for audio playback.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <ReleaseSelect
                    control={control}
                    name="releaseId"
                    label="Release"
                    placeholder="Select a release..."
                    setValue={setValue}
                    onReleaseChange={handleReleaseChange}
                  />

                  {/* Digital format status indicator */}
                  {formatStatus === 'loading' && (
                    <p className="text-zinc-950-foreground text-sm">
                      Checking for MP3 320kbps format...
                    </p>
                  )}
                  {formatStatus === 'found' && (
                    <p className="flex items-center gap-1.5 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      MP3 320kbps format available ({formatFileCount}{' '}
                      {formatFileCount === 1 ? 'file' : 'files'})
                    </p>
                  )}
                  {formatStatus === 'missing' && (
                    <p className="text-destructive flex items-center gap-1.5 text-sm">
                      <XCircle className="h-4 w-4" />
                      No MP3 320kbps format found. Please upload format files first.
                    </p>
                  )}

                  {/* Featured Track selector */}
                  {formatStatus === 'found' && formatTracks.length > 0 && (
                    <FormField
                      control={control}
                      name="featuredTrackNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Featured Track (Optional)</FormLabel>
                          <Select
                            value={field.value != null ? String(field.value) : ''}
                            onValueChange={(val) => {
                              field.onChange(val ? parseInt(val, 10) : undefined);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Default (Track 1)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {formatTracks.map((track) => (
                                <SelectItem
                                  key={track.trackNumber}
                                  value={String(track.trackNumber)}
                                >
                                  {track.trackNumber}.{' '}
                                  {getTrackDisplayTitle(track.title, track.fileName)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select the track that plays first when a user clicks play. Defaults to
                            track 1.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Derived artists indicator */}
              {derivedArtistNames.length > 0 && (
                <p className="text-zinc-950-foreground text-sm">
                  Associated artists: {derivedArtistNames.join(', ')}
                </p>
              )}

              <Separator />

              {/* Display Name */}
              <TextField
                control={control}
                name="displayName"
                label="Display Name (Optional)"
                placeholder="Override display name when featured"
              />
              <p className="text-zinc-950-foreground -mt-4 text-sm">
                If not provided, the artist&apos;s default display name will be used.
              </p>

              {/* Description */}
              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A brief description for when this artist is featured..."
                        className="min-h-25"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Keep it brief. Markdown will be supported post-MVP.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Display Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Display Settings</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Lower numbers appear first in the featured list.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem className="flex flex-col">
                  <FormLabel>Featured Date</FormLabel>
                  <DatePicker
                    fieldName="featuredOn"
                    onSelect={handleDateSelect}
                    value={form.watch('featuredOn')}
                  />
                  <FormDescription>When this artist should start being featured.</FormDescription>
                  <FormMessage />
                </FormItem>

                <FormItem className="flex flex-col">
                  <FormLabel>Featured Until (Optional)</FormLabel>
                  <DatePicker
                    fieldName="featuredUntil"
                    onSelect={handleDateSelect}
                    value={form.watch('featuredUntil')}
                  />
                  <FormDescription>
                    When this artist should stop being featured. Leave blank for indefinite.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              </div>

              <CoverArtField
                control={control}
                name="coverArt"
                setValue={setValue}
                artistIds={derivedArtistIds}
                entityType="featured-artists"
                disabled={isPending}
                entityId={preGeneratedId}
                onUploadComplete={
                  featuredArtistId
                    ? async (cdnUrl) => {
                        // Edit mode only: persist the new cover art to the
                        // featured-artist row immediately (after S3 upload +
                        // variant generation + orphan sweep + CloudFront
                        // invalidation). For create mode there's no row to
                        // update yet — submit will save it then.
                        const result = await updateFeaturedArtistCoverArtAsync({
                          featuredArtistId,
                          coverArt: cdnUrl,
                        });
                        if (!result.success) {
                          throw new Error(result.error ?? 'Failed to save cover art');
                        }
                      }
                    : undefined
                }
              />
            </div>
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
