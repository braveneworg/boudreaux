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
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { useReleaseNotesLookupQuery } from '../_hooks/use-release-notes-lookup-query';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface ReleaseNotesFieldProps {
  control: Control<ReleaseFormData>;
  setValue: UseFormSetValue<ReleaseFormData>;
  /** Display name of the album artist; the notes must name one to generate. */
  artistName: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Paragraphs round-trip through the textarea blank-line separated. */
const PARAGRAPH_SEPARATOR = '\n\n';

const buildSuccessMessage = (sources: string[]): string =>
  sources[0] ? `Generated release notes — ${sources[0]}` : 'Generated release notes';

/**
 * The release notes textarea paired with a "Generate notes" button: a
 * synchronous web synthesis (two or three paragraphs naming the artist, with
 * attributed press quotes when the web offers them) that fills the field for
 * the admin to review and edit before saving. Needs both a title and an
 * artist — the prose must name the artist, so the button stays disabled
 * without one. Each non-blank line is stored as its own note.
 */
export const ReleaseNotesField = ({
  control,
  setValue,
  artistName,
}: ReleaseNotesFieldProps): React.ReactElement => {
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const releasedOn = useWatch({ control, name: 'releasedOn', defaultValue: '' });
  const catalogNumber = useWatch({ control, name: 'catalogNumber', defaultValue: '' });
  const formats = useWatch({ control, name: 'formats', defaultValue: [] });

  const releaseDate = releasedOn && ISO_DATE_PATTERN.test(releasedOn) ? releasedOn : undefined;
  const { isFetching, refetch } = useReleaseNotesLookupQuery(title ?? '', artistName ?? '', {
    releasedOn: releaseDate,
    catalogNumber: catalogNumber?.trim() || undefined,
    formats: formats ?? [],
  });

  const handleGenerate = useCallback(async (): Promise<void> => {
    try {
      const result = await refetch();
      if (result.error) {
        toast.error('Release notes generation failed');
        return;
      }
      if (!result.data) {
        toast.info('No release notes could be generated');
        return;
      }
      setValue('notes', result.data.notes.join(PARAGRAPH_SEPARATOR), {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.success(buildSuccessMessage(result.data.sources));
    } catch {
      toast.error('Release notes generation failed');
    }
  }, [refetch, setValue]);

  return (
    <FormField
      control={control}
      name="notes"
      render={({ field }) => (
        <FormItem>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FormLabel>Release Notes</FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={!title?.trim() || !artistName?.trim() || isFetching}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {isFetching ? 'Generating…' : 'Generate notes'}
            </Button>
          </div>
          <FormControl>
            <Textarea
              placeholder="One paragraph per line — shown beside the release on /releases"
              className="min-h-32"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
