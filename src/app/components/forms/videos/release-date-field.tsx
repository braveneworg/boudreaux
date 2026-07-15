/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import { useReleaseDateLookupQuery } from '@/app/hooks/use-release-date-lookup-query';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { DatePicker } from '@/ui/datepicker';

import type { Control } from 'react-hook-form';

interface ReleaseDateFieldProps {
  control: Control<VideoFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
}

const buildSuccessMessage = (releasedOn: string, confidence: string, sources: string[]): string => {
  const sourceHint = sources[0] ? ` — ${sources[0]}` : '';
  return `Found ${releasedOn} (${confidence} confidence)${sourceHint}`;
};

export const ReleaseDateField = ({
  control,
  onSelectDate,
}: ReleaseDateFieldProps): React.ReactElement => {
  const title = useWatch({ control, name: 'title', defaultValue: '' });
  const artist = useWatch({ control, name: 'artist', defaultValue: '' });
  const { isFetching, refetch } = useReleaseDateLookupQuery(title ?? '', artist ?? '');

  const handleFind = useCallback(async (): Promise<void> => {
    try {
      const result = await refetch();
      if (result.error) {
        toast.error('Release date lookup failed');
        return;
      }
      if (!result.data) {
        toast.info('No release date found');
        return;
      }
      const { releasedOn, confidence, sources } = result.data;
      onSelectDate(releasedOn, 'releasedOn');
      toast.success(buildSuccessMessage(releasedOn, confidence, sources));
    } catch {
      toast.error('Release date lookup failed');
    }
  }, [refetch, onSelectDate]);

  return (
    <FormField
      control={control}
      name="releasedOn"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Release date</FormLabel>
          <div className="flex items-end gap-2">
            <FormControl>
              <DatePicker fieldName={field.name} onSelect={onSelectDate} value={field.value} />
            </FormControl>
            <Button
              type="button"
              variant="outline"
              onClick={handleFind}
              disabled={!title?.trim() || isFetching}
            >
              {isFetching ? 'Searching…' : 'Find release date'}
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
