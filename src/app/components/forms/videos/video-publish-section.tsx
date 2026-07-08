/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control } from 'react-hook-form';

interface VideoPublishSectionProps {
  control: Control<VideoFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

/** Optional publish date — empty keeps the video a draft (mirrors release-form). */
export const VideoPublishSection = ({
  control,
  onSelectDate,
}: VideoPublishSectionProps): React.ReactElement => (
  <section className="space-y-3">
    <h2 className="font-semibold">Publishing</h2>
    <FormField
      control={control}
      name="publishedAt"
      render={({ field }) => (
        <FormItem className="max-w-xs">
          <FormLabel>Publish date</FormLabel>
          <FormControl>
            <DatePicker fieldName={field.name} onSelect={onSelectDate} value={field.value} />
          </FormControl>
          <FormDescription>Leave empty to keep as a draft.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </section>
);
