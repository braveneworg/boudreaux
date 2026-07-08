/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { TextField } from '@/app/components/forms/fields';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Textarea } from '@/app/components/ui/textarea';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control } from 'react-hook-form';

interface VideoMetadataSectionProps {
  control: Control<VideoFormData>;
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
  onSelectDate,
}: VideoMetadataSectionProps): React.ReactElement => (
  <section className="space-y-4">
    <h2 className="font-semibold">Details</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField control={control} name="title" label="Title" placeholder="Video title" />
      <TextField
        control={control}
        name="artist"
        label="Artist / Creator"
        placeholder="Artist or creator name"
      />
    </div>

    <CategoryField control={control} />

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField
        control={control}
        name="releasedOn"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Release date</FormLabel>
            <FormControl>
              <DatePicker fieldName={field.name} onSelect={onSelectDate} value={field.value} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="durationSeconds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration (seconds)</FormLabel>
            <FormControl>
              <Input {...field} type="number" inputMode="numeric" min={1} placeholder="e.g., 180" />
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
