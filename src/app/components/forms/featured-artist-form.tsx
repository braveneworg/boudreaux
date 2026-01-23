'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { TextField } from '@/app/components/forms/fields';
import ArtistMultiSelect from '@/app/components/forms/fields/artist-multi-select';
import GroupSelect from '@/app/components/forms/fields/group-select';
import ReleaseSelect from '@/app/components/forms/fields/release-select';
import TrackSelect from '@/app/components/forms/fields/track-select';
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
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createFeaturedArtistAction,
    initialFormState
  );
  const [isLoadingFeaturedArtist, setIsLoadingFeaturedArtist] = useState(!!initialFeaturedArtistId);
  const [featuredArtistId, setFeaturedArtistId] = useState<string | null>(
    initialFeaturedArtistId || null
  );
  const isEditMode = featuredArtistId !== null;
  const router = useRouter();
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
      artistIds: [],
      trackId: '',
      releaseId: '',
      groupId: '',
    },
  });
  const { control, setValue } = form;

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
          artistIds: featuredArtist.artists?.map((a: { id: string }) => a.id) || [],
          trackId: featuredArtist.trackId || '',
          releaseId: featuredArtist.releaseId || '',
          groupId: featuredArtist.groupId || '',
        });
      } catch (err) {
        error('Failed to fetch featured artist:', err);
        toast.error('Failed to load featured artist data');
      } finally {
        setIsLoadingFeaturedArtist(false);
      }
    };

    fetchFeaturedArtist();
  }, [initialFeaturedArtistId, form]);

  // Handle form submission success/failure
  useEffect(() => {
    if (formState.success && formState.data?.featuredArtistId) {
      const displayName = form.getValues('displayName');
      toast.success(<ToastContent displayName={displayName || ''} />);
      const newId =
        typeof formState.data.featuredArtistId === 'string'
          ? formState.data.featuredArtistId
          : null;
      setFeaturedArtistId(newId);
      router.push('/admin?entity=featuredArtist');
    }

    if (formState.errors?.general) {
      toast.error(formState.errors.general[0]);
    }
  }, [formState, form, router]);

  // Sync form errors with server-side validation
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

  const handleDateSelect = (dateString: string, _fieldName: string) => {
    const dateOnly = dateString.split('T')[0];
    setValue('featuredOn', dateOnly);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Trigger form validation
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    // Submit the form
    if (formRef.current) {
      const formData = new FormData(formRef.current);

      // Add artistIds to formData (they may not be in the form directly)
      const artistIds = form.getValues('artistIds');
      artistIds.forEach((id) => {
        formData.append('artistIds', id);
      });

      formAction(formData);
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
        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-6">
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
              {/* Artists Selection (Required) */}
              <ArtistMultiSelect
                control={control}
                name="artistIds"
                label={
                  <>
                    Artists <span className="text-destructive">*</span>
                  </>
                }
                placeholder="Select artists..."
                searchPlaceholder="Search for artists..."
                emptyMessage="No artists found."
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
                        className="min-h-[100px]"
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

              <Separator />

              {/* Media Associations */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Media Associations</h3>
                <p className="text-sm text-muted-foreground">
                  Optionally associate this featured artist with a track, release, or group.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <TrackSelect
                    control={control}
                    name="trackId"
                    label="Track (Optional)"
                    placeholder="Select a track..."
                    setValue={setValue}
                  />

                  <ReleaseSelect
                    control={control}
                    name="releaseId"
                    label="Release (Optional)"
                    placeholder="Select a release..."
                    setValue={setValue}
                  />
                </div>

                <GroupSelect
                  control={control}
                  name="groupId"
                  label="Group (Optional)"
                  placeholder="Select a group..."
                  setValue={setValue}
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

                <FormField
                  control={control}
                  name="coverArt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cover Art URL (Optional)</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://example.com/cover.jpg" {...field} />
                      </FormControl>
                      <FormDescription>
                        Custom cover art for this featured entry. If not provided, the track or
                        release cover will be used.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
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
