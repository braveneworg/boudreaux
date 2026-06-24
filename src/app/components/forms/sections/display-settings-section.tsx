/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

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
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control, UseFormReturn, UseFormSetValue } from 'react-hook-form';

interface DisplaySettingsSectionProps {
  control: Control<FeaturedArtistFormData>;
  setValue: UseFormSetValue<FeaturedArtistFormData>;
  form: UseFormReturn<FeaturedArtistFormData>;
  isPending: boolean;
  derivedArtistIds: string[];
  preGeneratedId: string;
  featuredArtistId: string | null;
  onDateSelect: (dateString: string, fieldName: string) => void;
  onUploadComplete: ((cdnUrl: string) => Promise<void>) | undefined;
}

export const DisplaySettingsSection = ({
  control,
  setValue,
  form,
  isPending,
  derivedArtistIds,
  preGeneratedId,
  featuredArtistId,
  onDateSelect,
  onUploadComplete,
}: DisplaySettingsSectionProps): React.ReactElement => (
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
            <FormDescription>Lower numbers appear first in the featured list.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormItem className="flex flex-col">
        <FormLabel>Featured Date</FormLabel>
        <DatePicker
          fieldName="featuredOn"
          onSelect={onDateSelect}
          value={form.watch('featuredOn')}
        />
        <FormDescription>When this artist should start being featured.</FormDescription>
        <FormMessage />
      </FormItem>

      <FormItem className="flex flex-col">
        <FormLabel>Featured Until (Optional)</FormLabel>
        <DatePicker
          fieldName="featuredUntil"
          onSelect={onDateSelect}
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
      onUploadComplete={featuredArtistId ? onUploadComplete : undefined}
    />
  </div>
);
