/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import CoverArtField from '@/app/components/forms/fields/cover-art-field';
import GroupSelect from '@/app/components/forms/fields/group-select';
import ReleaseSelect, { type ReleaseOption } from '@/app/components/forms/fields/release-select';
import TrackSelect, { type TrackOption } from '@/app/components/forms/fields/track-select';
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
import { Input } from '@/app/components/ui/input';
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { createFeaturedArtistAction } from '@/lib/actions/create-featured-artist-action';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import {
  createFeaturedArtistSchema,
  type FeaturedArtistFormData,
} from '@/lib/validation/create-featured-artist-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof FeaturedArtistFormData;

interface FeaturedArtistFormProps {
  featuredArtistId?: string;
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ displayName }: { displayName: string }) => (
  <>
    Featured artist <b>{displayName || 'entry'}</b> created successfully.
  </>
);

export default function FeaturedArtistForm({
  featuredArtistId: initialFeaturedArtistId,
}: FeaturedArtistFormProps) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [isPending, setIsPending] = useState(false);
  const [isLoadingFeaturedArtist, setIsLoadingFeaturedArtist] = useState(!!initialFeaturedArtistId);
  const [featuredArtistId, setFeaturedArtistId] = useState<string | null>(
    initialFeaturedArtistId || null
  );
  const isEditMode = featuredArtistId !== null;
  const router = useRouter();
  const { data: _session } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const previousReleaseIdRef = useRef<string | undefined>(undefined);
  const releaseSetByTrackRef = useRef(false);

  const form = useForm<FeaturedArtistFormData>({
    resolver: zodResolver(createFeaturedArtistSchema),
    defaultValues: {
      displayName: '',
      description: '',
      coverArt: '',
      position: 0,
      featuredOn: new Date().toISOString().split('T')[0],
      trackId: '',
      releaseId: '',
      groupId: '',
    },
  });
  const { control, setValue } = form;
  const watchedReleaseId = useWatch({ control, name: 'releaseId' }) as string | undefined;
  const [derivedArtistIds, setDerivedArtistIds] = useState<string[]>([]);
  const [derivedArtistNames, setDerivedArtistNames] = useState<string[]>([]);

  // Fetch featured artist data when initialFeaturedArtistId is provided
  useEffect(() => {
    if (!initialFeaturedArtistId) return;

    const fetchFeaturedArtist = async () => {
      try {
        setIsLoadingFeaturedArtist(true);
        const response = await fetch(`/api/featured-artists/${initialFeaturedArtistId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load featured artist');
          return;
        }

        const featuredArtist = await response.json();

        // Format dates for the form (YYYY-MM-DD format)
        const formatDate = (dateValue: string | Date | null | undefined): string => {
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
          trackId: featuredArtist.trackId || '',
          releaseId: featuredArtist.releaseId || '',
          groupId: featuredArtist.groupId || '',
        });

        // Populate derived artist data for display and CoverArtField
        const ids = featuredArtist.artists?.map((a: { id: string }) => a.id) || [];
        setDerivedArtistIds(ids);
        const names =
          featuredArtist.artists
            ?.map((a: { displayName?: string }) => a.displayName)
            .filter((n: string | undefined): n is string => !!n) ?? [];
        setDerivedArtistNames(names);
      } catch (err) {
        error('Failed to fetch featured artist:', err);
        toast.error('Failed to load featured artist data');
      } finally {
        setIsLoadingFeaturedArtist(false);
      }
    };

    fetchFeaturedArtist();
  }, [initialFeaturedArtistId, form]);

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

  // Clear trackId when releaseId changes to prevent inconsistent associations.
  // Skip if the releaseId change was triggered by selecting a track (handleTrackChange),
  // since in that case we want to keep the track the user just chose.
  useEffect(() => {
    // Skip on initial render (when previousReleaseIdRef is undefined)
    if (previousReleaseIdRef.current === undefined) {
      previousReleaseIdRef.current = watchedReleaseId;
      return;
    }

    // Skip if loading featured artist data (form is being populated)
    if (isLoadingFeaturedArtist) {
      return;
    }

    // If releaseId changed, clear trackId only when the user changed the release directly
    if (previousReleaseIdRef.current !== watchedReleaseId) {
      if (releaseSetByTrackRef.current) {
        // Release was set by handleTrackChange — keep the track
        releaseSetByTrackRef.current = false;
      } else {
        setValue('trackId', '');
      }
      previousReleaseIdRef.current = watchedReleaseId;
    }
  }, [watchedReleaseId, setValue, isLoadingFeaturedArtist]);

  const handleDateSelect = (dateString: string, _fieldName: string) => {
    const dateOnly = dateString.split('T')[0];
    setValue('featuredOn', dateOnly);
  };

  const handleTrackChange = (track: TrackOption | null) => {
    const release = track?.releaseTracks?.[0]?.release;
    const releaseId = release?.id ?? '';
    // Flag that this releaseId change originated from a track selection,
    // so the useEffect above does not clear the trackId the user just chose.
    releaseSetByTrackRef.current = true;
    setValue('releaseId', releaseId, {
      shouldDirty: true,
      shouldValidate: true,
    });

    // Derive artistIds from track-level artists first, then fall back to
    // release-level artists (tracks often lack TrackArtist entries).
    if (track?.artists && track.artists.length > 0) {
      const ids = track.artists.map((a) => a.artist.id);
      const names = track.artists.map((a) => a.artist.displayName).filter((n): n is string => !!n);
      setDerivedArtistIds(ids);
      setDerivedArtistNames(names);
    } else if (release?.artistReleases && release.artistReleases.length > 0) {
      const ids = release.artistReleases.map((ar) => ar.artist.id);
      const names = release.artistReleases
        .map((ar) => ar.artist.displayName)
        .filter((n): n is string => !!n);
      setDerivedArtistIds(ids);
      setDerivedArtistNames(names);
    } else if (!track) {
      setDerivedArtistIds([]);
      setDerivedArtistNames([]);
    }
  };

  const handleReleaseChange = (release: ReleaseOption | null) => {
    // Only derive artists from release when it's a direct user selection
    // (not triggered by track selection, which handles its own artist derivation)
    if (releaseSetByTrackRef.current) return;

    if (release?.artistReleases && release.artistReleases.length > 0) {
      const ids = release.artistReleases.map((ar) => ar.artist.id);
      const names = release.artistReleases
        .map((ar) => ar.artist.displayName)
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

    // Build FormData from React Hook Form state instead of the DOM.
    // Custom select components (TrackSelect, ReleaseSelect, GroupSelect)
    // and DatePicker don't render <input> elements with name attributes,
    // so new FormData(formRef) would miss their values.
    const values = form.getValues();
    const formData = new FormData();

    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    }

    // Append derived artistIds individually (server action uses getAll('artistIds'))
    derivedArtistIds.forEach((id) => {
      formData.append('artistIds', id);
    });

    setIsPending(true);
    try {
      const result = await createFeaturedArtistAction(formState, formData);
      setFormState(result);

      if (result.success && result.data?.featuredArtistId) {
        const displayName = form.getValues('displayName');
        toast.success(<ToastContent displayName={displayName || ''} />);
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
    } catch (err) {
      error('Featured artist submission failed:', err);
      toast.error('An unexpected error occurred while saving.');
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    router.push('/admin?entity=featuredArtist');
  };

  if (isLoadingFeaturedArtist) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading featured artist...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Featured Artists', url: '/admin?entity=featuredArtist', isActive: false },
          { anchorText: isEditMode ? 'Edit' : 'New', url: '#', isActive: true },
        ]}
      />

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {isEditMode ? 'Edit Featured Artist' : 'Create Featured Artist'}
              </CardTitle>
              <CardDescription>
                {isEditMode
                  ? 'Update the featured artist details below.'
                  : 'Create a new featured artist entry to highlight on the landing page.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Media Associations */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Media Associations</h3>
                <p className="text-sm text-muted-foreground">
                  Associate this featured artist with a track and release. Optionally associate with
                  a group. Artists are automatically derived from the selected track or release.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <TrackSelect
                    control={control}
                    name="trackId"
                    label="Track"
                    placeholder="Select a track..."
                    setValue={setValue}
                    onTrackChange={handleTrackChange}
                    releaseId={watchedReleaseId || undefined}
                  />

                  <ReleaseSelect
                    control={control}
                    name="releaseId"
                    label="Release"
                    placeholder="Select a release..."
                    setValue={setValue}
                    onReleaseChange={handleReleaseChange}
                  />
                </div>

                {/* Derived artists indicator */}
                {derivedArtistNames.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Associated artists: {derivedArtistNames.join(', ')}
                  </p>
                )}

                <GroupSelect
                  control={control}
                  name="groupId"
                  label="Group (Optional)"
                  placeholder="Select a group..."
                  setValue={setValue}
                />

                <Separator />

                {/* Display Name */}
                <TextField
                  control={control}
                  name="displayName"
                  label="Display Name (Optional)"
                  placeholder="Override display name when featured"
                />
                <p className="text-sm text-muted-foreground -mt-4">
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
                    <DatePicker fieldName="featuredOn" onSelect={handleDateSelect} />
                    <FormDescription>When this artist should start being featured.</FormDescription>
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
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Featured Artist'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
