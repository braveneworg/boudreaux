/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { ArtistSearchCombobox } from '@/app/components/forms/fields/artist-search-combobox';
import { FeaturedArtistsCombobox } from '@/app/components/forms/fields/featured-artists-combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Textarea } from '@/app/components/ui/textarea';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { ReleaseDateField } from './release-date-field';
import { useVideoArtistFields } from './use-video-artist-fields';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface VideoMetadataSectionProps {
  control: Control<VideoFormData>;
  setValue: UseFormSetValue<VideoFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

const CategoryField = ({ control }: { control: Control<VideoFormData> }): React.ReactElement => (
  <FormField
    control={control}
    name="category"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Category</FormLabel>
        <FormControl>
          <RadioGroup
            className="flex gap-6"
            value={field.value ?? ''}
            onValueChange={field.onChange}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="MUSIC" id="video-category-music" />
              <Label htmlFor="video-category-music">Music</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="INFORMATIONAL" id="video-category-informational" />
              <Label htmlFor="video-category-informational">Informational</Label>
            </div>
          </RadioGroup>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

export const VideoMetadataSection = ({
  control,
  setValue,
  onSelectDate,
}: VideoMetadataSectionProps): React.ReactElement => {
  const { primary, featured, setPrimary, setFeatured } = useVideoArtistFields({
    control,
    setValue,
  });

  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Details</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField control={control} name="title" label="Title" placeholder="Video title" />
        {/* A11Y: the label text "Artist / Creator" is rendered by ArtistSearchCombobox
            as a <label> element. The combobox trigger button carries role="combobox"
            and aria-expanded; screen readers announce the label via DOM proximity
            (the label wraps the button's container). The FormMessage below surfaces
            RHF validation errors for the hidden `artist` field. */}
        <div className="space-y-1">
          <ArtistSearchCombobox
            label="Artist / Creator"
            placeholder="Search or type an artist"
            value={primary}
            onChange={setPrimary}
          />
          <FormField
            control={control}
            name="artist"
            render={({ fieldState }) =>
              fieldState.error ? (
                <p className="text-destructive text-sm font-medium">{fieldState.error.message}</p>
              ) : (
                <span />
              )
            }
          />
        </div>
      </div>

      <FeaturedArtistsCombobox
        label="Featured artists"
        value={featured}
        onChange={setFeatured}
        disabled={primary.trim() === ''}
      />

      <CategoryField control={control} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReleaseDateField control={control} onSelectDate={onSelectDate} />
        <FormField
          control={control}
          name="durationSeconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (seconds)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="e.g., 180"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea placeholder="Video description" className="min-h-24" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  );
};
