/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { Sparkles } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { Textarea } from '@/app/components/ui/textarea';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoDescriptionLookupQuery } from '../_hooks/use-video-description-lookup-query';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface DescriptionFieldProps {
  control: Control<VideoFormData>;
  setValue: UseFormSetValue<VideoFormData>;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const buildSuccessMessage = (sources: string[]): string =>
  sources[0] ? `Generated a description — ${sources[0]}` : 'Generated a description';

/**
 * The video description textarea paired with a "Generate description" button:
 * a synchronous web synthesis (~500 characters, artist named, attributed
 * press quotes when the web offers them) that fills the field for the admin
 * to review and edit before saving. Needs both a title and an artist — the
 * prose must name the artist, so the button stays disabled without one.
 */
export const DescriptionField = ({
  control,
  setValue,
}: DescriptionFieldProps): React.ReactElement => {
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });
  const releasedOn = useWatch({ control, name: 'releasedOn', defaultValue: '' });
  const releaseDate = releasedOn && ISO_DATE_PATTERN.test(releasedOn) ? releasedOn : undefined;
  const { isFetching, refetch } = useVideoDescriptionLookupQuery(
    title ?? '',
    artist ?? '',
    releaseDate
  );

  const handleGenerate = useCallback(async (): Promise<void> => {
    try {
      const result = await refetch();
      if (result.error) {
        toast.error('Description generation failed');
        return;
      }
      if (!result.data) {
        toast.info('No description could be generated');
        return;
      }
      setValue('description', result.data.description, {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.success(buildSuccessMessage(result.data.sources));
    } catch {
      toast.error('Description generation failed');
    }
  }, [refetch, setValue]);

  return (
    <FormField
      control={control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FormLabel>Description</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={!title?.trim() || !artist?.trim() || isFetching}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {isFetching ? 'Generating…' : 'Generate description'}
            </Button>
          </div>
          <FormControl>
            <Textarea placeholder="Video description" className="min-h-24" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
