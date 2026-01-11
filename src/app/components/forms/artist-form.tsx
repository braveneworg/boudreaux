'use client';

import { useActionState, useCallback, useEffect, useRef, useTransition } from 'react';

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
import { Separator } from '@/app/components/ui/separator';
import { Textarea } from '@/app/components/ui/textarea';
import { createArtistAction } from '@/lib/actions/create-artist-action';
import type { FormState } from '@/lib/types/form-state';
import { error } from '@/lib/utils/console-logger';
import { createArtistSchema } from '@/lib/validation/create-artist-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';

type FormFieldName = keyof ArtistFormData;

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({ fullName }: { fullName: string }) => (
  <>
    Artist <b>{`${fullName}`}</b> created successfully.
  </>
);

export default function ArtistForm() {
  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    createArtistAction,
    initialFormState
  );
  const [isTransitionPending, startTransition] = useTransition();
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
          const newFormState = await createArtistAction(formState, formData);
          if (newFormState.success) {
            const fullName = data.displayName || `${data.firstName} ${data.surname}`.trim();

            toast.success(<ToastContent fullName={fullName} />);
          } else {
            toast.error('Failed to create artist. Please check the form for errors.');
          }
        } else {
          error('ArtistForm: Form reference is null on submit.');
          toast.error('Please refresh the page and try again, or check back later.');
        }
      });
    },
    [formState]
  );

  const isSubmitting = isPending || isTransitionPending;

  // Watch name fields for auto-generating slug (using useWatch for React Compiler compatibility)
  const displayName = useWatch({ control: artistForm.control, name: 'displayName' });
  const firstName = useWatch({ control: artistForm.control, name: 'firstName' });
  const middleName = useWatch({ control: artistForm.control, name: 'middleName' });
  const surname = useWatch({ control: artistForm.control, name: 'surname' });

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

  const handleSelectDate = (dateString: string, fieldName: string): void => {
    artistForm.setValue(fieldName as FormFieldName, dateString);
  };

  const handleClickCreateAndPublishButton = useCallback(() => {
    startTransition(async () => {
      onSubmitArtistForm(artistForm.getValues());
      artistForm.setValue('publishedOn' as keyof ArtistFormData, new Date().toISOString());
      artistForm.handleSubmit(onSubmitArtistForm)();
    });
  }, [artistForm, onSubmitArtistForm]);

  // Ensure form is fully initialized before rendering
  if (!artistForm || !artistForm.control) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Create New Artist</CardTitle>
          <CardDescription>Loading form...</CardDescription>
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
            anchorText: 'Create Artist',
            url: '/admin/artists',
            isActive: true,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Create New Artist</CardTitle>
          <CardDescription>Required fields are marked with an asterisk *</CardDescription>
        </CardHeader>
        <Form {...artistForm}>
          <form
            action={formAction}
            ref={formRef}
            onSubmit={artistForm.handleSubmit(onSubmitArtistForm)}
            noValidate
          >
            <CardContent className="space-y-6">
              <Separator />
              {/* Name Section */}
              <section className="space-y-4 pt-0">
                <h2 className="font-semibold">Name Information</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={artistForm.control}
                    name="title"
                    label="Title"
                    placeholder="e.g., Dr., Prof., DJ"
                  />
                  <TextField
                    control={artistForm.control}
                    name="firstName"
                    label="First Name *"
                    placeholder="First name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={artistForm.control}
                    name="middleName"
                    label="Middle Name"
                    placeholder="Middle name"
                  />
                  <TextField
                    control={artistForm.control}
                    name="surname"
                    label="Surname *"
                    placeholder="Last name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    control={artistForm.control}
                    name="suffix"
                    label="Suffix"
                    placeholder="e.g., Jr., Sr., III"
                  />
                  <TextField
                    control={artistForm.control}
                    name="displayName"
                    label="Display Name"
                    placeholder="Public display name (optional)"
                  />
                </div>
                <TextField
                  control={artistForm.control}
                  name="akaNames"
                  label="AKA Names"
                  placeholder="Also known as (comma-separated)"
                />
                <TextField
                  control={artistForm.control}
                  name="slug"
                  label="Slug *"
                  placeholder="url-friendly-identifier"
                />
              </section>

              <Separator />

              {/* Biography Section */}
              <section className="space-y-4">
                <h2 className="font-semibold">Biography</h2>
                <FormField
                  control={artistForm.control}
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
                  control={artistForm.control}
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
                  control={artistForm.control}
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
                  control={artistForm.control}
                  name="genres"
                  label="Genres"
                  placeholder="e.g., indie-rock, synth-pop (comma-separated)"
                />
                <TextField
                  control={artistForm.control}
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
                    control={artistForm.control}
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
                    control={artistForm.control}
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
              <Button disabled={isSubmitting} onClick={handleClickCreateAndPublishButton}>
                Create &amp; Publish
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </>
  );
}
