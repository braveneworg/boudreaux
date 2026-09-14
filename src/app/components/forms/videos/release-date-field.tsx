/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/app/components/ui/form';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { DatePicker } from '@/ui/datepicker';

import type { ReleaseDateLookupStatus } from './use-release-date-auto-lookup';
import type { Control } from 'react-hook-form';

interface ReleaseDateFieldProps {
  control: Control<VideoFormData>;
  onSelectDate: (dateString: string, fieldName: string) => void;
  /** The automatic lookup's state for the current title/artist pair. */
  lookupStatus?: ReleaseDateLookupStatus;
}

/** The inline hint per lookup state; idle and found show nothing. */
const LOOKUP_HINTS = new Map<ReleaseDateLookupStatus, string>([
  ['searching', 'Looking up release date…'],
  ['exhausted', 'No release date found. Set it manually.'],
]);

/**
 * The release-date picker. There is no lookup button any more: the automatic
 * lookup (`useReleaseDateAutoLookup`, composed in the form) fills an empty
 * date on its own, and this field only reports its progress in a polite live
 * region — "Looking up…" while an attempt is on the wire, "No release date
 * found" once the budget is spent. The region stays mounted (empty when
 * idle/found) so screen readers announce the transitions.
 */
export const ReleaseDateField = ({
  control,
  onSelectDate,
  lookupStatus = 'idle',
}: ReleaseDateFieldProps): React.ReactElement => (
  <FormField
    control={control}
    name="releasedOn"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Release date</FormLabel>
        <FormControl>
          <DatePicker fieldName={field.name} onSelect={onSelectDate} value={field.value} />
        </FormControl>
        <p role="status" aria-live="polite" className="text-sm text-zinc-700">
          {LOOKUP_HINTS.get(lookupStatus)}
        </p>
        <FormMessage />
      </FormItem>
    )}
  />
);
