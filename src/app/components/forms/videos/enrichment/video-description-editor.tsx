/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Textarea } from '@/app/components/ui/textarea';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control } from 'react-hook-form';

interface VideoDescriptionEditorProps {
  control: Control<VideoFormData>;
}

/**
 * THE description editor: a textarea bound directly to the form's
 * `description` field, hosted by the enrichment panel (ADR-0005). It is the
 * only place a description is entered — typed here, or written here by
 * "Use this description" on a pending suggestion / the server's auto-apply.
 * Needs the surrounding `<Form>` provider like every other bound field.
 */
export const VideoDescriptionEditor = ({
  control,
}: VideoDescriptionEditorProps): React.ReactElement => (
  <FormField
    control={control}
    name="description"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Description</FormLabel>
        <FormControl>
          <Textarea
            placeholder="Video description"
            className="min-h-24"
            {...field}
            value={field.value ?? ''}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);
