/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { ArtistMultiSelect } from '@/app/components/forms/fields/artist-multi-select';
import { CoverArtField } from '@/app/components/forms/fields/cover-art-field';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface ReleaseBasicInfoSectionProps {
  control: Control<ReleaseFormData>;
  setValue: UseFormSetValue<ReleaseFormData>;
  isSubmitting: boolean;
  releaseId: string | null;
  preGeneratedId: string;
  watchedArtistIds: string[];
  onSelectDate: (dateString: string, fieldName: string) => void;
  onCoverArtUploadComplete: ((cdnUrl: string) => Promise<void>) | undefined;
}

export const ReleaseBasicInfoSection = ({
  control,
  setValue,
  isSubmitting,
  releaseId,
  preGeneratedId,
  watchedArtistIds,
  onSelectDate,
  onCoverArtUploadComplete,
}: ReleaseBasicInfoSectionProps): React.ReactElement => (
  <section className="space-y-4 pt-0">
    <h2 className="font-semibold">Basic Information</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField control={control} name="title" label="Title *" placeholder="Release title" />
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
        name="suggestedPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Suggested Price (USD)</FormLabel>
            <FormControl>
              <Input
                {...field}
                type="text"
                inputMode="decimal"
                placeholder="e.g., 7.99"
                className="w-32"
                aria-label="Suggested price in dollars"
              />
            </FormControl>
            <FormDescription>Optional pay-what-you-want suggested price</FormDescription>
            <FormMessage />
          </FormItem>
        )}
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
              <DatePicker fieldName={field.name} onSelect={onSelectDate} {...field} />
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
      label="Artists"
      placeholder="Select artists..."
      searchPlaceholder="Search artists..."
      emptyMessage="No artists found."
      validateOnChange
      releaseId={releaseId}
      disabled={isSubmitting}
    />
    <CoverArtField
      control={control}
      name="coverArt"
      setValue={setValue}
      artistIds={watchedArtistIds}
      disabled={isSubmitting}
      entityId={preGeneratedId}
      onUploadComplete={onCoverArtUploadComplete}
    />
    <FormField
      control={control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Description</FormLabel>
          <FormControl>
            <Textarea placeholder="Release description" className="min-h-24" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </section>
);
