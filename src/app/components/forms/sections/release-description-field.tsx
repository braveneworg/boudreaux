/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { Sparkles } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Textarea } from '@/app/components/ui/textarea';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { useReleaseDescriptionLookupQuery } from '../_hooks/use-release-description-lookup-query';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface ReleaseDescriptionFieldProps {
  control: Control<ReleaseFormData>;
  setValue: UseFormSetValue<ReleaseFormData>;
  /** Display name of the album artist; the blurb must name one to generate. */
  artistName: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const buildSuccessMessage = (sources: string[]): string =>
  sources[0] ? `Generated a blurb — ${sources[0]}` : 'Generated a blurb';

/**
 * The release description textarea paired with a "Generate blurb" button.
 *
 * The blurb is the short listing copy shown beside the sleeve on `/releases`,
 * and it is the only generated prose on a release: the Release Notes below are
 * the label's own writing. Those notes are sent along as authoritative
 * grounding, so the generator builds on what Fake Four knows rather than
 * whatever the open web happens to say — and they seed an extra web search to
 * corroborate them. Needs a title and an artist; the prose must name one.
 */
export const ReleaseDescriptionField = ({
  control,
  setValue,
  artistName,
}: ReleaseDescriptionFieldProps): React.ReactElement => {
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const releasedOn = useWatch({ control, name: 'releasedOn', defaultValue: '' });
  const catalogNumber = useWatch({ control, name: 'catalogNumber', defaultValue: '' });
  const formats = useWatch({ control, name: 'formats', defaultValue: [] });
  const labelNotes = useWatch({ control, name: 'notes', defaultValue: '' });

  const releaseDate = releasedOn && ISO_DATE_PATTERN.test(releasedOn) ? releasedOn : undefined;
  const { isFetching, refetch } = useReleaseDescriptionLookupQuery(title ?? '', artistName ?? '', {
    releasedOn: releaseDate,
    catalogNumber: catalogNumber?.trim() || undefined,
    formats: formats ?? [],
    labelNotes: labelNotes ?? '',
  });

  const handleGenerate = useCallback(async (): Promise<void> => {
    try {
      const result = await refetch();
      if (result.error) {
        toast.error('Blurb generation failed');
        return;
      }
      if (!result.data) {
        toast.info('No blurb could be generated');
        return;
      }
      setValue('description', result.data.description, {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.success(buildSuccessMessage(result.data.sources));
    } catch {
      toast.error('Blurb generation failed');
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
              disabled={!title?.trim() || !artistName?.trim() || isFetching}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {isFetching ? 'Generating…' : 'Generate blurb'}
            </Button>
          </div>
          <FormControl>
            <Textarea placeholder="Release description" className="min-h-24" {...field} />
          </FormControl>
          <FormDescription>
            The short blurb shown beside the sleeve on the releases page. Generating builds on the
            Release Notes below, so write those first for a better result.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
